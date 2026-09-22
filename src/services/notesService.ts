import { getSupabaseClient, isSupabaseConfigured, formatErrorMessage } from '../config/supabase';
import { Note } from '../types';

const LOCAL_NOTES_PREFIX = 'anote_note_';
const LOCAL_NOTE_LIST_KEY = 'anote_recent_notes';

// Multi-tab sync channel
let noteBroadcastChannel: BroadcastChannel | null = null;
try {
  if (typeof BroadcastChannel !== 'undefined') {
    noteBroadcastChannel = new BroadcastChannel('anote_notes_sync');
  }
} catch {
  // Ignore
}

export function cleanSlug(input: string): string {
  if (!input) return '';
  let slug = input.trim();
  if (slug.startsWith('/')) {
    slug = slug.substring(1);
  }
  // Convert spaces to hyphens, keep alphanumeric, hyphen, underscore
  slug = slug.toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-');
  return slug;
}

export function getLocalNote(slug: string): Note | null {
  try {
    const raw = localStorage.getItem(`${LOCAL_NOTES_PREFIX}${slug}`);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {
    // Ignore error
  }
  return null;
}

export function saveLocalNote(note: Note): void {
  try {
    localStorage.setItem(`${LOCAL_NOTES_PREFIX}${note.slug}`, JSON.stringify(note));
    addToRecentNotes(note.slug);
    // Broadcast to other tabs
    if (noteBroadcastChannel) {
      noteBroadcastChannel.postMessage({ type: 'NOTE_UPDATED', note });
    }
  } catch {
    // Ignore error
  }
}

export function getRecentNotes(): string[] {
  try {
    const raw = localStorage.getItem(LOCAL_NOTE_LIST_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {
    // Ignore
  }
  return [];
}

export function addToRecentNotes(slug: string): void {
  try {
    const current = getRecentNotes().filter(s => s !== slug);
    current.unshift(slug);
    localStorage.setItem(LOCAL_NOTE_LIST_KEY, JSON.stringify(current.slice(0, 20)));
  } catch {
    // Ignore
  }
}

export function subscribeToLocalNoteUpdates(slug: string, callback: (note: Note) => void): () => void {
  if (!noteBroadcastChannel) return () => {};

  const handler = (event: MessageEvent) => {
    if (event.data?.type === 'NOTE_UPDATED' && event.data.note?.slug === slug) {
      callback(event.data.note);
    }
  };

  noteBroadcastChannel.addEventListener('message', handler);
  return () => {
    noteBroadcastChannel?.removeEventListener('message', handler);
  };
}

export async function fetchNote(slug: string): Promise<{ note: Note | null; error: string | null }> {
  const normalizedSlug = cleanSlug(slug);
  if (!normalizedSlug) {
    return { note: null, error: 'Invalid note slug.' };
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    // Local fallback
    const local = getLocalNote(normalizedSlug);
    if (local) {
      return { note: local, error: null };
    }
    // Return a newly initialized note structure
    const newNote: Note = {
      id: `local_${Date.now()}`,
      slug: normalizedSlug,
      content: '',
      visibility: 'public',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    saveLocalNote(newNote);
    return { note: newNote, error: null };
  }

  try {
    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .eq('slug', normalizedSlug)
      .maybeSingle();

    if (error) {
      console.warn('Error fetching note from Supabase:', error);
      // Fallback to local
      const local = getLocalNote(normalizedSlug);
      if (local) return { note: local, error: null };
      return { note: null, error: formatErrorMessage(error, "Couldn't load this note. Please try again.") };
    }

    if (data) {
      const note: Note = {
        id: data.id,
        slug: data.slug,
        content: data.content ?? '',
        owner_id: data.owner_id,
        visibility: data.visibility || 'public',
        created_at: data.created_at,
        updated_at: data.updated_at,
      };
      saveLocalNote(note); // cache locally
      return { note, error: null };
    }

    // Note does not exist in DB yet, create it
    const newNote: Note = {
      id: `note_${Date.now()}`,
      slug: normalizedSlug,
      content: '',
      visibility: 'public',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: inserted, error: insertError } = await supabase
      .from('notes')
      .insert({
        slug: normalizedSlug,
        content: '',
        visibility: 'public',
      })
      .select()
      .single();

    if (insertError) {
      console.warn('Error creating note on Supabase:', insertError);
      saveLocalNote(newNote);
      return { note: newNote, error: null };
    }

    const createdNote: Note = {
      id: inserted.id,
      slug: inserted.slug,
      content: inserted.content ?? '',
      owner_id: inserted.owner_id,
      visibility: inserted.visibility || 'public',
      created_at: inserted.created_at,
      updated_at: inserted.updated_at,
    };
    saveLocalNote(createdNote);
    return { note: createdNote, error: null };
  } catch (err) {
    console.error('Fetch note exception:', err);
    const local = getLocalNote(normalizedSlug);
    if (local) return { note: local, error: null };
    return { note: null, error: formatErrorMessage(err, "Couldn't load this note. Please try again.") };
  }
}

export async function saveNoteContent(slug: string, content: string): Promise<{ success: boolean; error: string | null }> {
  const normalizedSlug = cleanSlug(slug);
  const now = new Date().toISOString();

  // Always update local cache first
  const existing = getLocalNote(normalizedSlug);
  const updatedNote: Note = {
    id: existing?.id || `local_${Date.now()}`,
    slug: normalizedSlug,
    content,
    visibility: existing?.visibility || 'public',
    created_at: existing?.created_at || now,
    updated_at: now,
  };
  saveLocalNote(updatedNote);

  const supabase = getSupabaseClient();
  if (!supabase) {
    return { success: true, error: null };
  }

  try {
    const { error } = await supabase
      .from('notes')
      .upsert({
        slug: normalizedSlug,
        content,
        updated_at: now,
      }, { onConflict: 'slug' });

    if (error) {
      console.error('Supabase save error:', error);
      return { success: false, error: formatErrorMessage(error, 'Failed to save to cloud.') };
    }

    return { success: true, error: null };
  } catch (err) {
    console.error('Save exception:', err);
    return { success: false, error: formatErrorMessage(err) };
  }
}
