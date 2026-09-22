import React, { useState, useEffect, useCallback } from 'react';
import { UserProfile, ThemeMode, ToastMessage } from './types';
import { getCurrentUser, getLocalUser } from './services/authService';
import { cleanSlug } from './services/notesService';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { Toast } from './components/Toast';
import { HomeView } from './views/HomeView';
import { NoteView } from './views/NoteView';
import { DirectChatView } from './views/DirectChatView';
import { ProfileView } from './views/ProfileView';
import { SettingsView } from './views/SettingsView';

export default function App() {
  // --------------------------------------------------
  // 1. Theme state
  // --------------------------------------------------
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('anote_theme');
    if (saved === 'dark' || saved === 'light') return saved;
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  });

  useEffect(() => {
    localStorage.setItem('anote_theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
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
      setCurrentPath(window.location.pathname || '/');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = useCallback((path: string) => {
    let target = path.trim();
    if (!target.startsWith('/')) {
      target = `/${target}`;
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

    if (cleanPath === '/' || cleanPath === '') {
      return <HomeView onNavigateToNote={(slug) => navigate(`/${slug}`)} />;
    }

    if (cleanPath === '/chat') {
      return <DirectChatView currentUser={currentUser} showToast={showToast} />;
    }

    if (cleanPath === '/profile') {
      return (
        <ProfileView
          currentUser={currentUser}
          onUserUpdated={setCurrentUser}
          showToast={showToast}
          onNavigateToSettings={() => navigate('/settings')}
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
        />
      );
    }

    return <HomeView onNavigateToNote={(s) => navigate(`/${s}`)} />;
  };

  return (
    <div className="min-h-screen flex flex-col bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100 selection:bg-neutral-200 dark:selection:bg-neutral-800 transition-colors">
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
