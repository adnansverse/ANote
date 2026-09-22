import React from 'react';
import { Sun, Moon, Cloud, CloudOff } from 'lucide-react';
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
    { label: 'Chat', path: '/chat' },
    { label: 'Profile', path: '/profile' },
    { label: 'Settings', path: '/settings' },
  ];

  return (
    <header id="main-nav" className="w-full border-b border-neutral-200/70 dark:border-neutral-800/80 bg-white/90 dark:bg-neutral-900/90 backdrop-blur-xs sticky top-0 z-30 transition-colors">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-13 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <button
            id="brand-logo"
            type="button"
            onClick={() => onNavigate('/')}
            className="text-base font-semibold tracking-tight text-neutral-900 dark:text-neutral-100 hover:opacity-80 transition-opacity cursor-pointer flex items-center gap-2"
          >
            <span>ANote</span>
          </button>

          <nav id="nav-links" className="flex items-center gap-1 sm:gap-2">
            {navItems.map((item) => {
              const isActive =
                item.path === '/'
                  ? currentPath === '/' || (!['/chat', '/profile', '/settings'].includes(currentPath) && currentPath.length > 1)
                  : currentPath.startsWith(item.path);

              return (
                <button
                  key={item.path}
                  id={`nav-link-${item.label.toLowerCase()}`}
                  type="button"
                  onClick={() => onNavigate(item.path)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    isActive
                      ? 'text-neutral-900 dark:text-neutral-100 bg-neutral-100 dark:bg-neutral-800'
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
            title={isCloud ? 'Connected to Supabase' : 'Offline local mode'}
            className="flex items-center gap-1 text-[11px] text-neutral-400 dark:text-neutral-500"
          >
            {isCloud ? (
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
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
            className="p-1.5 rounded-md text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </header>
  );
};
