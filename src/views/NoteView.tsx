import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Share2, Check, Send, User } from 'lucide-react';
import { Note, Message, SaveState, UserProfile } from '../types';
import { fetchNote, saveNoteContent, subscribeToLocalNoteUpdates } from '../services/notesService';
import {
  fetchNoteMessages,
  sendNoteMessage,
  subscribeToNoteMessages,
} from '../services/chatService';
import { isSupabaseConfigured } from '../config/supabase';

interface NoteViewProps {
  slug: string;
  currentUser: UserProfile;
  onNavigateHome: () => void;
  showToast: (text: string, type?: 'info' | 'success' | 'error') => void;
}

export const NoteView: React.FC<NoteViewProps> = ({
  slug,
  currentUser,
  onNavigateHome,
  showToast,
}) => {
  const [activeTab, setActiveTab] = useState<'note' | 'chat'>('note');
  const [content, setContent] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [copied, setCopied] = useState(false);
  const [isLoadingNote, setIsLoadingNote] = useState(true);

  // Chat states
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isSendingChat, setIsSendingChat] = useState(false);

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
  // Load & Subscribe Note Chat
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

    const unsubscribe = subscribeToNoteMessages(slug, (newMsg) => {
      if (!isMounted) return;
      setMessages((prev) => {
        if (prev.some((m) => m.id === newMsg.id)) return prev;
        return [...prev, newMsg];
      });
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [slug]);

  // Scroll chat to bottom on new messages
  useEffect(() => {
    if (activeTab === 'chat') {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, activeTab]);

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
  // Send Chat Message
  // ----------------------------------------------------
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!chatInput.trim() || isSendingChat) return;

    const text = chatInput.trim();
    setChatInput('');
    setIsSendingChat(true);

    const { error } = await sendNoteMessage(slug, text, currentUser);
    setIsSendingChat(false);

    if (error) {
      showToast(error, 'error');
    }
  };

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const charCount = content.length;

  return (
    <div id="note-view-container" className="flex-1 flex flex-col w-full max-w-5xl mx-auto px-4 sm:px-6">
      {/* Subheader / Action Bar */}
      <div id="note-subbar" className="py-3 flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 dark:border-neutral-800">
        <div className="flex items-center gap-3">
          <button
            id="note-slug-btn"
            type="button"
            onClick={onNavigateHome}
            title="Return to home"
            className="text-sm font-mono font-medium text-neutral-900 dark:text-neutral-100 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors cursor-pointer"
          >
            /{slug}
          </button>

          {/* Mode Switcher */}
          <div id="mode-switcher" className="inline-flex rounded-md bg-neutral-100 dark:bg-neutral-800 p-0.5">
            <button
              id="switch-to-note-btn"
              type="button"
              onClick={() => setActiveTab('note')}
              className={`px-3 py-1 text-xs font-medium rounded-sm transition-all cursor-pointer ${
                activeTab === 'note'
                  ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 shadow-xs'
                  : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100'
              }`}
            >
              Note
            </button>
            <button
              id="switch-to-chat-btn"
              type="button"
              onClick={() => setActiveTab('chat')}
              className={`px-3 py-1 text-xs font-medium rounded-sm transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'chat'
                  ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 shadow-xs'
                  : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100'
              }`}
            >
              <span>Chat</span>
              {messages.length > 0 && (
                <span className="text-[10px] text-neutral-400 dark:text-neutral-500 font-mono">
                  {messages.length}
                </span>
              )}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Save state badge */}
          {activeTab === 'note' && (
            <div id="save-state-badge" className="text-xs font-mono transition-opacity">
              {saveState === 'saving' && (
                <span className="text-neutral-400 dark:text-neutral-500 animate-pulse">Saving...</span>
              )}
              {saveState === 'saved' && (
                <span className="text-neutral-500 dark:text-neutral-400">Saved</span>
              )}
              {saveState === 'offline' && (
                <span className="text-neutral-400 dark:text-neutral-500" title="Saved locally to device">
                  Offline
                </span>
              )}
              {saveState === 'error' && (
                <span className="text-red-500">Error</span>
              )}
            </div>
          )}

          {/* Share button */}
          <button
            id="share-note-btn"
            type="button"
            onClick={handleCopyShareLink}
            title="Copy clean share link: https://anote.pages.dev/{slug}"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-100 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-md transition-colors cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <Share2 className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Share'}</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {activeTab === 'note' ? (
        <div id="note-editor-wrapper" className="flex-1 flex flex-col mt-4 mb-2">
          {isLoadingNote ? (
            <div className="flex-1 flex items-center justify-center text-xs text-neutral-400 font-mono">
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
              className="flex-1 w-full resize-none border-none outline-hidden bg-transparent text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-600 text-base leading-relaxed p-0 focus:ring-0 font-sans tracking-normal"
            />
          )}

          {/* Note subtle footer stats */}
          <div id="note-word-count-bar" className="py-2 text-[11px] font-mono text-neutral-400 dark:text-neutral-500 flex justify-between items-center border-t border-neutral-100 dark:border-neutral-800/80">
            <span>{wordCount} {wordCount === 1 ? 'word' : 'words'} · {charCount} chars</span>
            <span className="hidden sm:inline">Ctrl+S to save</span>
          </div>
        </div>
      ) : (
        /* Chat View */
        <div id="note-chat-wrapper" className="flex-1 flex flex-col mt-4 max-w-2xl mx-auto w-full">
          <div id="note-chat-room-header" className="pb-3 border-b border-neutral-100 dark:border-neutral-800 text-xs text-neutral-500 dark:text-neutral-400 flex items-center justify-between">
            <span className="font-medium text-neutral-800 dark:text-neutral-200">
              /{slug} Chat
            </span>
            <span className="text-[11px] font-mono">
              Posting as <strong className="text-neutral-700 dark:text-neutral-300 font-medium">@{currentUser.username}</strong>
            </span>
          </div>

          {/* Message List */}
          <div id="note-chat-message-list" className="flex-1 overflow-y-auto py-4 space-y-3 min-h-[350px] max-h-[calc(100vh-260px)]">
            {messages.length === 0 ? (
              <div id="chat-empty-state" className="h-full flex items-center justify-center text-xs text-neutral-400 dark:text-neutral-500 select-none">
                No messages yet.
              </div>
            ) : (
              messages.map((msg) => {
                const isMine = msg.user_id === currentUser.id || msg.username === currentUser.username;
                const timeStr = new Date(msg.created_at).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                });

                return (
                  <div
                    key={msg.id}
                    id={`chat-msg-${msg.id}`}
                    className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                  >
                    {!isMine && (
                      <span className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400 mb-1 px-1 flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {msg.display_name || msg.username}
                      </span>
                    )}
                    <div
                      className={`max-w-[85%] sm:max-w-md px-3.5 py-2 rounded-lg text-sm break-words ${
                        isMine
                          ? 'bg-neutral-900 text-neutral-100 dark:bg-neutral-100 dark:text-neutral-900'
                          : 'bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    </div>
                    <span className="text-[10px] text-neutral-400 dark:text-neutral-500 mt-1 px-1 font-mono">
                      {timeStr}
                    </span>
                  </div>
                );
              })
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* Message Input */}
          <form onSubmit={handleSendMessage} id="note-chat-form" className="pt-3 pb-2 border-t border-neutral-100 dark:border-neutral-800 flex gap-2">
            <input
              id="note-chat-input"
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 px-3.5 py-2 text-sm bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-hidden focus:ring-1 focus:ring-neutral-900 dark:focus:ring-neutral-100"
            />
            <button
              id="note-chat-send-btn"
              type="submit"
              disabled={!chatInput.trim() || isSendingChat}
              className="px-3.5 py-2 bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-neutral-200 text-white dark:text-neutral-900 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
