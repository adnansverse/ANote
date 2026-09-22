import React, { useState } from 'react';
import { ThemeMode } from '../types';
import { isSupabaseConfigured } from '../config/supabase';
import { Sun, Moon, Sparkles, Database, Bell, Trash2, CheckCircle2 } from 'lucide-react';

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
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const isCloud = isSupabaseConfigured();

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

  const cardStyle =
    theme === 'glassroom'
      ? 'glass-surface rounded-xl p-6 shadow-xl space-y-6 text-slate-100'
      : 'border border-neutral-200/80 dark:border-neutral-800 rounded-lg p-6 bg-white dark:bg-neutral-900 shadow-xs space-y-6';

  return (
    <div id="settings-view" className="flex-1 w-full max-w-lg mx-auto px-4 py-8 flex flex-col justify-center">
      <div className={cardStyle}>
        <div>
          <h2 className="text-base font-semibold tracking-tight">
            Settings
          </h2>
          <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-0.5">
            Preferences & system configuration
          </p>
        </div>

        {/* 1. Theme Selector (Glassroom, Dark, Light) */}
        <div className="space-y-2.5 pt-3 border-t border-neutral-200/50 dark:border-neutral-800/80">
          <label className="text-xs font-medium flex items-center justify-between">
            <span>Appearance Theme</span>
            <span className="text-[11px] font-mono text-cyan-400 dark:text-cyan-300">
              Default: Glassroom
            </span>
          </label>
          <div className="grid grid-cols-3 gap-2">
            {/* Glassroom (Default) */}
            <button
              id="theme-glassroom-btn"
              type="button"
              onClick={() => {
                onSetTheme('glassroom');
                showToast('Switched to Glassroom theme', 'info');
              }}
              className={`py-2.5 px-2 text-xs rounded-lg border flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-all ${
                theme === 'glassroom'
                  ? 'border-cyan-400/80 bg-cyan-950/40 text-cyan-200 font-medium shadow-[0_0_12px_rgba(6,182,212,0.25)] ring-1 ring-cyan-400/40'
                  : 'border-white/10 hover:border-white/20 text-neutral-400 hover:text-neutral-200 bg-white/5'
              }`}
            >
              <Sparkles className="w-4 h-4 text-cyan-300" />
              <span className="font-semibold text-[11px]">Glassroom</span>
              <span className="text-[9px] opacity-75 font-mono">Moody Glass</span>
            </button>

            {/* Dark */}
            <button
              id="theme-dark-btn"
              type="button"
              onClick={() => {
                onSetTheme('dark');
                showToast('Switched to Dark theme', 'info');
              }}
              className={`py-2.5 px-2 text-xs rounded-lg border flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-all ${
                theme === 'dark'
                  ? 'border-neutral-700 bg-neutral-800 text-neutral-100 font-medium shadow-xs ring-1 ring-neutral-600'
                  : 'border-neutral-200 dark:border-neutral-800 text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200'
              }`}
            >
              <Moon className="w-4 h-4" />
              <span className="font-semibold text-[11px]">Dark</span>
              <span className="text-[9px] opacity-75 font-mono">Solid Dark</span>
            </button>

            {/* Light */}
            <button
              id="theme-light-btn"
              type="button"
              onClick={() => {
                onSetTheme('light');
                showToast('Switched to Light theme', 'info');
              }}
              className={`py-2.5 px-2 text-xs rounded-lg border flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-all ${
                theme === 'light'
                  ? 'border-neutral-900 bg-neutral-100 text-neutral-900 font-medium shadow-xs ring-1 ring-neutral-300'
                  : 'border-neutral-200 dark:border-neutral-800 text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200'
              }`}
            >
              <Sun className="w-4 h-4" />
              <span className="font-semibold text-[11px]">Light</span>
              <span className="text-[9px] opacity-75 font-mono">Clean White</span>
            </button>
          </div>
        </div>

        {/* 2. Notifications */}
        <div className="flex items-center justify-between pt-4 border-t border-neutral-200/50 dark:border-neutral-800/80">
          <div>
            <div className="text-xs font-medium flex items-center gap-1.5">
              <Bell className="w-3.5 h-3.5 opacity-70" />
              <span>In-App Notifications</span>
            </div>
            <p className="text-[11px] opacity-65">
              Show subtle status toasts (Saved, Copied, Person switched)
            </p>
          </div>
          <button
            type="button"
            onClick={() => setNotificationsEnabled(!notificationsEnabled)}
            className={`w-10 h-5 flex items-center rounded-full p-1 cursor-pointer transition-colors ${
              notificationsEnabled ? 'bg-cyan-600 dark:bg-cyan-500' : 'bg-neutral-400 dark:bg-neutral-700'
            }`}
          >
            <div
              className={`bg-white w-3.5 h-3.5 rounded-full shadow-md transform transition-transform ${
                notificationsEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* 3. Direct In-Code Backend Status */}
        <div className="pt-4 border-t border-neutral-200/50 dark:border-neutral-800/80 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-medium">
              <Database className="w-3.5 h-3.5 opacity-70" />
              <span>Supabase Backend</span>
            </div>
            <span
              className={`text-[11px] font-mono px-2 py-0.5 rounded flex items-center gap-1 ${
                isCloud
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'bg-neutral-200 dark:bg-neutral-800 text-neutral-500'
              }`}
            >
              {isCloud ? (
                <>
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  <span>Configured in Code</span>
                </>
              ) : (
                <span>Local Offline Mode</span>
              )}
            </span>
          </div>
          <p className="text-[11px] text-neutral-400 dark:text-neutral-500 leading-relaxed font-sans">
            Supabase connection is managed directly in code (<code className="font-mono text-[10px] text-neutral-300 dark:text-neutral-400">src/config/supabase.ts</code>) or environment variables. No credentials needed in this settings UI.
          </p>
        </div>

        {/* 4. Local Cache Reset */}
        <div className="pt-4 border-t border-neutral-200/50 dark:border-neutral-800/80 flex items-center justify-between">
          <span className="text-xs text-neutral-400 dark:text-neutral-500">
            Local browser cache
          </span>
          <button
            id="clear-cache-btn"
            type="button"
            onClick={handleClearLocalData}
            className="text-xs text-rose-500 hover:text-rose-400 hover:underline flex items-center gap-1 cursor-pointer transition-colors"
          >
            <Trash2 className="w-3 h-3" />
            <span>Clear cache</span>
          </button>
        </div>
      </div>
    </div>
  );
};
