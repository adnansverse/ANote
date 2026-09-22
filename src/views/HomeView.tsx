import React, { useState } from 'react';
import { cleanSlug, getRecentNotes } from '../services/notesService';
import { ArrowRight } from 'lucide-react';

interface HomeViewProps {
  onNavigateToNote: (slug: string) => void;
}

export const HomeView: React.FC<HomeViewProps> = ({ onNavigateToNote }) => {
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

  return (
    <div id="home-view" className="flex-1 flex flex-col justify-center items-center px-4">
      <div className="w-full max-w-sm flex flex-col items-center text-center">
        <h1 id="home-brand-title" className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100 mb-8">
          ANote
        </h1>

        <form onSubmit={handleCreate} className="w-full space-y-3">
          <div className="relative flex items-center">
            <span className="absolute left-3.5 text-neutral-400 dark:text-neutral-500 text-sm font-mono select-none">
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
              className="w-full pl-7 pr-4 py-2.5 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-lg text-sm text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-hidden focus:ring-1 focus:ring-neutral-900 dark:focus:ring-neutral-100 focus:border-neutral-900 dark:focus:border-neutral-100 font-mono transition-colors"
            />
          </div>

          {error && (
            <p id="slug-error-msg" className="text-xs text-red-600 dark:text-red-400 text-left">
              {error}
            </p>
          )}

          <button
            id="create-note-btn"
            type="submit"
            className="w-full py-2.5 px-4 bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-neutral-200 text-white dark:text-neutral-900 text-sm font-medium rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-2"
          >
            <span>Create</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {recentNotes.length > 0 && (
          <div id="recent-notes-list" className="mt-8 pt-6 border-t border-neutral-100 dark:border-neutral-800/80 w-full text-left">
            <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-2">
              Recent Notes
            </div>
            <div className="flex flex-wrap gap-1.5">
              {recentNotes.slice(0, 5).map((slug) => (
                <button
                  key={slug}
                  id={`recent-note-${slug}`}
                  type="button"
                  onClick={() => onNavigateToNote(slug)}
                  className="text-xs font-mono text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 px-2 py-1 rounded transition-colors cursor-pointer"
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
