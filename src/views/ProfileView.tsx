import React, { useState } from 'react';
import { User, LogOut, ShieldCheck, Mail, Calendar } from 'lucide-react';
import { UserProfile } from '../types';
import {
  updateLocalUser,
  signInWithEmail,
  signUpWithEmail,
  signOutUser,
} from '../services/authService';
import { isSupabaseConfigured } from '../config/supabase';

interface ProfileViewProps {
  currentUser: UserProfile;
  onUserUpdated: (user: UserProfile) => void;
  showToast: (text: string, type?: 'info' | 'success' | 'error') => void;
  onNavigateToSettings: () => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  currentUser,
  onUserUpdated,
  showToast,
  onNavigateToSettings,
}) => {
  const isCloud = isSupabaseConfigured();

  const [displayName, setDisplayName] = useState(currentUser.display_name);
  const [username, setUsername] = useState(currentUser.username);
  const [isEditing, setIsEditing] = useState(false);

  // Auth form
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUser = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    const cleanName = displayName.trim();

    if (!cleanUser) {
      showToast('Username cannot be empty', 'error');
      return;
    }

    const updated = updateLocalUser({
      display_name: cleanName || cleanUser,
      username: cleanUser,
    });
    onUserUpdated(updated);
    setIsEditing(false);
    showToast('Profile updated', 'success');
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      showToast('Please enter both email and password', 'error');
      return;
    }

    if (!isCloud) {
      showToast('Supabase is not configured yet. Configure Supabase in Settings first.', 'error');
      return;
    }

    setIsSubmittingAuth(true);

    if (authMode === 'signup') {
      const { user, error } = await signUpWithEmail(email.trim(), password, displayName);
      setIsSubmittingAuth(false);
      if (error) {
        showToast(error, 'error');
      } else if (user) {
        onUserUpdated(user);
        showToast('Account created successfully', 'success');
      }
    } else {
      const { user, error } = await signInWithEmail(email.trim(), password);
      setIsSubmittingAuth(false);
      if (error) {
        showToast(error, 'error');
      } else if (user) {
        onUserUpdated(user);
        showToast('Signed in successfully', 'success');
      }
    }
  };

  const handleSignOut = async () => {
    const { error } = await signOutUser();
    if (error) {
      showToast(error, 'error');
    } else {
      // Revert to local user
      const local = updateLocalUser({
        is_guest: true,
        email: undefined,
      });
      onUserUpdated(local);
      showToast('Signed out', 'info');
    }
  };

  const formattedDate = new Date(currentUser.created_at).toLocaleDateString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div id="profile-view" className="flex-1 w-full max-w-md mx-auto px-4 py-8 flex flex-col justify-center">
      <div className="border border-neutral-200/80 dark:border-neutral-800 rounded-lg p-6 bg-white dark:bg-neutral-900 shadow-xs space-y-6">
        {/* Header with Avatar and Names */}
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-700 dark:text-neutral-300 font-semibold text-lg border border-neutral-200 dark:border-neutral-700">
            {currentUser.avatar_url ? (
              <img
                src={currentUser.avatar_url}
                alt={currentUser.display_name}
                className="w-full h-full rounded-full object-cover"
              />
            ) : (
              <User className="w-6 h-6 text-neutral-500 dark:text-neutral-400" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100 truncate">
              {currentUser.display_name}
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 font-mono truncate">
              @{currentUser.username}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsEditing(!isEditing)}
            className="text-xs text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 cursor-pointer underline underline-offset-2"
          >
            {isEditing ? 'Cancel' : 'Edit'}
          </button>
        </div>

        {/* Profile Edit Mode */}
        {isEditing ? (
          <form onSubmit={handleSaveProfile} className="space-y-3 pt-2 border-t border-neutral-100 dark:border-neutral-800">
            <div>
              <label htmlFor="edit-display-name" className="block text-[11px] uppercase tracking-wider text-neutral-500 font-medium mb-1">
                Display Name
              </label>
              <input
                id="edit-display-name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded text-neutral-900 dark:text-neutral-100"
              />
            </div>
            <div>
              <label htmlFor="edit-username" className="block text-[11px] uppercase tracking-wider text-neutral-500 font-medium mb-1">
                Username
              </label>
              <input
                id="edit-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-1.5 text-xs font-mono bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded text-neutral-900 dark:text-neutral-100"
              />
            </div>
            <button
              type="submit"
              className="w-full py-2 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-xs font-medium rounded cursor-pointer"
            >
              Save Changes
            </button>
          </form>
        ) : (
          /* Profile Details */
          <div className="space-y-2 pt-2 border-t border-neutral-100 dark:border-neutral-800 text-xs">
            {currentUser.email && (
              <div className="flex items-center gap-2 text-neutral-600 dark:text-neutral-400">
                <Mail className="w-3.5 h-3.5 text-neutral-400" />
                <span>{currentUser.email}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-neutral-600 dark:text-neutral-400">
              <Calendar className="w-3.5 h-3.5 text-neutral-400" />
              <span>Created on {formattedDate}</span>
            </div>
            <div className="flex items-center gap-2 text-neutral-600 dark:text-neutral-400">
              <ShieldCheck className="w-3.5 h-3.5 text-neutral-400" />
              <span>
                {currentUser.is_guest ? 'Local Session' : 'Supabase Authenticated'}
              </span>
            </div>
          </div>
        )}

        {/* Authentication Section */}
        {currentUser.is_guest ? (
          <div className="pt-4 border-t border-neutral-100 dark:border-neutral-800">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-neutral-800 dark:text-neutral-200">
                {authMode === 'signin' ? 'Sign in to cloud' : 'Create cloud account'}
              </span>
              <button
                type="button"
                onClick={() => setAuthMode(authMode === 'signin' ? 'signup' : 'signin')}
                className="text-[11px] text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 cursor-pointer"
              >
                {authMode === 'signin' ? 'Need an account?' : 'Already registered?'}
              </button>
            </div>

            <form onSubmit={handleAuthSubmit} className="space-y-2.5">
              <input
                id="auth-email-input"
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded text-neutral-900 dark:text-neutral-100 placeholder-neutral-400"
              />
              <input
                id="auth-password-input"
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded text-neutral-900 dark:text-neutral-100 placeholder-neutral-400"
              />

              <button
                id="auth-submit-btn"
                type="submit"
                disabled={isSubmittingAuth}
                className="w-full py-2 bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-neutral-200 text-white dark:text-neutral-900 text-xs font-medium rounded transition-colors disabled:opacity-50 cursor-pointer"
              >
                {isSubmittingAuth ? 'Processing...' : authMode === 'signin' ? 'Sign In' : 'Sign Up'}
              </button>

              {!isCloud && (
                <p className="text-[11px] text-neutral-400 text-center pt-1">
                  Cloud auth requires Supabase.{' '}
                  <button
                    type="button"
                    onClick={onNavigateToSettings}
                    className="underline cursor-pointer hover:text-neutral-700 dark:hover:text-neutral-200"
                  >
                    Configure in Settings
                  </button>
                </p>
              )}
            </form>
          </div>
        ) : (
          <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800">
            <button
              id="sign-out-btn"
              type="button"
              onClick={handleSignOut}
              className="w-full py-2 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 border border-red-200 dark:border-red-900/40 rounded transition-colors cursor-pointer flex items-center justify-center gap-2"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Log Out</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
