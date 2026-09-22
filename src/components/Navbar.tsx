import React from 'react';
import { Sun, Moon, Sparkles, Cloud, CloudOff } from 'lucide-react';
import { isSupabaseConfigured } from '../config/supabase';
import { ThemeMode } from '../types';

interface NavbarProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentPath,
  onNavigate,
  theme,
  onToggleTheme,
}) => {
  const isCloud = isSupabaseConfigured();

  const navItems = [
    { label: 'Notes', path: '/' },
    { label: 'Profile', path: '/profile' },
    { label: 'Settings', path: '/settings' },
  ];

  const headerBgClass =
    theme === 'glassroom'
      ? 'border-b border-white/10 bg-slate-900/60 backdrop-blur-md text-slate-100'
      : theme === 'dark'
      ? 'border-b border-neutral-800/80 bg-neutral-900/90 backdrop-blur-xs text-neutral-100'
      : 'border-b border-neutral-200/70 bg-white/90 backdrop-blur-xs text-neutral-900';

  return (
    <header id="main-nav" className={`w-full sticky top-0 z-30 transition-all ${headerBgClass}`}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-13 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <button
            id="brand-logo"
            type="button"
            onClick={() => onNavigate('/')}
            className="text-base font-semibold tracking-tight hover:opacity-85 transition-opacity cursor-pointer flex items-center gap-2"
          >
            <span>ANote</span>
          </button>

          <nav id="nav-links" className="flex items-center gap-1 sm:gap-2">
            {navItems.map((item) => {
              const isActive =
                item.path === '/'
                  ? currentPath === '/' || (!['/profile', '/settings'].includes(currentPath) && currentPath.length > 1)
                  : currentPath.startsWith(item.path);

              return (
                <button
                  key={item.path}
                  id={`nav-link-${item.label.toLowerCase()}`}
                  type="button"
                  onClick={() => onNavigate(item.path)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    isActive
                      ? theme === 'glassroom'
                        ? 'text-white bg-white/15 border border-white/10 shadow-xs'
                        : 'text-neutral-900 dark:text-neutral-100 bg-neutral-100 dark:bg-neutral-800'
                      : theme === 'glassroom'
                      ? 'text-slate-400 hover:text-white hover:bg-white/5'
                      : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <div
            id="cloud-status-indicator"
            title={isCloud ? 'Connected to Supabase (in code)' : 'Offline local mode'}
            className="flex items-center gap-1 text-[11px] text-neutral-400 dark:text-neutral-500"
          >
            {isCloud ? (
              <span className="flex items-center gap-1 text-emerald-500">
                <Cloud className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Cloud</span>
              </span>
            ) : (
              <span className="flex items-center gap-1 text-neutral-400 dark:text-neutral-500">
                <CloudOff className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Local</span>
              </span>
            )}
          </div>

          <button
            id="theme-toggle-btn"
            type="button"
            onClick={onToggleTheme}
            aria-label="Toggle theme"
            title={`Current theme: ${theme === 'glassroom' ? 'Glassroom (Default)' : theme === 'dark' ? 'Dark' : 'Light'}. Click to cycle.`}
            className={`p-1.5 rounded-md transition-all cursor-pointer flex items-center gap-1.5 text-xs ${
              theme === 'glassroom'
                ? 'text-cyan-300 bg-white/10 hover:bg-white/15 border border-cyan-500/20'
                : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            }`}
          >
            {theme === 'glassroom' && (
              <>
                <Sparkles className="w-3.5 h-3.5 text-cyan-300" />
                <span className="hidden sm:inline text-[11px] font-mono text-cyan-200">Glass</span>
              </>
            )}
            {theme === 'dark' && (
              <>
                <Moon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline text-[11px] font-mono">Dark</span>
              </>
            )}
            {theme === 'light' && (
              <>
                <Sun className="w-3.5 h-3.5" />
                <span className="hidden sm:inline text-[11px] font-mono">Light</span>
              </>
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
