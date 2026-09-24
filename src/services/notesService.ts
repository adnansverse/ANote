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
        is_locked: Boolean(data.is_locked || data.password_hash),
        password_hash: data.password_hash || null,
        password_salt: data.password_salt || null,
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
      is_locked: Boolean(inserted.is_locked || inserted.password_hash),
      password_hash: inserted.password_hash || null,
      password_salt: inserted.password_salt || null,
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
    is_locked: existing?.is_locked,
    password_hash: existing?.password_hash,
    password_salt: existing?.password_salt,
    created_at: existing?.created_at || now,
    updated_at: now,
  };
  saveLocalNote(updatedNote);

  const supabase = getSupabaseClient();
  if (!supabase) {
    return { success: true, error: null };
  }

  try {
    const payload: Record<string, any> = {
      slug: normalizedSlug,
      content,
      updated_at: now,
    };
    if (existing?.is_locked !== undefined) {
      payload.is_locked = existing.is_locked;
      payload.password_hash = existing.password_hash;
      payload.password_salt = existing.password_salt;
    }

    const { error } = await supabase
      .from('notes')
      .upsert(payload, { onConflict: 'slug' });

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

// ----------------------------------------------------
// Password Security & Note Lock Helpers
// ----------------------------------------------------

export async function hashPassword(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + '::anote_salt::' + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function generateSalt(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function isNoteUnlockedInSession(slug: string): boolean {
  try {
    return sessionStorage.getItem(`anote_unlocked_${cleanSlug(slug)}`) === 'true';
  } catch {
    return false;
  }
}

export function setNoteUnlockedInSession(slug: string): void {
  try {
    sessionStorage.setItem(`anote_unlocked_${cleanSlug(slug)}`, 'true');
  } catch {}
}

export function clearNoteUnlockedSession(slug: string): void {
  try {
    sessionStorage.removeItem(`anote_unlocked_${cleanSlug(slug)}`);
  } catch {}
}

export async function lockNote(
  slug: string,
  plainPassword: string
): Promise<{ success: boolean; error: string | null }> {
  const normalizedSlug = cleanSlug(slug);
  const salt = generateSalt();
  const passwordHash = await hashPassword(plainPassword, salt);
  const now = new Date().toISOString();

  const existing = getLocalNote(normalizedSlug);
  const updatedNote: Note = {
    id: existing?.id || `local_${Date.now()}`,
    slug: normalizedSlug,
    content: existing?.content || '',
    visibility: existing?.visibility || 'public',
    is_locked: true,
    password_hash: passwordHash,
    password_salt: salt,
    created_at: existing?.created_at || now,
    updated_at: now,
  };

  saveLocalNote(updatedNote);
  setNoteUnlockedInSession(normalizedSlug);

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      await supabase
        .from('notes')
        .upsert(
          {
            slug: normalizedSlug,
            content: updatedNote.content,
            is_locked: true,
            password_hash: passwordHash,
            password_salt: salt,
            updated_at: now,
          },
          { onConflict: 'slug' }
        );
    } catch (err) {
      console.warn('Supabase lockNote error (stored locally):', err);
    }
  }

  return { success: true, error: null };
}

export async function verifyAndUnlockNote(
  slug: string,
  plainPassword: string
): Promise<{ success: boolean; note?: Note; error?: string }> {
  const normalizedSlug = cleanSlug(slug);
  let note = getLocalNote(normalizedSlug);

  if (!note || !note.password_hash) {
    const res = await fetchNote(normalizedSlug);
    if (res.note) {
      note = res.note;
    }
  }

  if (!note || !note.is_locked || !note.password_hash || !note.password_salt) {
    // If not locked, treat as unlocked
    setNoteUnlockedInSession(normalizedSlug);
    return { success: true, note: note || undefined };
  }

  const computedHash = await hashPassword(plainPassword, note.password_salt);
  if (computedHash === note.password_hash) {
    setNoteUnlockedInSession(normalizedSlug);
    return { success: true, note };
  } else {
    return { success: false, error: 'Incorrect password.' };
  }
}

export async function removeNoteLock(
  slug: string,
  currentPassword: string
): Promise<{ success: boolean; error: string | null }> {
  const normalizedSlug = cleanSlug(slug);
  const verifyRes = await verifyAndUnlockNote(normalizedSlug, currentPassword);
  if (!verifyRes.success) {
    return { success: false, error: verifyRes.error || 'Incorrect password.' };
  }

  const existing = getLocalNote(normalizedSlug);
  const now = new Date().toISOString();
  const updatedNote: Note = {
    id: existing?.id || `local_${Date.now()}`,
    slug: normalizedSlug,
    content: existing?.content || '',
    visibility: existing?.visibility || 'public',
    is_locked: false,
    password_hash: null,
    password_salt: null,
    created_at: existing?.created_at || now,
    updated_at: now,
  };

  saveLocalNote(updatedNote);
  clearNoteUnlockedSession(normalizedSlug);

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      await supabase
        .from('notes')
        .upsert(
          {
            slug: normalizedSlug,
            content: updatedNote.content,
            is_locked: false,
            password_hash: null,
            password_salt: null,
            updated_at: now,
          },
          { onConflict: 'slug' }
        );
    } catch (err) {
      console.warn('Supabase removeNoteLock error:', err);
    }
  }

  return { success: true, error: null };
}
