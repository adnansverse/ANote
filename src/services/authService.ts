import { getSupabaseClient, isSupabaseConfigured, formatErrorMessage } from '../config/supabase';
import { UserProfile } from '../types';

const LOCAL_USER_KEY = 'anote_local_user';

function generateRandomSlug(prefix = 'user'): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let rand = '';
  for (let i = 0; i < 4; i++) {
    rand += chars[Math.floor(Math.random() * chars.length)];
  }
  return `${prefix}_${rand}`;
}

export function getLocalUser(): UserProfile {
  try {
    const raw = localStorage.getItem(LOCAL_USER_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.id && parsed.username) {
        return parsed;
      }
    }
  } catch {
    // Ignore JSON error
  }

  const defaultUsername = generateRandomSlug('user');
  const defaultUser: UserProfile = {
    id: `guest_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    username: defaultUsername,
    display_name: defaultUsername,
    created_at: new Date().toISOString(),
    is_guest: true,
  };

  try {
    localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(defaultUser));
  } catch {
    // Ignore localStorage write errors
  }

  return defaultUser;
}

export function updateLocalUser(updates: Partial<UserProfile>): UserProfile {
  const current = getLocalUser();
  const updated: UserProfile = {
    ...current,
    ...updates,
  };
  try {
    localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(updated));
  } catch {
    // Ignore error
  }
  return updated;
}

export async function getCurrentUser(): Promise<UserProfile> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return getLocalUser();
  }

  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session?.user) {
      return getLocalUser();
    }

    const authUser = session.user;
    // Fetch profile from 'profiles' table
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authUser.id)
      .single();

    if (profile) {
      return {
        id: profile.id,
        username: profile.username || authUser.email?.split('@')[0] || 'user',
        display_name: profile.display_name || authUser.user_metadata?.display_name || 'User',
        email: authUser.email,
        avatar_url: profile.avatar_url,
        created_at: profile.created_at || authUser.created_at,
        is_guest: false,
      };
    }

    return {
      id: authUser.id,
      username: authUser.email?.split('@')[0] || 'user',
      display_name: authUser.user_metadata?.display_name || 'User',
      email: authUser.email,
      created_at: authUser.created_at,
      is_guest: false,
    };
  } catch (err) {
    console.warn('Error fetching Supabase user:', err);
    return getLocalUser();
  }
}

export async function signUpWithEmail(email: string, password: string, displayName?: string): Promise<{ user: UserProfile | null; error: string | null }> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return {
      user: null,
      error: 'Supabase is not configured yet. Please configure your Supabase URL & Anon Key in Settings to enable account registration.',
    };
  }

  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: displayName || email.split('@')[0],
          username: email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, ''),
        },
      },
    });

    if (error) {
      return { user: null, error: formatErrorMessage(error) };
    }

    if (data.user) {
      const profile: UserProfile = {
        id: data.user.id,
        username: email.split('@')[0],
        display_name: displayName || email.split('@')[0],
        email: data.user.email,
        created_at: data.user.created_at,
        is_guest: false,
      };
      return { user: profile, error: null };
    }

    return { user: null, error: 'Registration incomplete. Please check your email for confirmation if enabled.' };
  } catch (err) {
    return { user: null, error: formatErrorMessage(err) };
  }
}

export async function signInWithEmail(email: string, password: string): Promise<{ user: UserProfile | null; error: string | null }> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return {
      user: null,
      error: 'Supabase is not configured yet. Configure Supabase in Settings to use authentication.',
    };
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return { user: null, error: formatErrorMessage(error) };
    }

    if (data.user) {
      const profile = await getCurrentUser();
      return { user: profile, error: null };
    }

    return { user: null, error: 'Failed to sign in.' };
  } catch (err) {
    return { user: null, error: formatErrorMessage(err) };
  }
}

export async function signOutUser(): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      return { error: formatErrorMessage(err) };
    }
  }
  return { error: null };
}
