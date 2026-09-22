import { getSupabaseClient, isSupabaseConfigured, formatErrorMessage } from '../config/supabase';
import { Message, DirectMessage, DirectConversation, UserProfile } from '../types';

const LOCAL_MESSAGES_PREFIX = 'anote_messages_';
const LOCAL_DIRECT_CONV_KEY = 'anote_direct_conversations';
const LOCAL_DIRECT_MSGS_PREFIX = 'anote_direct_msgs_';

let chatBroadcastChannel: BroadcastChannel | null = null;
try {
  if (typeof BroadcastChannel !== 'undefined') {
    chatBroadcastChannel = new BroadcastChannel('anote_chat_sync');
  }
} catch {
  // Ignore
}

// ----------------------------------------------------
// NOTE CHAT
// ----------------------------------------------------

export function getLocalNoteMessages(noteSlug: string): Message[] {
  try {
    const raw = localStorage.getItem(`${LOCAL_MESSAGES_PREFIX}${noteSlug}`);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {
    // Ignore
  }
  return [];
}

export function saveLocalNoteMessage(message: Message): void {
  try {
    const current = getLocalNoteMessages(message.note_slug);
    // Prevent duplicate by id
    if (!current.some(m => m.id === message.id)) {
      current.push(message);
      localStorage.setItem(`${LOCAL_MESSAGES_PREFIX}${message.note_slug}`, JSON.stringify(current));
    }
    if (chatBroadcastChannel) {
      chatBroadcastChannel.postMessage({ type: 'NEW_NOTE_MESSAGE', message });
    }
  } catch {
    // Ignore
  }
}

export async function fetchNoteMessages(noteSlug: string): Promise<{ messages: Message[]; error: string | null }> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { messages: getLocalNoteMessages(noteSlug), error: null };
  }

  try {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('note_slug', noteSlug)
      .order('created_at', { ascending: true });

    if (error) {
      console.warn('Error fetching messages from Supabase, using local cache:', error);
      return { messages: getLocalNoteMessages(noteSlug), error: null };
    }

    const messages: Message[] = (data || []).map((m: any) => ({
      id: m.id,
      note_slug: m.note_slug,
      user_id: m.user_id,
      username: m.username || 'user',
      display_name: m.display_name || 'User',
      avatar_url: m.avatar_url,
      content: m.content,
      created_at: m.created_at,
    }));

    // Cache locally
    try {
      localStorage.setItem(`${LOCAL_MESSAGES_PREFIX}${noteSlug}`, JSON.stringify(messages));
    } catch {}

    return { messages, error: null };
  } catch (err) {
    return { messages: getLocalNoteMessages(noteSlug), error: formatErrorMessage(err) };
  }
}

export async function sendNoteMessage(
  noteSlug: string,
  content: string,
  user: UserProfile
): Promise<{ message: Message | null; error: string | null }> {
  if (!content.trim()) {
    return { message: null, error: 'Message cannot be empty.' };
  }

  const newMessage: Message = {
    id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    note_slug: noteSlug,
    user_id: user.id,
    username: user.username,
    display_name: user.display_name,
    avatar_url: user.avatar_url,
    content: content.trim(),
    created_at: new Date().toISOString(),
  };

  // Always save locally and broadcast
  saveLocalNoteMessage(newMessage);

  const supabase = getSupabaseClient();
  if (!supabase) {
    return { message: newMessage, error: null };
  }

  try {
    const { data, error } = await supabase
      .from('messages')
      .insert({
        note_slug: noteSlug,
        user_id: user.id,
        username: user.username,
        display_name: user.display_name,
        content: content.trim(),
      })
      .select()
      .single();

    if (error) {
      console.warn('Supabase insert message error:', error);
      // Keep local message
      return { message: newMessage, error: null };
    }

    const inserted: Message = {
      id: data.id,
      note_slug: data.note_slug,
      user_id: data.user_id,
      username: data.username || user.username,
      display_name: data.display_name || user.display_name,
      content: data.content,
      created_at: data.created_at,
    };
    saveLocalNoteMessage(inserted);
    return { message: inserted, error: null };
  } catch (err) {
    return { message: newMessage, error: null };
  }
}

