import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Share2, Check, ArrowLeft } from 'lucide-react';
import { SaveState, UserProfile, ThemeMode } from '../types';
import {
  fetchNote,
  saveNoteContent,
  getLocalNote,
  subscribeToLocalNoteUpdates,
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
  const [content, setContent] = useState<string>(() => cached?.content || '');
  const [saveState, setSaveState] = useState<SaveState>(() => (cached ? 'saved' : 'saved'));
  const [copied, setCopied] = useState(false);
  const [isLoadingNote, setIsLoadingNote] = useState<boolean>(() => !cached);

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

    // Check if we already have it locally
    const initialLocal = getLocalNote(slug);
    if (initialLocal) {
      setContent(initialLocal.content);
      setIsLoadingNote(false);
    } else {
      setIsLoadingNote(true);
    }

    // Background fetch from Supabase
    fetchNote(slug).then(({ note, error }) => {
      if (!isMounted) return;
      setIsLoadingNote(false);
      if (note) {
        // If the user hasn't started typing yet, sync with cloud
        if (!hasUserEditedRef.current) {
          setContent(note.content);
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
      if (incomingNote.content !== latestContentRef.current) {
        setContent(incomingNote.content);
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

  // Auto-focus the editor when loaded
  useEffect(() => {
    if (!isLoadingNote && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isLoadingNote]);

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
            onClick={onNavigateHome}
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
          {/* Live Save Status Badge */}
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

      {/* Super Fast Editor Canvas */}
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
    </div>
  );
};
