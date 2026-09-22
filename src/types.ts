export type SaveState = 'saved' | 'saving' | 'offline' | 'error';

export type NoteVisibility = 'public' | 'private' | 'readonly';

export interface Note {
  id: string;
  slug: string;
  content: string;
  owner_id?: string | null;
  visibility: NoteVisibility;
  created_at: string;
  updated_at: string;
}

export interface NoteMember {
  id: string;
  note_id: string;
  user_id: string;
  permission: 'read' | 'write' | 'admin';
  created_at: string;
}

export interface Message {
  id: string;
  note_slug: string;
  user_id: string;
  username: string;
  display_name: string;
  avatar_url?: string;
  content: string;
  created_at: string;
}

export interface DirectConversation {
  id: string;
  participant_ids: string[];
  participant_names: Record<string, string>;
  participant_usernames?: Record<string, string>;
  created_at: string;
  last_message?: string;
  last_message_at?: string;
}

export interface DirectMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_name: string;
  sender_username?: string;
  content: string;
  created_at: string;
}

export interface UserProfile {
  id: string;
  username: string;
  display_name: string;
  email?: string;
  avatar_url?: string;
  created_at: string;
  is_guest?: boolean;
}

export type ThemeMode = 'light' | 'dark';

export interface ToastMessage {
  id: string;
  type: 'info' | 'success' | 'error';
  text: string;
}
