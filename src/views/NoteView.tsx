import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Share2, Check, ArrowLeft, Lock, KeyRound, ShieldCheck } from 'lucide-react';
import { SaveState, UserProfile, ThemeMode } from '../types';
import {
  fetchNote,
  saveNoteContent,
  getLocalNote,
  subscribeToLocalNoteUpdates,
  lockNote,
  verifyAndUnlockNote,
  removeNoteLock,
  isNoteUnlockedInSession,
  clearNoteUnlockedSession,
} from '../services/notesService';
import { isSupabaseConfigured } from '../config/supabase';

interface NoteViewProps {
  slug: string;
  currentUser: UserProfile;
  onNavigateHome: () => void;
  showToast: (text: string, type?: 'info' | 'success' | 'error') => void;
  theme?: ThemeMode;
}

export const NoteView: React.FC<NoteViewProps> = ({
  slug,
  currentUser: _currentUser,
  onNavigateHome,
  showToast,
  theme = 'glassroom',
}) => {
  // Fast 0ms initial load directly from local cache
  const cached = useMemo(() => getLocalNote(slug), [slug]);
  const [isLocked, setIsLocked] = useState<boolean>(() => Boolean(cached?.is_locked));
  const [isUnlocked, setIsUnlocked] = useState<boolean>(() => isNoteUnlockedInSession(slug));

  const [content, setContent] = useState<string>(() => {
    // Never expose protected content in state if note is locked and session is not unlocked
    if (cached?.is_locked && !isNoteUnlockedInSession(slug)) {
      return '';
    }
    return cached?.content || '';
  });

  const [saveState, setSaveState] = useState<SaveState>(() => (cached ? 'saved' : 'saved'));
  const [copied, setCopied] = useState(false);
  const [isLoadingNote, setIsLoadingNote] = useState<boolean>(() => !cached);

  // Set password modal state
  const [showSetPasswordModal, setShowSetPasswordModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isSettingLock, setIsSettingLock] = useState(false);

  // Manage existing lock modal state
  const [showManageLockModal, setShowManageLockModal] = useState(false);
  const [showRemoveForm, setShowRemoveForm] = useState(false);
  const [removePasswordInput, setRemovePasswordInput] = useState('');
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [isRemovingLock, setIsRemovingLock] = useState(false);

  // Unlock screen state
  const [unlockPassword, setUnlockPassword] = useState('');
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [isUnlocking, setIsUnlocking] = useState(false);

  const isLight = theme === 'light';
  const isGlass = theme === 'glassroom';

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimeoutRef = useRef<number | null>(null);
  const latestContentRef = useRef(content);
  const hasUserEditedRef = useRef(false);

  latestContentRef.current = content;

  // ----------------------------------------------------
  // Fast Background Note Synchronization
  // ----------------------------------------------------
  useEffect(() => {
    let isMounted = true;
    hasUserEditedRef.current = false;

    // Check local storage immediately
    const initialLocal = getLocalNote(slug);
    if (initialLocal) {
      const locked = Boolean(initialLocal.is_locked);
      const unlocked = isNoteUnlockedInSession(slug);
      setIsLocked(locked);
      setIsUnlocked(unlocked);
      if (!locked || unlocked) {
        setContent(initialLocal.content);
      }
      setIsLoadingNote(false);
    } else {
      setIsLoadingNote(true);
    }

    // Background fetch from Supabase
    fetchNote(slug).then(({ note, error }) => {
      if (!isMounted) return;
      setIsLoadingNote(false);
      if (note) {
        const locked = Boolean(note.is_locked);
        setIsLocked(locked);

        // If unlocked in session or not locked, load content
        if (!locked || isNoteUnlockedInSession(slug)) {
          if (!hasUserEditedRef.current) {
            setContent(note.content);
          }
        }
        setSaveState(isSupabaseConfigured() ? 'saved' : 'offline');
      } else if (error) {
        setSaveState('error');
        showToast(error, 'error');
      }
    });

    // Multi-tab instant 0ms sync
    const unsubscribeLocal = subscribeToLocalNoteUpdates(slug, (incomingNote) => {
      if (!isMounted) return;
      setIsLocked(Boolean(incomingNote.is_locked));
      if (!incomingNote.is_locked || isNoteUnlockedInSession(slug)) {
        if (incomingNote.content !== latestContentRef.current) {
          setContent(incomingNote.content);
        }
      }
    });

    return () => {
      isMounted = false;
      unsubscribeLocal();
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [slug, showToast]);

  // Auto-focus the editor when loaded and accessible
  useEffect(() => {
    if (!isLoadingNote && (!isLocked || isUnlocked) && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isLoadingNote, isLocked, isUnlocked]);

  // ----------------------------------------------------
  // Ultra-Fast Debounced Autosave (650ms for snappy responsiveness)
  // ----------------------------------------------------
  const executeSave = useCallback(
    async (textToSave: string) => {
      setSaveState('saving');
      const { success, error } = await saveNoteContent(slug, textToSave);
      if (success) {
        setSaveState(isSupabaseConfigured() ? 'saved' : 'offline');
      } else {
        setSaveState('error');
        if (error) showToast(error, 'error');
      }
    },
    [slug, showToast]
  );

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const nextVal = e.target.value;
    hasUserEditedRef.current = true;
    setContent(nextVal);
    setSaveState('saving');

    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current);
    }

    // Snappy 650ms debounce
    saveTimeoutRef.current = window.setTimeout(() => {
      executeSave(nextVal);
    }, 650);
  };

  // ----------------------------------------------------
  // Keyboard Shortcuts (Ctrl+S / Cmd+S, Tab Indent)
  // ----------------------------------------------------
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Instant save: Ctrl+S / Cmd+S
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
      }
      executeSave(content);
      showToast('Saved', 'success');
      return;
    }

    // Tab key inserts 2 spaces without losing focus
    if (e.key === 'Tab') {
      e.preventDefault();
      const target = e.currentTarget;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const updated = content.substring(0, start) + '  ' + content.substring(end);
      hasUserEditedRef.current = true;
      setContent(updated);
      setSaveState('saving');

      // Preserve cursor position
      setTimeout(() => {
        target.selectionStart = target.selectionEnd = start + 2;
      }, 0);

      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = window.setTimeout(() => {
        executeSave(updated);
      }, 650);
    }
  };

  // ----------------------------------------------------
  // Clean Share Action (Vercel Production Domain)
  // ----------------------------------------------------
  const handleCopyShareLink = async () => {
    let cleanUrl = `https://a-note-six.vercel.app/${slug}`;
    try {
      const origin = window.location.origin;
      if (
        origin &&
        !origin.includes('localhost') &&
        !origin.includes('ais-dev') &&
        !origin.includes('ais-pre')
      ) {
        cleanUrl = `${origin.replace(/\/+$/, '')}/${slug}`;
      }
    } catch {}

    try {
      await navigator.clipboard.writeText(cleanUrl);
      setCopied(true);
      showToast(`Link copied: ${cleanUrl}`, 'success');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback for clipboard copy
      try {
        const input = document.createElement('input');
        input.value = cleanUrl;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
        setCopied(true);
        showToast(`Link copied: ${cleanUrl}`, 'success');
        setTimeout(() => setCopied(false), 2500);
      } catch {
        showToast('Could not copy to clipboard', 'error');
      }
    }
  };

  // ----------------------------------------------------
  // Note Lock Actions
  // ----------------------------------------------------
  const handleSetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordInput.trim()) {
      setPasswordError('Password cannot be empty.');
      return;
    }
    if (passwordInput !== confirmPasswordInput) {
      setPasswordError('Passwords do not match.');
      return;
    }

    setIsSettingLock(true);
    setPasswordError(null);

    const { success, error } = await lockNote(slug, passwordInput);
    setIsSettingLock(false);

    if (success) {
      setIsLocked(true);
      setIsUnlocked(true);
      setShowSetPasswordModal(false);
      setPasswordInput('');
      setConfirmPasswordInput('');
      showToast('Note locked successfully.', 'success');
    } else {
      setPasswordError(error || 'Failed to lock note.');
    }
  };

  const handleRemoveLockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!removePasswordInput) {
      setRemoveError('Please enter the current password.');
      return;
    }
    setIsRemovingLock(true);
    setRemoveError(null);

    const { success, error } = await removeNoteLock(slug, removePasswordInput);
    setIsRemovingLock(false);

    if (success) {
      setIsLocked(false);
      setShowManageLockModal(false);
      setShowRemoveForm(false);
      setRemovePasswordInput('');
      showToast('Password lock removed', 'info');
    } else {
      setRemoveError(error || 'Incorrect password.');
    }
  };

  const handleUnlockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unlockPassword) {
      setUnlockError('Please enter a password.');
      return;
    }

    setIsUnlocking(true);
    setUnlockError(null);

    const res = await verifyAndUnlockNote(slug, unlockPassword);
    setIsUnlocking(false);

    if (res.success) {
      setIsUnlocked(true);
      if (res.note) {
        setContent(res.note.content);
      } else {
        const local = getLocalNote(slug);
        if (local) setContent(local.content);
      }
      setUnlockPassword('');
      showToast('Note unlocked', 'success');
    } else {
      setUnlockError(res.error || 'Incorrect password.');
    }
  };

  const handleBackHome = () => {
    clearNoteUnlockedSession(slug);
    onNavigateHome();
  };

  // Memoized stats calculation for zero lag on large notes
  const stats = useMemo(() => {
    const trimmed = content.trim();
    const words = trimmed ? trimmed.split(/\s+/).length : 0;
    const chars = content.length;
    const lines = content ? content.split('\n').length : 1;
    return { words, chars, lines };
  }, [content]);

  return (
    <div id="note-view-container" className="flex-1 flex flex-col w-full max-w-5xl mx-auto px-4 sm:px-6">
      {/* Subheader / Minimal Action Bar */}
      <div
        id="note-subbar"
        className={`py-3 flex flex-wrap items-center justify-between gap-3 border-b transition-colors ${
          isLight
            ? 'border-slate-200'
            : isGlass
            ? 'border-white/10'
            : 'border-neutral-800'
        }`}
      >
        <div className="flex items-center gap-3">
          <button
            id="back-home-btn"
            type="button"
            onClick={handleBackHome}
            title="Return to home"
            className={`p-1.5 rounded-lg border transition-all cursor-pointer flex items-center gap-1.5 text-xs font-medium ${
              isLight
                ? 'bg-white hover:bg-slate-100 text-slate-800 border-slate-300 shadow-2xs'
                : isGlass
                ? 'bg-white/10 hover:bg-white/15 text-slate-200 border-white/10'
                : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border-neutral-700'
            }`}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Home</span>
          </button>

          <div className="flex items-center gap-2">
            <span
              id="note-slug-display"
              className={`text-sm font-mono font-bold tracking-tight ${
                isLight ? 'text-slate-900' : 'text-neutral-100'
              }`}
            >
              /{slug}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Live Save Status Badge (visible when note is accessible) */}
          {(!isLocked || isUnlocked) && (
            <div
              id="save-state-badge"
              className="text-xs font-mono font-medium flex items-center gap-1.5"
            >
              {saveState === 'saving' && (
                <span className={`flex items-center gap-1.5 ${isLight ? 'text-amber-700' : 'text-amber-400'}`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
                  <span>Saving...</span>
                </span>
              )}
              {saveState === 'saved' && (
                <span className={`flex items-center gap-1 font-semibold ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`}>
                  <Check className="w-3.5 h-3.5" />
                  <span>Saved</span>
                </span>
              )}
              {saveState === 'offline' && (
                <span className={isLight ? 'text-slate-500' : 'text-neutral-400'} title="Saved locally to browser cache">
                  Offline Cache
                </span>
              )}
              {saveState === 'error' && (
                <span className="text-rose-600 font-semibold">Error saving</span>
              )}
            </div>
          )}

          {/* Note Lock Button */}
          {isLocked ? (
            <button
              id="lock-status-btn"
              type="button"
              onClick={() => {
                if (isUnlocked) {
                  setShowRemoveForm(false);
                  setRemovePasswordInput('');
                  setRemoveError(null);
                  setShowManageLockModal(true);
                }
              }}
              title={
                isUnlocked
                  ? 'This note is password protected. Click to manage.'
                  : 'This note is locked'
              }
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                isLight
                  ? 'text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-300 shadow-2xs'
                  : isGlass
                  ? 'text-amber-300 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/40 shadow-[0_0_12px_rgba(245,158,11,0.2)]'
                  : 'text-amber-300 bg-amber-950/40 hover:bg-amber-900/50 border border-amber-700/60'
              }`}
            >
              <Lock className="w-3.5 h-3.5 text-amber-500" />
              <span>Protected</span>
            </button>
          ) : (
            <button
              id="lock-note-btn"
              type="button"
              onClick={() => {
                setPasswordInput('');
                setConfirmPasswordInput('');
                setPasswordError(null);
                setShowSetPasswordModal(true);
              }}
              title="Lock this note with a password"
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                isLight
                  ? 'text-slate-800 bg-white hover:bg-slate-100 border border-slate-300 shadow-2xs'
                  : isGlass
                  ? 'text-slate-200 bg-white/10 hover:bg-white/15 border border-white/10'
                  : 'text-neutral-300 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700'
              }`}
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Lock</span>
            </button>
          )}

          {/* Quick Share Link */}
          <button
            id="share-note-btn"
            type="button"
            onClick={handleCopyShareLink}
            title={`Copy share link: https://a-note-six.vercel.app/${slug}`}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              isLight
                ? 'text-slate-800 bg-white hover:bg-slate-100 border border-slate-300 shadow-2xs'
                : isGlass
                ? 'text-slate-200 bg-white/10 hover:bg-white/15 border border-white/10'
                : 'text-neutral-300 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700'
            }`}
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Share2 className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Share'}</span>
          </button>
        </div>
      </div>

      {/* Main View: Either Locked Screen OR Fast Notepad Canvas */}
      {isLocked && !isUnlocked ? (
        /* 5. Locked Note Opening Screen */
        <div id="locked-note-screen" className="flex-1 flex flex-col items-center justify-center py-16 px-4">
          <div
            className={`w-full max-w-sm rounded-2xl p-7 sm:p-8 flex flex-col items-center text-center transition-all ${
              isLight
                ? 'bg-white border-2 border-slate-200 shadow-lg text-slate-900'
                : isGlass
                ? 'glass-surface border border-white/15 text-slate-100 shadow-[0_8px_32px_rgba(0,0,0,0.37)]'
                : 'bg-neutral-900 border border-neutral-800 text-neutral-100 shadow-xl'
            }`}
          >
            {/* Lock Icon */}
            <div
              className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-5 ${
                isLight
                  ? 'bg-amber-100 text-amber-700 border border-amber-300'
                  : isGlass
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-400/40 shadow-[0_0_20px_rgba(245,158,11,0.25)]'
                  : 'bg-amber-950/60 text-amber-400 border border-amber-800/80'
              }`}
            >
              <Lock className="w-7 h-7" />
            </div>

            <h2 className="text-xl font-bold tracking-tight mb-1.5">
              This note is locked
            </h2>
            <p
              className={`text-xs mb-6 font-medium ${
                isLight ? 'text-slate-500' : 'text-neutral-400'
              }`}
            >
              Enter your password to continue.
            </p>

            <form onSubmit={handleUnlockSubmit} className="w-full space-y-4">
              <div>
                <input
                  id="unlock-password-input"
                  type="password"
                  autoFocus
                  value={unlockPassword}
                  onChange={(e) => {
                    setUnlockPassword(e.target.value);
                    if (unlockError) setUnlockError(null);
                  }}
                  placeholder="Enter password..."
                  className={`w-full px-4 py-2.5 rounded-lg text-sm font-sans transition-all focus:outline-hidden ${
                    isLight
                      ? 'bg-slate-50 border-2 border-slate-300 text-slate-900 placeholder-slate-400 focus:border-slate-800 focus:ring-1 focus:ring-slate-800 shadow-2xs'
                      : isGlass
                      ? 'glass-input-style text-slate-100 placeholder-slate-500 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400'
                      : 'bg-neutral-800 border border-neutral-700 text-neutral-100 placeholder-neutral-500 focus:ring-1 focus:ring-neutral-100'
                  }`}
                />
                {unlockError && (
                  <p id="unlock-error-msg" className="text-xs text-rose-500 font-semibold mt-2 text-left">
                    {unlockError}
                  </p>
                )}
              </div>

              <button
                id="unlock-submit-btn"
                type="submit"
                disabled={isUnlocking}
                className={`w-full py-2.5 px-4 text-sm font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-2 ${
                  isLight
                    ? 'bg-slate-900 hover:bg-slate-800 text-white shadow-sm'
                    : isGlass
                    ? 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-[0_0_15px_rgba(6,182,212,0.3)]'
                    : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-900'
                }`}
              >
                {isUnlocking ? (
                  <span>Checking...</span>
                ) : (
                  <>
                    <KeyRound className="w-4 h-4" />
                    <span>Unlock</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleBackHome}
                className={`w-full py-1 text-xs font-medium cursor-pointer transition-colors ${
                  isLight ? 'text-slate-500 hover:text-slate-900' : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                ← Back to Home
              </button>
            </form>
          </div>
        </div>
      ) : (
        /* Super Fast Editor Canvas */
        <div id="note-editor-wrapper" className="flex-1 flex flex-col mt-4 mb-2 min-h-[60vh]">
          {isLoadingNote ? (
            <div className={`flex-1 flex items-center justify-center text-xs font-mono ${isLight ? 'text-slate-500' : 'text-neutral-400'}`}>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                <span>Loading note...</span>
              </div>
            </div>
          ) : (
            <textarea
              ref={textareaRef}
              id="note-content-editor"
              value={content}
              onChange={handleContentChange}
              onKeyDown={handleKeyDown}
              placeholder="Start typing your note here... (Autosaves automatically · Press Ctrl+S to save immediately)"
              spellCheck={false}
              autoFocus
              className={`flex-1 w-full resize-none border-none outline-hidden bg-transparent text-base sm:text-lg leading-relaxed p-0 focus:ring-0 font-sans tracking-normal transition-colors ${
                isLight
                  ? 'text-slate-950 placeholder-slate-400 font-normal selection:bg-slate-200'
                  : 'text-neutral-100 placeholder-neutral-500 selection:bg-neutral-800'
              }`}
            />
          )}

          {/* Minimal Footer Stats & Shortcuts */}
          <div
            id="note-word-count-bar"
            className={`py-2 text-[11px] font-mono flex justify-between items-center border-t transition-colors ${
              isLight
                ? 'text-slate-600 font-medium border-slate-200'
                : isGlass
                ? 'text-slate-400 border-white/10'
                : 'text-neutral-500 border-neutral-800'
            }`}
          >
            <div className="flex items-center gap-3">
              <span>
                {stats.words} {stats.words === 1 ? 'word' : 'words'} · {stats.chars} chars · {stats.lines} {stats.lines === 1 ? 'line' : 'lines'}
              </span>
            </div>
            <div className="flex items-center gap-3 text-[10px]">
              <span className="hidden sm:inline">Tab to indent</span>
              <span className="hidden sm:inline">·</span>
              <span>Ctrl+S to save</span>
            </div>
          </div>
        </div>
      )}

      {/* 2. Set Password Modal */}
      {showSetPasswordModal && (
        <div
          id="set-password-modal"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn"
          onClick={() => setShowSetPasswordModal(false)}
        >
          <div
            className={`w-full max-w-sm rounded-2xl p-6 border shadow-2xl transition-all ${
              isLight
                ? 'bg-white border-slate-200 text-slate-900'
                : isGlass
                ? 'glass-surface border-white/15 text-slate-100 shadow-[0_8px_32px_rgba(0,0,0,0.5)]'
                : 'bg-neutral-900 border-neutral-800 text-neutral-100'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                  isLight
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-400/40'
                }`}
              >
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold tracking-tight">Lock Note</h3>
                <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-neutral-400'}`}>
                  Set a password to protect /{slug}
                </p>
              </div>
            </div>

            <form onSubmit={handleSetPasswordSubmit} className="space-y-3.5">
              <div>
                <label className={`block text-xs font-semibold mb-1 ${isLight ? 'text-slate-700' : 'text-neutral-300'}`}>
                  Password
                </label>
                <input
                  id="modal-password-input"
                  type="password"
                  autoFocus
                  value={passwordInput}
                  onChange={(e) => {
                    setPasswordInput(e.target.value);
                    if (passwordError) setPasswordError(null);
                  }}
                  placeholder="Enter a secure password..."
                  className={`w-full px-3.5 py-2 text-sm rounded-lg transition-all focus:outline-hidden ${
                    isLight
                      ? 'bg-slate-50 border-2 border-slate-300 text-slate-900 placeholder-slate-400 focus:border-slate-800'
                      : isGlass
                      ? 'glass-input-style text-slate-100 placeholder-slate-500 focus:border-cyan-400'
                      : 'bg-neutral-800 border border-neutral-700 text-neutral-100 placeholder-neutral-500'
                  }`}
                />
              </div>

              <div>
                <label className={`block text-xs font-semibold mb-1 ${isLight ? 'text-slate-700' : 'text-neutral-300'}`}>
                  Confirm Password
                </label>
                <input
                  id="modal-confirm-password-input"
                  type="password"
                  value={confirmPasswordInput}
                  onChange={(e) => {
                    setConfirmPasswordInput(e.target.value);
                    if (passwordError) setPasswordError(null);
                  }}
                  placeholder="Re-enter password..."
                  className={`w-full px-3.5 py-2 text-sm rounded-lg transition-all focus:outline-hidden ${
                    isLight
                      ? 'bg-slate-50 border-2 border-slate-300 text-slate-900 placeholder-slate-400 focus:border-slate-800'
                      : isGlass
                      ? 'glass-input-style text-slate-100 placeholder-slate-500 focus:border-cyan-400'
                      : 'bg-neutral-800 border border-neutral-700 text-neutral-100 placeholder-neutral-500'
                  }`}
                />
              </div>

              {passwordError && (
                <p id="password-modal-error" className="text-xs text-rose-500 font-semibold">
                  {passwordError}
                </p>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSetPasswordModal(false)}
                  className={`px-3.5 py-2 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                    isLight
                      ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300'
                  }`}
                >
                  Cancel
                </button>
                <button
                  id="submit-lock-note-btn"
                  type="submit"
                  disabled={isSettingLock}
                  className={`px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                    isLight
                      ? 'bg-slate-900 hover:bg-slate-800 text-white shadow-xs'
                      : isGlass
                      ? 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-[0_0_12px_rgba(6,182,212,0.3)]'
                      : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-900'
                  }`}
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>{isSettingLock ? 'Locking...' : 'Lock Note'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manage Lock Modal (When already locked) */}
      {showManageLockModal && (
        <div
          id="manage-lock-modal"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn"
          onClick={() => setShowManageLockModal(false)}
        >
          <div
            className={`w-full max-w-sm rounded-2xl p-6 border shadow-2xl transition-all ${
              isLight
                ? 'bg-white border-slate-200 text-slate-900'
                : isGlass
                ? 'glass-surface border-white/15 text-slate-100 shadow-[0_8px_32px_rgba(0,0,0,0.5)]'
                : 'bg-neutral-900 border-neutral-800 text-neutral-100'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                  isLight
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-400/40'
                }`}
              >
                <ShieldCheck className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <h3 className="text-base font-bold tracking-tight">Note Protected</h3>
                <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-neutral-400'}`}>
                  /{slug} is locked with a password
                </p>
              </div>
            </div>

            <p className={`text-xs leading-relaxed mb-4 ${isLight ? 'text-slate-600' : 'text-neutral-300'}`}>
              Anyone accessing this note from a new session will be required to enter the password to view its content.
            </p>

            {showRemoveForm ? (
              <form onSubmit={handleRemoveLockSubmit} className="space-y-3 pt-3 border-t border-neutral-200/50 dark:border-white/10">
                <label className={`block text-xs font-semibold ${isLight ? 'text-slate-700' : 'text-neutral-300'}`}>
                  Enter current password to remove lock:
                </label>
                <input
                  id="remove-password-input"
                  type="password"
                  autoFocus
                  value={removePasswordInput}
                  onChange={(e) => {
                    setRemovePasswordInput(e.target.value);
                    if (removeError) setRemoveError(null);
                  }}
                  placeholder="Current password..."
                  className={`w-full px-3.5 py-2 text-sm rounded-lg transition-all focus:outline-hidden ${
                    isLight
                      ? 'bg-slate-50 border-2 border-slate-300 text-slate-900 placeholder-slate-400'
                      : isGlass
                      ? 'glass-input-style text-slate-100 placeholder-slate-500'
                      : 'bg-neutral-800 border border-neutral-700 text-neutral-100 placeholder-neutral-500'
                  }`}
                />
                {removeError && (
                  <p className="text-xs text-rose-500 font-semibold">{removeError}</p>
                )}
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setShowRemoveForm(false);
                      setRemovePasswordInput('');
                      setRemoveError(null);
                    }}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg cursor-pointer ${
                      isLight ? 'bg-slate-100 text-slate-700' : 'bg-neutral-800 text-neutral-300'
                    }`}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isRemovingLock}
                    className="px-3.5 py-1.5 text-xs font-bold rounded-lg bg-rose-600 hover:bg-rose-500 text-white cursor-pointer"
                  >
                    {isRemovingLock ? 'Removing...' : 'Confirm Remove'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex items-center justify-between gap-3 pt-3 border-t border-neutral-200/50 dark:border-white/10">
                <button
                  type="button"
                  onClick={() => setShowRemoveForm(true)}
                  className="text-xs font-semibold text-rose-500 hover:text-rose-400 hover:underline cursor-pointer"
                >
                  Remove Password
                </button>
                <button
                  type="button"
                  onClick={() => setShowManageLockModal(false)}
                  className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                    isLight
                      ? 'bg-slate-900 text-white hover:bg-slate-800'
                      : 'bg-neutral-100 text-neutral-900 hover:bg-neutral-200'
                  }`}
                >
                  Done
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
