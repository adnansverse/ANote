import React from 'react';
import { ToastMessage } from '../types';

interface ToastProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const Toast: React.FC<ToastProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div id="toast-container" className="fixed bottom-12 right-6 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          id={`toast-${toast.id}`}
          onClick={() => onDismiss(toast.id)}
          className={`pointer-events-auto px-3.5 py-2 rounded-md text-xs font-medium shadow-sm transition-all duration-200 cursor-pointer ${
            toast.type === 'error'
              ? 'bg-red-900/90 text-red-100 border border-red-700/50'
              : toast.type === 'success'
              ? 'bg-neutral-900 text-neutral-100 dark:bg-neutral-100 dark:text-neutral-900 border border-neutral-800 dark:border-neutral-200'
              : 'bg-neutral-800 text-neutral-200 dark:bg-neutral-200 dark:text-neutral-800'
          }`}
        >
          {toast.text}
        </div>
      ))}
    </div>
  );
};
