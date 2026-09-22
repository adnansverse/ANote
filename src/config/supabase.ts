import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

const STORAGE_KEY = 'anote_supabase_config';

export function getStoredSupabaseConfig(): SupabaseConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.url && parsed.anonKey) {
        return parsed;
      }
    }
  } catch {
    // Ignore JSON parsing errors
  }

  const envUrl = import.meta.env.VITE_SUPABASE_URL;
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (envUrl && envKey && typeof envUrl === 'string' && typeof envKey === 'string') {
    return { url: envUrl.trim(), anonKey: envKey.trim() };
  }

  return null;
}

export function saveSupabaseConfig(config: SupabaseConfig | null): void {
  if (!config || !config.url || !config.anonKey) {
    localStorage.removeItem(STORAGE_KEY);
  } else {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      url: config.url.trim(),
      anonKey: config.anonKey.trim(),
    }));
  }
  // Re-initialize client
  clientInstance = null;
}

let clientInstance: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (clientInstance) {
    return clientInstance;
  }

  const config = getStoredSupabaseConfig();
  if (config && config.url && config.anonKey && config.url.startsWith('http')) {
    try {
      clientInstance = createClient(config.url, config.anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
        },
      });
      return clientInstance;
    } catch (err) {
      console.error('Failed to initialize Supabase client:', err);
      return null;
    }
  }

  return null;
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseClient() !== null;
}

/**
 * Human-friendly error translation as specified in requirements
 */
export function formatErrorMessage(err: unknown, defaultMessage = 'An unexpected error occurred.'): string {
  if (!err) return defaultMessage;

  const message = typeof err === 'object' && err && 'message' in err
    ? String(err.message)
    : String(err);

  const code = typeof err === 'object' && err && 'code' in err
    ? String(err.code)
    : '';

  if (code === '23505' || message.includes('duplicate key') || message.includes('already exists')) {
    return 'This note name is already in use.';
  }

  if (message.includes('Failed to fetch') || message.includes('NetworkError') || message.includes('network')) {
    return "Couldn't connect to the server. Working in offline mode.";
  }

  if (message.includes('JWT') || message.includes('unauthorized') || message.includes('token')) {
    return 'Your session has expired. Please sign in again.';
  }

  if (message.includes('Row-level security policy') || message.includes('permission denied')) {
    return "You don't have permission to perform this action.";
  }

  return message || defaultMessage;
}