export function subscribeToNoteMessages(
  noteSlug: string,
  onNewMessage: (message: Message) => void
): () => void {
  const supabase = getSupabaseClient();
  const cleanups: Array<() => void> = [];

  // Broadcast channel listener (for cross-tab)
  if (chatBroadcastChannel) {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'NEW_NOTE_MESSAGE' && event.data.message?.note_slug === noteSlug) {
        onNewMessage(event.data.message);
      }
    };
    chatBroadcastChannel.addEventListener('message', handler);
    cleanups.push(() => {
      chatBroadcastChannel?.removeEventListener('message', handler);
    });
  }

  // Supabase realtime channel
  if (supabase) {
    try {
      const channel = supabase
        .channel(`note_chat_${noteSlug}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `note_slug=eq.${noteSlug}`,
          },
          (payload: any) => {
            const m = payload.new;
            if (m) {
              const msg: Message = {
                id: m.id,
                note_slug: m.note_slug,
                user_id: m.user_id,
                username: m.username || 'user',
                display_name: m.display_name || 'User',
                avatar_url: m.avatar_url,
                content: m.content,
                created_at: m.created_at,
              };
              saveLocalNoteMessage(msg);
              onNewMessage(msg);
            }
          }
        )
        .subscribe();

      cleanups.push(() => {
        supabase.removeChannel(channel);
      });
    } catch (err) {
      console.warn('Realtime subscription error:', err);
    }
  }

  return () => {
    cleanups.forEach(fn => fn());
  };
}

// ----------------------------------------------------
// DIRECT PERSONAL CHAT
// ----------------------------------------------------

export function getLocalDirectConversations(): DirectConversation[] {
  try {
    const raw = localStorage.getItem(LOCAL_DIRECT_CONV_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

export function saveLocalDirectConversation(conv: DirectConversation): void {
  try {
    const convs = getLocalDirectConversations().filter(c => c.id !== conv.id);
    convs.unshift(conv);
    localStorage.setItem(LOCAL_DIRECT_CONV_KEY, JSON.stringify(convs));
  } catch {}
}

export function getLocalDirectMessages(convId: string): DirectMessage[] {
  try {
    const raw = localStorage.getItem(`${LOCAL_DIRECT_MSGS_PREFIX}${convId}`);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

export function saveLocalDirectMessage(message: DirectMessage): void {
  try {
    const msgs = getLocalDirectMessages(message.conversation_id);
    if (!msgs.some(m => m.id === message.id)) {
      msgs.push(message);
      localStorage.setItem(`${LOCAL_DIRECT_MSGS_PREFIX}${message.conversation_id}`, JSON.stringify(msgs));
    }

    // Update conversation last_message
    const convs = getLocalDirectConversations();
    const conv = convs.find(c => c.id === message.conversation_id);
    if (conv) {
      conv.last_message = message.content;
      conv.last_message_at = message.created_at;
      saveLocalDirectConversation(conv);
    }

    if (chatBroadcastChannel) {
      chatBroadcastChannel.postMessage({ type: 'NEW_DIRECT_MESSAGE', message });
    }
  } catch {}
}

export async function sendDirectMessage(
  conversationId: string,
  content: string,
  user: UserProfile
): Promise<{ message: DirectMessage | null; error: string | null }> {
  if (!content.trim()) {
    return { message: null, error: 'Message cannot be empty.' };
  }

  const newMsg: DirectMessage = {
    id: `dmsg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    conversation_id: conversationId,
    sender_id: user.id,
    sender_name: user.display_name,
    sender_username: user.username,
    content: content.trim(),
    created_at: new Date().toISOString(),
  };

  saveLocalDirectMessage(newMsg);

  const supabase = getSupabaseClient();
  if (!supabase) {
    return { message: newMsg, error: null };
  }

  try {
    const { data, error } = await supabase
      .from('direct_messages')
      .insert({
        conversation_id: conversationId,
        sender_id: user.id,
        sender_name: user.display_name,
        content: content.trim(),
      })
      .select()
      .single();

    if (error) {
      return { message: newMsg, error: null };
    }

    const created: DirectMessage = {
      id: data.id,
      conversation_id: data.conversation_id,
      sender_id: data.sender_id,
      sender_name: data.sender_name,
      content: data.content,
      created_at: data.created_at,
    };
    saveLocalDirectMessage(created);
    return { message: created, error: null };
  } catch {
    return { message: newMsg, error: null };
  }
}

export function subscribeToDirectMessages(
  conversationId: string,
  onNewMessage: (msg: DirectMessage) => void
): () => void {
  const cleanups: Array<() => void> = [];

  if (chatBroadcastChannel) {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'NEW_DIRECT_MESSAGE' && event.data.message?.conversation_id === conversationId) {
        onNewMessage(event.data.message);
      }
    };
    chatBroadcastChannel.addEventListener('message', handler);
    cleanups.push(() => {
      chatBroadcastChannel?.removeEventListener('message', handler);
    });
  }

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const channel = supabase
        .channel(`direct_conv_${conversationId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'direct_messages',
            filter: `conversation_id=eq.${conversationId}`,
          },
          (payload: any) => {
            const m = payload.new;
            if (m) {
              const msg: DirectMessage = {
                id: m.id,
                conversation_id: m.conversation_id,
                sender_id: m.sender_id,
                sender_name: m.sender_name || 'User',
                content: m.content,
                created_at: m.created_at,
              };
              saveLocalDirectMessage(msg);
              onNewMessage(msg);
            }
          }
        )
        .subscribe();

      cleanups.push(() => {
        supabase.removeChannel(channel);
      });
    } catch {}
  }

  return () => {
    cleanups.forEach(fn => fn());
  };
}
