import React, { useState } from 'react';
import { ThemeMode } from '../types';
import {
  getStoredSupabaseConfig,
  saveSupabaseConfig,
  isSupabaseConfigured,
} from '../config/supabase';
import { Sun, Moon, Database, Bell, Trash2, Check } from 'lucide-react';

interface SettingsViewProps {
  theme: ThemeMode;
  onSetTheme: (theme: ThemeMode) => void;
  showToast: (text: string, type?: 'info' | 'success' | 'error') => void;
  onReload: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  theme,
  onSetTheme,
  showToast,
  onReload,
}) => {
  const currentConfig = getStoredSupabaseConfig();
  const [supabaseUrl, setSupabaseUrl] = useState(currentConfig?.url || '');
  const [supabaseKey, setSupabaseKey] = useState(currentConfig?.anonKey || '');
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const isCloud = isSupabaseConfigured();

  const handleSaveSupabase = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabaseUrl.trim() || !supabaseKey.trim()) {
      saveSupabaseConfig(null);
      showToast('Switched to local offline mode', 'info');
      setTimeout(() => onReload(), 400);
      return;
    }

    if (!supabaseUrl.startsWith('http://') && !supabaseUrl.startsWith('https://')) {
      showToast('Supabase URL must start with https://', 'error');
      return;
    }

    saveSupabaseConfig({
      url: supabaseUrl.trim(),
      anonKey: supabaseKey.trim(),
    });

    showToast('Supabase settings saved. Connecting...', 'success');
    setTimeout(() => onReload(), 500);
  };

  const handleClearLocalData = () => {
    if (window.confirm('Clear all locally cached notes and messages?')) {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('anote_') && k !== 'anote_theme') {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
      showToast('Local cache cleared', 'info');
      setTimeout(() => onReload(), 500);
    }
  };

  return (
    <div id="settings-view" className="flex-1 w-full max-w-lg mx-auto px-4 py-8 flex flex-col justify-center">
      <div className="border border-neutral-200/80 dark:border-neutral-800 rounded-lg p-6 bg-white dark:bg-neutral-900 shadow-xs space-y-6">
        <div>
          <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
            Settings
          </h2>
        </div>

        {/* 1. Theme */}
        <div className="space-y-2 pt-2 border-t border-neutral-100 dark:border-neutral-800">
          <label className="text-xs font-medium text-neutral-800 dark:text-neutral-200 flex items-center gap-2">
            <span>Theme</span>
          </label>
          <div className="flex gap-2">
            <button
              id="theme-light-btn"
              type="button"
              onClick={() => onSetTheme('light')}
              className={`flex-1 py-2 px-3 text-xs rounded-md border flex items-center justify-center gap-2 cursor-pointer transition-colors ${
                theme === 'light'
                  ? 'border-neutral-900 dark:border-neutral-100 font-medium bg-neutral-100 text-neutral-900'
                  : 'border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400'
              }`}
            >
              <Sun className="w-3.5 h-3.5" />
              <span>Light</span>
            </button>
            <button
              id="theme-dark-btn"
              type="button"
              onClick={() => onSetTheme('dark')}
              className={`flex-1 py-2 px-3 text-xs rounded-md border flex items-center justify-center gap-2 cursor-pointer transition-colors ${
                theme === 'dark'
                  ? 'border-neutral-900 dark:border-neutral-100 font-medium bg-neutral-800 text-neutral-100'
                  : 'border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400'
              }`}
            >
              <Moon className="w-3.5 h-3.5" />
              <span>Dark</span>
            </button>
          </div>
        </div>

        {/* 2. Notifications */}
        <div className="flex items-center justify-between pt-4 border-t border-neutral-100 dark:border-neutral-800">
          <div>
            <div className="text-xs font-medium text-neutral-800 dark:text-neutral-200 flex items-center gap-1.5">
              <Bell className="w-3.5 h-3.5 text-neutral-500" />
              <span>In-App Notifications</span>
            </div>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
              Show brief status toasts (Saved, Copied, Message sent)
            </p>
          </div>
          <button
            type="button"
            onClick={() => setNotificationsEnabled(!notificationsEnabled)}
            className={`w-10 h-5 flex items-center rounded-full p-1 cursor-pointer transition-colors ${
              notificationsEnabled ? 'bg-neutral-900 dark:bg-neutral-100' : 'bg-neutral-300 dark:bg-neutral-700'
            }`}
          >
            <div
              className={`bg-white dark:bg-neutral-900 w-3.5 h-3.5 rounded-full shadow-md transform transition-transform ${
                notificationsEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* 3. Cloud Backend / Supabase Configuration */}
        <div className="space-y-3 pt-4 border-t border-neutral-100 dark:border-neutral-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-medium text-neutral-800 dark:text-neutral-200">
              <Database className="w-3.5 h-3.5 text-neutral-500" />
              <span>Supabase Connection</span>
            </div>
            <span
              className={`text-[11px] font-mono px-2 py-0.5 rounded ${
                isCloud
                  ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400'
                  : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500'
              }`}
            >
              {isCloud ? 'Connected' : 'Offline / Local'}
            </span>
          </div>

          <form onSubmit={handleSaveSupabase} className="space-y-2">
            <div>
              <label htmlFor="settings-supabase-url" className="block text-[11px] text-neutral-500 mb-1 font-mono">
                Project URL
              </label>
              <input
                id="settings-supabase-url"
                type="text"
                placeholder="https://your-project.supabase.co"
                value={supabaseUrl}
                onChange={(e) => setSupabaseUrl(e.target.value)}
                className="w-full px-3 py-1.5 text-xs font-mono bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded text-neutral-900 dark:text-neutral-100 placeholder-neutral-400"
              />
            </div>
            <div>
              <label htmlFor="settings-supabase-key" className="block text-[11px] text-neutral-500 mb-1 font-mono">
                Anon / Public Key
              </label>
              <input
                id="settings-supabase-key"
                type="password"
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6..."
                value={supabaseKey}
                onChange={(e) => setSupabaseKey(e.target.value)}
                className="w-full px-3 py-1.5 text-xs font-mono bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded text-neutral-900 dark:text-neutral-100 placeholder-neutral-400"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button
                id="save-supabase-btn"
                type="submit"
                className="flex-1 py-1.5 bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-neutral-200 text-white dark:text-neutral-900 text-xs font-medium rounded transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Save & Connect</span>
              </button>
              {isCloud && (
                <button
                  id="disconnect-supabase-btn"
                  type="button"
                  onClick={() => {
                    setSupabaseUrl('');
                    setSupabaseKey('');
                    saveSupabaseConfig(null);
                    showToast('Disconnected from Supabase', 'info');
                    setTimeout(() => onReload(), 400);
                  }}
                  className="px-3 py-1.5 border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 text-xs rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
                >
                  Disconnect
                </button>
              )}
            </div>
          </form>
        </div>

        {/* 4. Local Storage Reset */}
        <div className="pt-4 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
          <span className="text-xs text-neutral-600 dark:text-neutral-400">
            Local device cache
          </span>
          <button
            id="clear-cache-btn"
            type="button"
            onClick={handleClearLocalData}
            className="text-xs text-red-600 dark:text-red-400 hover:underline flex items-center gap-1 cursor-pointer"
          >
            <Trash2 className="w-3 h-3" />
            <span>Clear cache</span>
          </button>
        </div>
      </div>
    </div>
  );
};
