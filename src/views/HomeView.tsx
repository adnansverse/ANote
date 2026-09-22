import React, { useState } from 'react';
import { cleanSlug, getRecentNotes } from '../services/notesService';
import { ArrowRight, Sparkles } from 'lucide-react';
import { ThemeMode } from '../types';

interface HomeViewProps {
  onNavigateToNote: (slug: string) => void;
  theme?: ThemeMode;
}

export const HomeView: React.FC<HomeViewProps> = ({ onNavigateToNote, theme = 'glassroom' }) => {
  const [slugInput, setSlugInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const recentNotes = getRecentNotes();

  const handleCreate = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const slug = cleanSlug(slugInput);
    if (!slug) {
      setError('Please enter a note name.');
      return;
    }
    setError(null);
    onNavigateToNote(slug);
  };

  const isLight = theme === 'light';
  const isGlass = theme === 'glassroom';

  return (
    <div id="home-view" className="flex-1 flex flex-col justify-center items-center px-4 py-12">
      <div className="w-full max-w-sm flex flex-col items-center text-center">
        <div className="flex items-center gap-2 mb-8">
          <h1
            id="home-brand-title"
            className={`text-3xl font-bold tracking-tight ${
              isLight
                ? 'text-slate-900'
                : isGlass
                ? 'text-transparent bg-clip-text bg-gradient-to-r from-cyan-200 via-white to-slate-200'
                : 'text-neutral-100'
            }`}
          >
            ANote
          </h1>
          {isGlass && <Sparkles className="w-4 h-4 text-cyan-300 animate-pulse" />}
        </div>

        <form onSubmit={handleCreate} className="w-full space-y-3">
          <div className="relative flex items-center">
            <span
              className={`absolute left-3.5 text-sm font-mono font-bold select-none ${
                isLight ? 'text-slate-500' : 'text-neutral-400'
              }`}
            >
              /
            </span>
            <input
              id="note-slug-input"
              type="text"
              value={slugInput}
              onChange={(e) => {
                setSlugInput(e.target.value);
                if (error) setError(null);
              }}
              placeholder="my-notes"
              autoFocus
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className={`w-full pl-7 pr-4 py-2.5 rounded-lg text-sm font-mono transition-all focus:outline-hidden ${
                isLight
                  ? 'bg-white border-2 border-slate-300 text-slate-900 placeholder-slate-400 focus:border-slate-800 focus:ring-1 focus:ring-slate-800 shadow-xs'
                  : isGlass
                  ? 'glass-input-style text-slate-100 placeholder-slate-500 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400'
                  : 'bg-neutral-900 border border-neutral-700 text-neutral-100 placeholder-neutral-500 focus:ring-1 focus:ring-neutral-100'
              }`}
            />
          </div>

          {error && (
            <p id="slug-error-msg" className="text-xs text-rose-600 dark:text-rose-400 font-medium text-left">
              {error}
            </p>
          )}

          <button
            id="create-note-btn"
            type="submit"
            className={`w-full py-2.5 px-4 text-sm font-semibold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-2 ${
              isLight
                ? 'bg-slate-900 hover:bg-slate-800 text-white shadow-sm'
                : isGlass
                ? 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-[0_0_15px_rgba(6,182,212,0.3)]'
                : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-900'
            }`}
          >
            <span>Create Note</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {recentNotes.length > 0 && (
          <div
            id="recent-notes-list"
            className={`mt-8 pt-6 border-t w-full text-left ${
              isLight
                ? 'border-slate-200'
                : isGlass
                ? 'border-white/10'
                : 'border-neutral-800'
            }`}
          >
            <div
              className={`text-[11px] font-semibold uppercase tracking-wider mb-2.5 ${
                isLight ? 'text-slate-600' : 'text-neutral-400'
              }`}
            >
              Recent Notes
            </div>
            <div className="flex flex-wrap gap-1.5">
              {recentNotes.slice(0, 5).map((slug) => (
                <button
                  key={slug}
                  id={`recent-note-${slug}`}
                  type="button"
                  onClick={() => onNavigateToNote(slug)}
                  className={`text-xs font-mono px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                    isLight
                      ? 'text-slate-900 bg-white hover:bg-slate-100 border border-slate-300 font-medium shadow-2xs'
                      : isGlass
                      ? 'text-slate-200 bg-white/10 hover:bg-white/15 border border-white/10'
                      : 'text-neutral-300 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700'
                  }`}
                >
                  /{slug}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
