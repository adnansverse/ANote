import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Share2, Check, Send, User, ArrowLeftRight, Sparkles, Trash2 } from 'lucide-react';
import { Note, Message, SaveState, UserProfile, ThemeMode } from '../types';
import { fetchNote, saveNoteContent, subscribeToLocalNoteUpdates } from '../services/notesService';
import {
  fetchNoteMessages,
  sendNoteMessage,
  subscribeToNoteMessages,
  clearNoteMessages,
  broadcastTypingStatus,
} from '../services/chatService';
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
  currentUser,
  onNavigateHome,
  showToast,
  theme = 'glassroom',
}) => {
  const [activeTab, setActiveTab] = useState<'note' | 'chat'>('note');
  const [content, setContent] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [copied, setCopied] = useState(false);
  const [isLoadingNote, setIsLoadingNote] = useState(true);

  const isLight = theme === 'light';
  const isGlass = theme === 'glassroom';

  // Chat states
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isSendingChat, setIsSendingChat] = useState(false);

  // Typing indicators state
  const [typingUsers, setTypingUsers] = useState<
    Record<string, { name: string; slot: 'person1' | 'person2'; timestamp: number }>
  >({});
  const typingTimeoutRef = useRef<number | null>(null);
  const remoteTypingTimersRef = useRef<Record<string, number>>({});

  // Clean chat confirmation state
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isClearingChat, setIsClearingChat] = useState(false);

  // Dual Person Chat state (Person 1 & Person 2)
  const [person1Name, setPerson1Name] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(`anote_p1_${slug}`);
      if (saved && saved.trim()) return saved;
    } catch {}
    return currentUser.display_name || 'Person 1';
  });

  const [person2Name, setPerson2Name] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(`anote_p2_${slug}`);
      if (saved && saved.trim()) return saved;
    } catch {}
    return 'Person 2';
  });

  const [activeSpeaker, setActiveSpeaker] = useState<'person1' | 'person2'>('person1');

  // Persist customized names locally per note
  useEffect(() => {
    try {
      localStorage.setItem(`anote_p1_${slug}`, person1Name);
    } catch {}
  }, [person1Name, slug]);

  useEffect(() => {
    try {
      localStorage.setItem(`anote_p2_${slug}`, person2Name);
    } catch {}
  }, [person2Name, slug]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const saveTimeoutRef = useRef<number | null>(null);
  const latestContentRef = useRef(content);

  latestContentRef.current = content;

  // ----------------------------------------------------
  // Load Note
  // ----------------------------------------------------
  useEffect(() => {
    let isMounted = true;
    setIsLoadingNote(true);

    fetchNote(slug).then(({ note, error }) => {
      if (!isMounted) return;
      setIsLoadingNote(false);
      if (note) {
        setContent(note.content);
        setSaveState(isSupabaseConfigured() ? 'saved' : 'offline');
      } else if (error) {
        setSaveState('error');
        showToast(error, 'error');
      }
    });

    // Multi-tab sync subscription
    const unsubscribeLocal = subscribeToLocalNoteUpdates(slug, (incomingNote) => {
      if (!isMounted) return;
      // Only update if external change differs from current local text
      if (incomingNote.content !== latestContentRef.current) {
        setContent(incomingNote.content);
      }
    });

    return () => {
      isMounted = false;
      unsubscribeLocal();
    };
  }, [slug]);

  // ----------------------------------------------------
  // Load & Subscribe Note Chat with Multi-Event Real-Time
  // ----------------------------------------------------
  useEffect(() => {
    let isMounted = true;
    fetchNoteMessages(slug).then(({ messages: loaded, error }) => {
      if (!isMounted) return;
      if (error) {
        console.warn('Chat load warning:', error);
      }
      setMessages(loaded);
    });

    const unsubscribe = subscribeToNoteMessages(slug, {
      onNewMessage: (newMsg) => {
        if (!isMounted) return;
        setMessages((prev) => {
          if (prev.some((m) => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
      },
      onClearMessages: () => {
        if (!isMounted) return;
        setMessages([]);
      },
      onTypingStatus: (status) => {
        if (!isMounted) return;
        const key = status.senderSlot;
        if (status.isTyping) {
          setTypingUsers((prev) => ({
            ...prev,
            [key]: { name: status.name, slot: status.senderSlot, timestamp: Date.now() },
          }));

          if (remoteTypingTimersRef.current[key]) {
            window.clearTimeout(remoteTypingTimersRef.current[key]);
          }
          // Auto-clear remote typing after 2.5s of silence
          remoteTypingTimersRef.current[key] = window.setTimeout(() => {
            if (!isMounted) return;
            setTypingUsers((prev) => {
              const next = { ...prev };
              delete next[key];
              return next;
            });
          }, 2500);
        } else {
          if (remoteTypingTimersRef.current[key]) {
            window.clearTimeout(remoteTypingTimersRef.current[key]);
          }
          setTypingUsers((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
          });
        }
      },
    });

    return () => {
      isMounted = false;
      unsubscribe();
      // Clean up remote timers
      Object.values(remoteTypingTimersRef.current).forEach((t) => window.clearTimeout(t));
    };
  }, [slug]);

  // Scroll chat to bottom on new messages or typing changes
  useEffect(() => {
    if (activeTab === 'chat') {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, typingUsers, activeTab]);

  // ----------------------------------------------------
  // Debounced Autosave
  // ----------------------------------------------------
  const executeSave = useCallback(async (textToSave: string) => {
    setSaveState('saving');
    const { success, error } = await saveNoteContent(slug, textToSave);
    if (success) {
      setSaveState(isSupabaseConfigured() ? 'saved' : 'offline');
    } else {
      setSaveState('error');
      if (error) showToast(error, 'error');
    }
  }, [slug, showToast]);

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const nextVal = e.target.value;
    setContent(nextVal);
    setSaveState('saving');

    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current);
    }

    // Debounce between 800ms - 1500ms (1000ms is ideal)
    saveTimeoutRef.current = window.setTimeout(() => {
      executeSave(nextVal);
    }, 1000);
  };

  // ----------------------------------------------------
  // Keyboard Shortcuts (Cmd+S, Tab support)
  // ----------------------------------------------------
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Manual save: Ctrl+S / Cmd+S
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
      }
      executeSave(content);
      showToast('Saved', 'success');
      return;
    }

    // Tab key inserts 2 spaces
    if (e.key === 'Tab') {
      e.preventDefault();
      const target = e.currentTarget;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const updated = content.substring(0, start) + '  ' + content.substring(end);
      setContent(updated);
      setSaveState('saving');

      // Restore cursor position after state update
      setTimeout(() => {
        target.selectionStart = target.selectionEnd = start + 2;
      }, 0);

      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = window.setTimeout(() => {
        executeSave(updated);
      }, 1000);
    }
  };

  // ----------------------------------------------------
  // Share Action
  // ----------------------------------------------------
  const handleCopyShareLink = async () => {
    // Clean production link as specified in requirement 23: https://anote.pages.dev/{slug}
    // Also include fallback for the live applet domain if user wants exact link
    const cleanUrl = `https://anote.pages.dev/${slug}`;
    try {
      await navigator.clipboard.writeText(cleanUrl);
      setCopied(true);
      showToast('Copied', 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast('Could not copy to clipboard', 'error');
    }
  };

  // ----------------------------------------------------
  // Chat Input Typing Tracker
  // ----------------------------------------------------
  const handleChatInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setChatInput(val);

    const currentSenderName =
      activeSpeaker === 'person1'
        ? person1Name.trim() || 'Person 1'
        : person2Name.trim() || 'Person 2';

    if (val.trim()) {
      broadcastTypingStatus(slug, activeSpeaker, currentSenderName, true);

      if (typingTimeoutRef.current) {
        window.clearTimeout(typingTimeoutRef.current);
      }
      typingTimeoutRef.current = window.setTimeout(() => {
        broadcastTypingStatus(slug, activeSpeaker, currentSenderName, false);
      }, 1800);
    } else {
      if (typingTimeoutRef.current) {
        window.clearTimeout(typingTimeoutRef.current);
      }
      broadcastTypingStatus(slug, activeSpeaker, currentSenderName, false);
    }
  };

  // ----------------------------------------------------
  // Send Chat Message (Instant Dual Person Chat)
  // ----------------------------------------------------
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!chatInput.trim() || isSendingChat) return;

    const text = chatInput.trim();
    setChatInput('');
    setIsSendingChat(true);

    const currentSenderName =
      activeSpeaker === 'person1'
        ? person1Name.trim() || 'Person 1'
        : person2Name.trim() || 'Person 2';

    // Broadcast that typing has stopped immediately
    if (typingTimeoutRef.current) {
      window.clearTimeout(typingTimeoutRef.current);
    }
    broadcastTypingStatus(slug, activeSpeaker, currentSenderName, false);

    // Instant optimistic update for 0ms visual latency
    const optimisticMsg: Message = {
      id: `local_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      note_slug: slug,
      user_id: currentUser.id,
      username: currentUser.username,
      display_name: currentSenderName,
      content: text,
      created_at: new Date().toISOString(),
      sender_slot: activeSpeaker,
    };

    setMessages((prev) => [...prev, optimisticMsg]);

    const { error } = await sendNoteMessage(
      slug,
      text,
      currentUser,
      activeSpeaker,
      currentSenderName
    );
    setIsSendingChat(false);

    if (error) {
      showToast(error, 'error');
    }
  };

  // ----------------------------------------------------
  // Clean Chat Action
  // ----------------------------------------------------
  const handleClearChat = async () => {
    setIsClearingChat(true);
    setShowClearConfirm(false);
    setMessages([]);
    const { error } = await clearNoteMessages(slug);
    setIsClearingChat(false);
    if (error) {
      showToast(error, 'error');
    } else {
      showToast('Chat cleared', 'info');
    }
  };

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const charCount = content.length;

  return (
    <div id="note-view-container" className="flex-1 flex flex-col w-full max-w-5xl mx-auto px-4 sm:px-6">
      {/* Subheader / Action Bar */}
      <div
        id="note-subbar"
        className={`py-3 flex flex-wrap items-center justify-between gap-3 border-b ${
          isLight
            ? 'border-slate-200'
            : isGlass
            ? 'border-white/10'
            : 'border-neutral-800'
        }`}
      >
        <div className="flex items-center gap-3">
          <button
            id="note-slug-btn"
            type="button"
            onClick={onNavigateHome}
            title="Return to home"
            className={`text-sm font-mono font-bold transition-opacity cursor-pointer ${
              isLight
                ? 'text-slate-900 hover:text-slate-600'
                : 'text-neutral-100 hover:text-neutral-300'
            }`}
          >
            /{slug}
          </button>

          {/* Mode Switcher */}
          <div
            id="mode-switcher"
            className={`inline-flex rounded-lg p-0.5 ${
              isLight
                ? 'bg-slate-200 border border-slate-300 shadow-2xs'
                : isGlass
                ? 'bg-white/10 border border-white/10'
                : 'bg-neutral-800'
            }`}
          >
            <button
              id="switch-to-note-btn"
              type="button"
              onClick={() => setActiveTab('note')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                activeTab === 'note'
                  ? isLight
                    ? 'bg-white text-slate-950 shadow-xs border border-slate-300/60'
                    : isGlass
                    ? 'bg-white/20 text-white shadow-xs border border-white/10'
                    : 'bg-neutral-900 text-neutral-100 shadow-xs'
                  : isLight
                  ? 'text-slate-600 hover:text-slate-950'
                  : 'text-neutral-400 hover:text-neutral-100'
              }`}
            >
              Note
            </button>
            <button
              id="switch-to-chat-btn"
              type="button"
              onClick={() => setActiveTab('chat')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'chat'
                  ? isLight
                    ? 'bg-white text-slate-950 shadow-xs border border-slate-300/60'
                    : isGlass
                    ? 'bg-white/20 text-white shadow-xs border border-white/10'
                    : 'bg-neutral-900 text-neutral-100 shadow-xs'
                  : isLight
                  ? 'text-slate-600 hover:text-slate-950'
                  : 'text-neutral-400 hover:text-neutral-100'
              }`}
            >
              <span>Chat</span>
              {messages.length > 0 && (
                <span
                  className={`text-[10px] font-mono px-1 rounded-sm ${
                    isLight ? 'bg-slate-300/70 text-slate-800' : 'bg-white/10 text-neutral-300'
                  }`}
                >
                  {messages.length}
                </span>
              )}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Save state badge */}
          {activeTab === 'note' && (
            <div id="save-state-badge" className="text-xs font-mono font-medium transition-opacity">
              {saveState === 'saving' && (
                <span className={isLight ? 'text-amber-600 animate-pulse' : 'text-neutral-400 animate-pulse'}>
                  Saving...
                </span>
              )}
              {saveState === 'saved' && (
                <span className={isLight ? 'text-emerald-700 font-semibold' : 'text-neutral-400'}>
                  Saved
                </span>
              )}
              {saveState === 'offline' && (
                <span className={isLight ? 'text-slate-500' : 'text-neutral-400'} title="Saved locally to device">
                  Offline
                </span>
              )}
              {saveState === 'error' && (
                <span className="text-rose-600 font-semibold">Error</span>
              )}
            </div>
          )}

          {/* Share button */}
          <button
            id="share-note-btn"
            type="button"
            onClick={handleCopyShareLink}
            title="Copy clean share link: https://anote.pages.dev/{slug}"
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
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

      {/* Main Content Area */}
      {activeTab === 'note' ? (
        <div id="note-editor-wrapper" className="flex-1 flex flex-col mt-4 mb-2">
          {isLoadingNote ? (
            <div className={`flex-1 flex items-center justify-center text-xs font-mono ${isLight ? 'text-slate-500' : 'text-neutral-400'}`}>
              Loading note...
            </div>
          ) : (
            <textarea
              ref={textareaRef}
              id="note-content-editor"
              value={content}
              onChange={handleContentChange}
              onKeyDown={handleKeyDown}
              placeholder="Start writing..."
              spellCheck={false}
              autoFocus
              className={`flex-1 w-full resize-none border-none outline-hidden bg-transparent text-base leading-relaxed p-0 focus:ring-0 font-sans tracking-normal transition-colors ${
                isLight
                  ? 'text-slate-900 placeholder-slate-400 font-normal selection:bg-slate-200'
                  : 'text-neutral-100 placeholder-neutral-500 selection:bg-neutral-800'
              }`}
            />
          )}

          {/* Note subtle footer stats */}
          <div
            id="note-word-count-bar"
            className={`py-2 text-[11px] font-mono flex justify-between items-center border-t ${
              isLight
                ? 'text-slate-600 font-medium border-slate-200'
                : isGlass
                ? 'text-slate-400 border-white/10'
                : 'text-neutral-500 border-neutral-800'
            }`}
          >
            <span>{wordCount} {wordCount === 1 ? 'word' : 'words'} · {charCount} chars</span>
            <span className="hidden sm:inline">Ctrl+S to save</span>
          </div>
        </div>
      ) : (
        /* Dual-Person Chat View */
        <div id="note-chat-wrapper" className="flex-1 flex flex-col mt-3 max-w-3xl mx-auto w-full">
          {/* Dual Person Setup Boxes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            {/* Person 1 Box */}
            <div
              id="person-1-card"
              onClick={() => setActiveSpeaker('person1')}
              className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                isLight
                  ? activeSpeaker === 'person1'
                    ? 'bg-emerald-50 border-2 border-emerald-500 shadow-sm ring-2 ring-emerald-500/20'
                    : 'bg-white border border-emerald-300 hover:border-emerald-400 opacity-90 hover:opacity-100 shadow-2xs'
                  : activeSpeaker === 'person1'
                  ? 'bg-emerald-950/40 border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.22)] ring-1 ring-emerald-500/50'
                  : 'bg-emerald-950/15 border-emerald-500/30 hover:border-emerald-500/60 opacity-80 hover:opacity-100'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                      isLight
                        ? 'bg-emerald-600 text-white'
                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50'
                    }`}
                  >
                    1
                  </span>
                  <span
                    className={`text-xs font-bold ${
                      isLight ? 'text-emerald-950' : 'text-emerald-400'
                    }`}
                  >
                    Person One
                  </span>
                </div>

                {activeSpeaker === 'person1' ? (
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded-full flex items-center gap-1.5 font-bold ${
                      isLight
                        ? 'bg-emerald-200 text-emerald-900 border border-emerald-400'
                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span>Active to Send</span>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveSpeaker('person1');
                    }}
                    className={`text-[10px] font-semibold transition-colors ${
                      isLight
                        ? 'text-emerald-700 hover:text-emerald-900 underline'
                        : 'text-neutral-400 hover:text-emerald-300'
                    }`}
                  >
                    Click to switch
                  </button>
                )}
              </div>

              <div onClick={(e) => e.stopPropagation()}>
                <label
                  htmlFor="person-1-name-input"
                  className={`block text-[10px] font-mono font-bold mb-1 ${
                    isLight ? 'text-emerald-900' : 'text-emerald-400/80'
                  }`}
                >
                  Name / Alias
                </label>
                <input
                  id="person-1-name-input"
                  type="text"
                  value={person1Name}
                  onChange={(e) => setPerson1Name(e.target.value)}
                  placeholder="Enter Person 1 name..."
                  className={`w-full text-xs px-2.5 py-1.5 rounded-md font-semibold focus:outline-hidden transition-all ${
                    isLight
                      ? 'bg-white border-2 border-emerald-300 text-emerald-950 placeholder-emerald-400/80 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 shadow-2xs'
                      : 'bg-black/40 border border-emerald-500/40 text-emerald-100 placeholder-emerald-700/60 focus:ring-1 focus:ring-emerald-400'
                  }`}
                />
              </div>
            </div>

            {/* Person 2 Box */}
            <div
              id="person-2-card"
              onClick={() => setActiveSpeaker('person2')}
              className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                isLight
                  ? activeSpeaker === 'person2'
                    ? 'bg-violet-50 border-2 border-violet-500 shadow-sm ring-2 ring-violet-500/20'
                    : 'bg-white border border-violet-300 hover:border-violet-400 opacity-90 hover:opacity-100 shadow-2xs'
                  : activeSpeaker === 'person2'
                  ? 'bg-violet-950/40 border-violet-500 shadow-[0_0_15px_rgba(139,92,246,0.22)] ring-1 ring-violet-500/50'
                  : 'bg-violet-950/15 border-violet-500/30 hover:border-violet-500/60 opacity-80 hover:opacity-100'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                      isLight
                        ? 'bg-violet-600 text-white'
                        : 'bg-violet-500/20 text-violet-300 border border-violet-500/50'
                    }`}
                  >
                    2
                  </span>
                  <span
                    className={`text-xs font-bold ${
                      isLight ? 'text-violet-950' : 'text-violet-400'
                    }`}
                  >
                    Person Two
                  </span>
                </div>

                {activeSpeaker === 'person2' ? (
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded-full flex items-center gap-1.5 font-bold ${
                      isLight
                        ? 'bg-violet-200 text-violet-900 border border-violet-400'
                        : 'bg-violet-500/20 text-violet-300 border border-violet-500/40'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse" />
                    <span>Active to Send</span>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveSpeaker('person2');
                    }}
                    className={`text-[10px] font-semibold transition-colors ${
                      isLight
                        ? 'text-violet-700 hover:text-violet-900 underline'
                        : 'text-neutral-400 hover:text-violet-300'
                    }`}
                  >
                    Click to switch
                  </button>
                )}
              </div>

              <div onClick={(e) => e.stopPropagation()}>
                <label
                  htmlFor="person-2-name-input"
                  className={`block text-[10px] font-mono font-bold mb-1 ${
                    isLight ? 'text-violet-900' : 'text-violet-400/80'
                  }`}
                >
                  Name / Alias
                </label>
                <input
                  id="person-2-name-input"
                  type="text"
                  value={person2Name}
                  onChange={(e) => setPerson2Name(e.target.value)}
                  placeholder="Enter Person 2 name..."
                  className={`w-full text-xs px-2.5 py-1.5 rounded-md font-semibold focus:outline-hidden transition-all ${
                    isLight
                      ? 'bg-white border-2 border-violet-300 text-violet-950 placeholder-violet-400/80 focus:border-violet-600 focus:ring-1 focus:ring-violet-600 shadow-2xs'
                      : 'bg-black/40 border border-violet-500/40 text-violet-100 placeholder-violet-700/60 focus:ring-1 focus:ring-violet-400'
                  }`}
                />
              </div>
            </div>
          </div>

          {/* Quick instructions & room indicator */}
          <div
            className={`px-1 py-1.5 flex items-center justify-between text-[11px] border-b ${
              isLight
                ? 'border-slate-200 text-slate-600 font-medium'
                : isGlass
                ? 'border-white/10 text-slate-400'
                : 'border-neutral-800 text-neutral-400'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="font-semibold">Dual Chat Active</span>
              <span>·</span>
              <span className={`font-mono font-bold ${isLight ? 'text-emerald-900' : 'text-emerald-400'}`}>
                P1: {person1Name || 'Person 1'}
              </span>
              <span>vs</span>
              <span className={`font-mono font-bold ${isLight ? 'text-violet-900' : 'text-violet-400'}`}>
                P2: {person2Name || 'Person 2'}
              </span>
            </div>
            <span className="hidden sm:inline text-[10px] font-mono opacity-80">
              Instant local-first delivery
            </span>
          </div>

          {/* Color-Coded Message List */}
          <div
            id="note-chat-message-list"
            className="flex-1 overflow-y-auto py-4 space-y-3.5 min-h-[360px] max-h-[calc(100vh-320px)] px-1"
          >
            {messages.length === 0 ? (
              <div
                id="chat-empty-state"
                className={`h-full min-h-[200px] flex flex-col items-center justify-center text-xs select-none gap-2 ${
                  isLight ? 'text-slate-600 font-medium' : 'text-neutral-400'
                }`}
              >
                <p>No messages yet in /{slug}.</p>
                <p className="text-[11px] opacity-80">
                  Select Person 1 or Person 2 above and type your message below.
                </p>
              </div>
            ) : (
              messages.map((msg) => {
                const isPerson1 =
                  msg.sender_slot === 'person1' ||
                  (!msg.sender_slot && msg.display_name === person1Name) ||
                  (!msg.sender_slot && msg.username === currentUser.username);

                const timeStr = new Date(msg.created_at).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                });

                return (
                  <div
                    key={msg.id}
                    id={`chat-msg-${msg.id}`}
                    className={`flex flex-col ${isPerson1 ? 'items-start' : 'items-end'}`}
                  >
                    {/* Header: Sender badge with distinct color */}
                    <div className="flex items-center gap-1.5 mb-1 px-1 text-[11px] font-medium">
                      {isPerson1 ? (
                        <>
                          <span
                            className={`w-2 h-2 rounded-full ${
                              isLight ? 'bg-emerald-600' : 'bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.7)]'
                            }`}
                          />
                          <span
                            className={`font-bold ${
                              isLight ? 'text-emerald-950' : 'text-emerald-400'
                            }`}
                          >
                            Person 1: {msg.display_name || person1Name}
                          </span>
                        </>
                      ) : (
                        <>
                          <span
                            className={`font-bold ${
                              isLight ? 'text-violet-950' : 'text-violet-400'
                            }`}
                          >
                            Person 2: {msg.display_name || person2Name}
                          </span>
                          <span
                            className={`w-2 h-2 rounded-full ${
                              isLight ? 'bg-violet-600' : 'bg-violet-400 shadow-[0_0_6px_rgba(139,92,246,0.7)]'
                            }`}
                          />
                        </>
                      )}
                    </div>

                    {/* Chat Bubble with distinct Person 1 vs Person 2 Colors */}
                    <div
                      className={`max-w-[88%] sm:max-w-md px-4 py-2.5 rounded-2xl text-sm break-words transition-all ${
                        isPerson1
                          ? isLight
                            ? 'bg-emerald-100/90 border-2 border-emerald-400 text-emerald-950 font-normal shadow-2xs rounded-tl-xs'
                            : 'bg-emerald-950/70 border border-emerald-500/40 text-emerald-100 shadow-[0_2px_14px_rgba(16,185,129,0.14)] rounded-tl-xs'
                          : isLight
                          ? 'bg-violet-100/90 border-2 border-violet-400 text-violet-950 font-normal shadow-2xs rounded-tr-xs'
                          : 'bg-violet-950/70 border border-violet-500/40 text-violet-100 shadow-[0_2px_14px_rgba(139,92,246,0.14)] rounded-tr-xs'
                      }`}
                    >
                      <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    </div>

                    {/* Timestamp */}
                    <span
                      className={`text-[10px] mt-1 px-1.5 font-mono font-medium ${
                        isLight ? 'text-slate-500' : 'text-neutral-400'
                      }`}
                    >
                      {timeStr}
                    </span>
                  </div>
                );
              })
            )}

            {/* Real-time Unique Animated Typing Indicators */}
            {Object.entries(typingUsers).map(([slot, data]) => {
              const isP1 = slot === 'person1';
              return (
                <div
                  key={`typing-${slot}`}
                  id={`typing-indicator-${slot}`}
                  className={`flex items-center gap-2 text-xs py-1.5 px-3 rounded-full w-fit transition-all duration-300 ${
                    isP1
                      ? isLight
                        ? 'bg-emerald-100 border-2 border-emerald-400 text-emerald-950 font-semibold shadow-xs'
                        : isGlass
                        ? 'glass-surface border border-emerald-500/40 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.2)]'
                        : 'bg-emerald-950/60 border border-emerald-700/60 text-emerald-300'
                      : isLight
                      ? 'bg-violet-100 border-2 border-violet-400 text-violet-950 font-semibold shadow-xs'
                      : isGlass
                      ? 'glass-surface border border-violet-500/40 text-violet-300 shadow-[0_0_15px_rgba(139,92,246,0.2)]'
                      : 'bg-violet-950/60 border border-violet-700/60 text-violet-300'
                  }`}
                >
                  {/* Dynamic Soundwave Harmonic Bars */}
                  <div className="flex items-center gap-0.5 h-3 px-0.5">
                    <span
                      className={`w-0.5 rounded-full typing-bar-1 ${
                        isP1
                          ? isLight ? 'bg-emerald-700' : 'bg-emerald-400'
                          : isLight ? 'bg-violet-700' : 'bg-violet-400'
                      }`}
                    />
                    <span
                      className={`w-0.5 rounded-full typing-bar-2 ${
                        isP1
                          ? isLight ? 'bg-emerald-700' : 'bg-emerald-400'
                          : isLight ? 'bg-violet-700' : 'bg-violet-400'
                      }`}
                    />
                    <span
                      className={`w-0.5 rounded-full typing-bar-3 ${
                        isP1
                          ? isLight ? 'bg-emerald-700' : 'bg-emerald-400'
                          : isLight ? 'bg-violet-700' : 'bg-violet-400'
                      }`}
                    />
                    <span
                      className={`w-0.5 rounded-full typing-bar-4 ${
                        isP1
                          ? isLight ? 'bg-emerald-700' : 'bg-emerald-400'
                          : isLight ? 'bg-violet-700' : 'bg-violet-400'
                      }`}
                    />
                  </div>

                  <span>
                    <strong className="font-bold">
                      {data.name || (isP1 ? person1Name : person2Name)}
                    </strong>{' '}
                    is typing
                  </span>

                  {/* Bouncing Dots */}
                  <div className="flex items-center gap-1 pl-0.5">
                    <span
                      className={`w-1.5 h-1.5 rounded-full typing-dot-1 ${
                        isP1
                          ? isLight ? 'bg-emerald-700' : 'bg-emerald-400'
                          : isLight ? 'bg-violet-700' : 'bg-violet-400'
                      }`}
                    />
                    <span
                      className={`w-1.5 h-1.5 rounded-full typing-dot-2 ${
                        isP1
                          ? isLight ? 'bg-emerald-700' : 'bg-emerald-400'
                          : isLight ? 'bg-violet-700' : 'bg-violet-400'
                      }`}
                    />
                    <span
                      className={`w-1.5 h-1.5 rounded-full typing-dot-3 ${
                        isP1
                          ? isLight ? 'bg-emerald-700' : 'bg-emerald-400'
                          : isLight ? 'bg-violet-700' : 'bg-violet-400'
                      }`}
                    />
                  </div>
                </div>
              );
            })}

            <div ref={chatBottomRef} />
          </div>

          {/* Fast Message Input & Rapid Switch Bar */}
          <form
            onSubmit={handleSendMessage}
            id="note-chat-form"
            className={`pt-3 pb-2 border-t flex items-center gap-2 ${
              isLight
                ? 'border-slate-200'
                : isGlass
                ? 'border-white/10'
                : 'border-neutral-800'
            }`}
          >
            {/* 1-Click Speaker Toggle Button */}
            <button
              id="chat-speaker-toggle-btn"
              type="button"
              onClick={() =>
                setActiveSpeaker((prev) => (prev === 'person1' ? 'person2' : 'person1'))
              }
              title="Click to toggle speaking person (Person 1 ⇄ Person 2)"
              className={`px-3 py-2 text-xs font-bold rounded-lg border transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                activeSpeaker === 'person1'
                  ? isLight
                    ? 'bg-emerald-100 hover:bg-emerald-200 border-2 border-emerald-400 text-emerald-950 shadow-xs'
                    : 'bg-emerald-950/50 border-emerald-500/60 text-emerald-300 hover:bg-emerald-950/70 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
                  : isLight
                  ? 'bg-violet-100 hover:bg-violet-200 border-2 border-violet-400 text-violet-950 shadow-xs'
                  : 'bg-violet-950/50 border-violet-500/60 text-violet-300 hover:bg-violet-950/70 shadow-[0_0_10px_rgba(139,92,246,0.2)]'
              }`}
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              <span>
                {activeSpeaker === 'person1'
                  ? `P1: ${person1Name || 'Person 1'}`
                  : `P2: ${person2Name || 'Person 2'}`}
              </span>
            </button>

            {/* Input field */}
            <input
              id="note-chat-input"
              type="text"
              value={chatInput}
              onChange={handleChatInputChange}
              onKeyDown={(e) => {
                if (e.key === 'Tab' && !chatInput) {
                  e.preventDefault();
                  setActiveSpeaker((prev) => (prev === 'person1' ? 'person2' : 'person1'));
                }
              }}
              placeholder={`Send message as ${
                activeSpeaker === 'person1' ? person1Name || 'Person 1' : person2Name || 'Person 2'
              }...`}
              className={`flex-1 px-3.5 py-2 text-sm rounded-lg transition-all focus:outline-hidden font-medium ${
                isLight
                  ? 'bg-white border-2 border-slate-300 text-slate-900 placeholder-slate-400 focus:border-slate-800 focus:ring-1 focus:ring-slate-800 shadow-xs'
                  : isGlass
                  ? 'glass-input-style text-slate-100 placeholder-slate-500 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400'
                  : 'bg-neutral-900 border border-neutral-700 text-neutral-100 placeholder-neutral-500 focus:ring-1 focus:ring-neutral-100'
              }`}
            />

            {/* Fast Send button */}
            <button
              id="note-chat-send-btn"
              type="submit"
              disabled={!chatInput.trim() || isSendingChat}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed ${
                activeSpeaker === 'person1'
                  ? isLight
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                  : isLight
                  ? 'bg-violet-600 hover:bg-violet-700 text-white shadow-sm'
                  : 'bg-violet-600 hover:bg-violet-500 text-white shadow-[0_0_12px_rgba(139,92,246,0.3)]'
              }`}
            >
              <Send className="w-4 h-4" />
              <span className="hidden sm:inline">Send</span>
            </button>
          </form>

          {/* Bottom Utility Bar: Real-time Status & Clean Chat Option */}
          <div
            id="chat-bottom-utility-bar"
            className={`pt-2 pb-1 px-1 flex items-center justify-between gap-3 text-xs border-t ${
              isLight
                ? 'border-slate-200 text-slate-600'
                : isGlass
                ? 'border-white/5 text-neutral-400'
                : 'border-neutral-800 text-neutral-400'
            }`}
          >
            {/* Left: Real-time speed indicator */}
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="font-mono text-[11px] font-medium">
                Real-time active · 0ms sync
              </span>
            </div>

            {/* Right: Clean Chat Trigger / Confirmation */}
            {showClearConfirm ? (
              <div className="flex items-center gap-2">
                <span className={`text-[11px] font-bold ${isLight ? 'text-rose-700' : 'text-rose-400'}`}>
                  Clear all messages?
                </span>
                <button
                  type="button"
                  onClick={() => setShowClearConfirm(false)}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium cursor-pointer transition-colors ${
                    isLight
                      ? 'bg-slate-200 hover:bg-slate-300 text-slate-800'
                      : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300'
                  }`}
                >
                  Cancel
                </button>
                <button
                  id="confirm-clean-chat-btn"
                  type="button"
                  onClick={handleClearChat}
                  disabled={isClearingChat}
                  className="px-2.5 py-0.5 rounded text-[11px] font-bold bg-rose-600 hover:bg-rose-700 text-white cursor-pointer transition-colors shadow-2xs"
                >
                  {isClearingChat ? 'Clearing...' : 'Clear All'}
                </button>
              </div>
            ) : (
              <button
                id="clean-chat-btn"
                type="button"
                onClick={() => setShowClearConfirm(true)}
                disabled={messages.length === 0}
                title={messages.length === 0 ? 'No messages to clear' : 'Clean all messages in this note'}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                  isLight
                    ? 'text-rose-700 hover:text-rose-900 hover:bg-rose-50 border border-slate-300 hover:border-rose-300'
                    : isGlass
                    ? 'text-rose-400/90 hover:text-rose-300 hover:bg-rose-500/15 border border-white/10'
                    : 'text-rose-400 hover:text-rose-300 hover:bg-neutral-800 border border-neutral-700'
                }`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clean Chat</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
