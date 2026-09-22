import React, { useState, useEffect, useRef } from 'react';
import { Send, Plus, User, ArrowLeft } from 'lucide-react';
import { DirectConversation, DirectMessage, UserProfile } from '../types';
import {
  getLocalDirectConversations,
  saveLocalDirectConversation,
  getLocalDirectMessages,
  sendDirectMessage,
  subscribeToDirectMessages,
} from '../services/chatService';

interface DirectChatViewProps {
  currentUser: UserProfile;
  showToast: (text: string, type?: 'info' | 'success' | 'error') => void;
}

export const DirectChatView: React.FC<DirectChatViewProps> = ({ currentUser, showToast }) => {
  const [conversations, setConversations] = useState<DirectConversation[]>([]);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newRecipientUsername, setNewRecipientUsername] = useState('');

  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Load conversations
  useEffect(() => {
    const loaded = getLocalDirectConversations();
    setConversations(loaded);
    if (loaded.length > 0 && !selectedConvId) {
      setSelectedConvId(loaded[0].id);
    }
  }, []);

  // Load messages & subscribe when selected conversation changes
  useEffect(() => {
    if (!selectedConvId) {
      setMessages([]);
      return;
    }

    const loaded = getLocalDirectMessages(selectedConvId);
    setMessages(loaded);

    const unsubscribe = subscribeToDirectMessages(selectedConvId, (newMsg) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === newMsg.id)) return prev;
        return [...prev, newMsg];
      });
      // Refresh conversation list to update last_message
      setConversations(getLocalDirectConversations());
    });

    return () => {
      unsubscribe();
    };
  }, [selectedConvId]);

  // Scroll to bottom
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const activeConversation = conversations.find((c) => c.id === selectedConvId);

  const getRecipientName = (conv: DirectConversation) => {
    const otherId = conv.participant_ids.find((id) => id !== currentUser.id);
    if (otherId && conv.participant_names[otherId]) {
      return conv.participant_names[otherId];
    }
    return 'Chat';
  };

  const handleCreateConversation = (e: React.FormEvent) => {
    e.preventDefault();
    const recipient = newRecipientUsername.trim().toLowerCase().replace(/^@/, '');
    if (!recipient) return;

    if (recipient === currentUser.username.toLowerCase()) {
      showToast('Cannot start a direct conversation with yourself', 'error');
      return;
    }

    const existing = conversations.find((c) =>
      c.participant_usernames &&
      Object.values(c.participant_usernames).some((u) => u.toLowerCase() === recipient)
    );

    if (existing) {
      setSelectedConvId(existing.id);
      setIsCreatingNew(false);
      setNewRecipientUsername('');
      return;
    }

    const newConvId = `conv_${Date.now()}`;
    const newConv: DirectConversation = {
      id: newConvId,
      participant_ids: [currentUser.id, `user_${recipient}`],
      participant_names: {
        [currentUser.id]: currentUser.display_name,
        [`user_${recipient}`]: recipient,
      },
      participant_usernames: {
        [currentUser.id]: currentUser.username,
        [`user_${recipient}`]: recipient,
      },
      created_at: new Date().toISOString(),
    };

    saveLocalDirectConversation(newConv);
    setConversations([newConv, ...conversations]);
    setSelectedConvId(newConvId);
    setIsCreatingNew(false);
    setNewRecipientUsername('');
    showToast(`Conversation started with @${recipient}`, 'success');
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || !selectedConvId || isSending) return;

    const text = inputMessage.trim();
    setInputMessage('');
    setIsSending(true);

    const { message, error } = await sendDirectMessage(selectedConvId, text, currentUser);
    setIsSending(false);

    if (error) {
      showToast(error, 'error');
    } else if (message) {
      setMessages((prev) => {
        if (prev.some((m) => m.id === message.id)) return prev;
        return [...prev, message];
      });
      setConversations(getLocalDirectConversations());
    }
  };

  return (
    <div id="direct-chat-view" className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 py-4 flex flex-col">
      <div className="flex-1 grid grid-cols-1 md:grid-cols-3 border border-neutral-200/80 dark:border-neutral-800 rounded-lg overflow-hidden bg-white dark:bg-neutral-900 shadow-xs min-h-[500px]">
        {/* Left pane: Conversations */}
        <div
          id="direct-chat-sidebar"
          className={`border-r border-neutral-200/80 dark:border-neutral-800 flex flex-col ${
            selectedConvId ? 'hidden md:flex' : 'flex'
          }`}
        >
          <div className="p-3.5 border-b border-neutral-200/80 dark:border-neutral-800 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              Messages
            </span>
            <button
              id="new-direct-chat-btn"
              type="button"
              onClick={() => setIsCreatingNew(true)}
              title="New direct conversation"
              className="p-1 text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* New conversation inline modal */}
          {isCreatingNew && (
            <form onSubmit={handleCreateConversation} className="p-3 bg-neutral-50 dark:bg-neutral-800/60 border-b border-neutral-200 dark:border-neutral-700">
              <label htmlFor="new-recipient-username-input" className="block text-[11px] text-neutral-500 dark:text-neutral-400 mb-1">
                Enter username to message:
              </label>
              <div className="flex gap-1.5">
                <input
                  id="new-recipient-username-input"
                  type="text"
                  value={newRecipientUsername}
                  onChange={(e) => setNewRecipientUsername(e.target.value)}
                  placeholder="e.g. adnan"
                  autoFocus
                  className="flex-1 px-2.5 py-1 text-xs bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded text-neutral-900 dark:text-neutral-100"
                />
                <button
                  id="submit-new-chat-btn"
                  type="submit"
                  className="px-2.5 py-1 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-xs font-medium rounded cursor-pointer"
                >
                  Start
                </button>
                <button
                  id="cancel-new-chat-btn"
                  type="button"
                  onClick={() => setIsCreatingNew(false)}
                  className="px-2 py-1 text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* Conversation list */}
          <div className="flex-1 overflow-y-auto">
            {conversations.length === 0 ? (
              <div className="p-6 text-center text-xs text-neutral-400 dark:text-neutral-500 select-none">
                No conversations yet.
              </div>
            ) : (
              conversations.map((conv) => {
                const isSelected = conv.id === selectedConvId;
                const name = getRecipientName(conv);

                return (
                  <button
                    key={conv.id}
                    id={`conversation-item-${conv.id}`}
                    type="button"
                    onClick={() => setSelectedConvId(conv.id)}
                    className={`w-full text-left p-3 border-b border-neutral-100 dark:border-neutral-800/60 transition-colors flex flex-col gap-0.5 cursor-pointer ${
                      isSelected
                        ? 'bg-neutral-100/80 dark:bg-neutral-800/80'
                        : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/30'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-neutral-400" />
                        {name}
                      </span>
                      {conv.last_message_at && (
                        <span className="text-[10px] text-neutral-400 font-mono">
                          {new Date(conv.last_message_at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      )}
                    </div>
                    {conv.last_message && (
                      <p className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
                        {conv.last_message}
                      </p>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right pane: Active Thread */}
        <div
          id="direct-chat-thread"
          className={`md:col-span-2 flex flex-col h-full ${
            !selectedConvId ? 'hidden md:flex' : 'flex'
          }`}
        >
          {activeConversation ? (
            <>
              {/* Thread Header */}
              <div className="p-3.5 border-b border-neutral-200/80 dark:border-neutral-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedConvId(null)}
                    className="md:hidden p-1 text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <span className="text-xs font-medium text-neutral-900 dark:text-neutral-100">
                    {getRecipientName(activeConversation)}
                  </span>
                </div>
                <span className="text-[11px] text-neutral-400 font-mono">
                  Direct message
                </span>
              </div>

              {/* Message List */}
              <div id="direct-messages-scroll" className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[500px]">
                {messages.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-neutral-400 dark:text-neutral-500 select-none">
                    No messages yet.
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isMine = msg.sender_id === currentUser.id;
                    const timeStr = new Date(msg.created_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    });

                    return (
                      <div
                        key={msg.id}
                        id={`direct-msg-${msg.id}`}
                        className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                      >
                        <div
                          className={`max-w-[85%] px-3.5 py-2 rounded-lg text-sm break-words ${
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

              {/* Input Area */}
              <form onSubmit={handleSendMessage} className="p-3 border-t border-neutral-200/80 dark:border-neutral-800 flex gap-2">
                <input
                  id="direct-message-input"
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-1 px-3 py-2 text-sm bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-hidden focus:ring-1 focus:ring-neutral-900 dark:focus:ring-neutral-100"
                />
                <button
                  id="send-direct-message-btn"
                  type="submit"
                  disabled={!inputMessage.trim() || isSending}
                  className="px-3.5 py-2 bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-neutral-200 text-white dark:text-neutral-900 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-xs text-neutral-400 select-none">
              Select or start a conversation.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
