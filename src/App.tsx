import React, { useState, useEffect, useCallback } from 'react';
import { UserProfile, ThemeMode, ToastMessage } from './types';
import { getCurrentUser, getLocalUser } from './services/authService';
import { cleanSlug, clearNoteUnlockedSession } from './services/notesService';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { Toast } from './components/Toast';
import { HomeView } from './views/HomeView';
import { NoteView } from './views/NoteView';
import { ProfileView } from './views/ProfileView';
import { SettingsView } from './views/SettingsView';

export default function App() {
  // --------------------------------------------------
  // 1. Theme state: Always starts in 'glassroom' theme on open
  // --------------------------------------------------
  const [theme, setTheme] = useState<ThemeMode>('glassroom');

  useEffect(() => {
    try {
      localStorage.setItem('anote_theme', theme);
    } catch {}

    const root = document.documentElement;
    root.setAttribute('data-theme', theme);

    if (theme === 'glassroom') {
      root.classList.add('dark', 'glassroom');
    } else if (theme === 'dark') {
      root.classList.add('dark');
      root.classList.remove('glassroom');
    } else {
      root.classList.remove('dark', 'glassroom');
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => {
      if (prev === 'glassroom') return 'dark';
      if (prev === 'dark') return 'light';
      return 'glassroom';
    });
  };

  // --------------------------------------------------
  // 2. User authentication state
  // --------------------------------------------------
  const [currentUser, setCurrentUser] = useState<UserProfile>(() => getLocalUser());

  useEffect(() => {
    getCurrentUser().then((user) => {
      setCurrentUser(user);
    });
  }, []);

  // --------------------------------------------------
  // 3. Routing (Clean slug-based routing: /slug, /chat, etc.)
  // --------------------------------------------------
  const [currentPath, setCurrentPath] = useState<string>(() => {
    // Check if URL has query or hash fallback
    const params = new URLSearchParams(window.location.search);
    const querySlug = params.get('name') || params.get('note');
    if (querySlug) {
      return `/${cleanSlug(querySlug)}`;
    }
    const hash = window.location.hash.replace(/^#\/?/, '');
    if (hash && hash !== '/') {
      return `/${cleanSlug(hash)}`;
    }
    return window.location.pathname || '/';
  });

  useEffect(() => {
    const handlePopState = () => {
      const prevSlug = cleanSlug(currentPath);
      const nextSlug = cleanSlug(window.location.pathname || '');
      if (prevSlug && prevSlug !== nextSlug) {
        clearNoteUnlockedSession(prevSlug);
      }
      setCurrentPath(window.location.pathname || '/');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [currentPath]);

  const navigate = useCallback((path: string) => {
    let target = path.trim();
    if (!target.startsWith('/')) {
      target = `/${target}`;
    }

    const currentSlug = cleanSlug(window.location.pathname || '');
    const targetSlug = cleanSlug(target);
    if (currentSlug && currentSlug !== targetSlug) {
      clearNoteUnlockedSession(currentSlug);
    }

    window.history.pushState({}, '', target);
    setCurrentPath(target);
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, []);

  // --------------------------------------------------
  // 4. Subtle Toast Notifications
  // --------------------------------------------------
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback((text: string, type: 'info' | 'success' | 'error' = 'info') => {
    const id = `toast_${Date.now()}_${Math.random()}`;
    const newToast: ToastMessage = { id, text, type };
    setToasts((prev) => [...prev.slice(-3), newToast]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2800);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // --------------------------------------------------
  // 5. Determine active route
  // --------------------------------------------------
  const renderView = () => {
    const cleanPath = currentPath.toLowerCase();

    if (cleanPath === '/' || cleanPath === '' || cleanPath === '/chat') {
      return <HomeView onNavigateToNote={(slug) => navigate(`/${slug}`)} theme={theme} />;
    }

    if (cleanPath === '/profile') {
      return (
        <ProfileView
          currentUser={currentUser}
          onUserUpdated={setCurrentUser}
          showToast={showToast}
          onNavigateToSettings={() => navigate('/settings')}
          theme={theme}
        />
      );
    }

    if (cleanPath === '/settings') {
      return (
        <SettingsView
          theme={theme}
          onSetTheme={setTheme}
          showToast={showToast}
          onReload={() => {
            getCurrentUser().then(setCurrentUser);
          }}
        />
      );
    }

    // Default route: clean slug note (/adnan, /cse-notes, etc.)
    const slug = cleanSlug(cleanPath);
    if (slug) {
      return (
        <NoteView
          key={slug}
          slug={slug}
          currentUser={currentUser}
          onNavigateHome={() => navigate('/')}
          showToast={showToast}
          theme={theme}
        />
      );
    }

    return <HomeView onNavigateToNote={(s) => navigate(`/${s}`)} theme={theme} />;
  };

  return (
    <div className={`min-h-screen flex flex-col transition-colors ${
      theme === 'glassroom'
        ? 'bg-transparent text-slate-100 selection:bg-teal-500/30'
        : theme === 'dark'
        ? 'bg-neutral-950 text-neutral-100 selection:bg-neutral-800'
        : 'bg-slate-50 text-neutral-950 selection:bg-neutral-300'
    }`}>
      <Navbar
        currentPath={currentPath}
        onNavigate={navigate}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      <main className="flex-1 flex flex-col">{renderView()}</main>

      <Footer />

      <Toast toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
