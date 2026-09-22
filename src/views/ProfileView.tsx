import React, { useState } from 'react';
import { User, LogOut, ShieldCheck, Mail, Calendar } from 'lucide-react';
import { UserProfile, ThemeMode } from '../types';
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
  theme?: ThemeMode;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  currentUser,
  onUserUpdated,
  showToast,
  onNavigateToSettings,
  theme = 'glassroom',
}) => {
  const isCloud = isSupabaseConfigured();
  const isLight = theme === 'light';
  const isGlass = theme === 'glassroom';

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
      <div
        className={`rounded-2xl p-6 transition-all ${
          isLight
            ? 'bg-white border-2 border-slate-300 shadow-md space-y-6'
            : isGlass
            ? 'glass-surface border border-white/10 shadow-2xl space-y-6'
            : 'border border-neutral-800 bg-neutral-900 shadow-xs space-y-6'
        }`}
      >
        {/* Header with Avatar and Names */}
        <div className="flex items-center gap-4">
          <div
            className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg ${
              isLight
                ? 'bg-slate-100 text-slate-900 border-2 border-slate-300'
                : isGlass
                ? 'bg-white/10 text-white border border-white/15'
                : 'bg-neutral-800 text-neutral-300 border border-neutral-700'
            }`}
          >
            {currentUser.avatar_url ? (
              <img
                src={currentUser.avatar_url}
                alt={currentUser.display_name}
                className="w-full h-full rounded-full object-cover"
              />
            ) : (
              <User className={`w-6 h-6 ${isLight ? 'text-slate-700' : 'text-neutral-400'}`} />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <h2 className={`text-base font-bold truncate ${isLight ? 'text-slate-950' : 'text-neutral-100'}`}>
              {currentUser.display_name}
            </h2>
            <p className={`text-xs font-mono font-medium truncate ${isLight ? 'text-slate-600' : 'text-neutral-400'}`}>
              @{currentUser.username}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsEditing(!isEditing)}
            className={`text-xs font-semibold cursor-pointer underline underline-offset-2 ${
              isLight
                ? 'text-slate-700 hover:text-slate-950'
                : 'text-neutral-400 hover:text-neutral-100'
            }`}
          >
            {isEditing ? 'Cancel' : 'Edit'}
          </button>
        </div>

        {/* Profile Edit Mode */}
        {isEditing ? (
          <form
            onSubmit={handleSaveProfile}
            className={`space-y-3 pt-3 border-t ${
              isLight ? 'border-slate-200' : isGlass ? 'border-white/10' : 'border-neutral-800'
            }`}
          >
            <div>
              <label
                htmlFor="edit-display-name"
                className={`block text-[11px] uppercase tracking-wider font-bold mb-1 ${
                  isLight ? 'text-slate-800' : 'text-neutral-400'
                }`}
              >
                Display Name
              </label>
              <input
                id="edit-display-name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className={`w-full px-3 py-1.5 text-xs rounded font-medium focus:outline-hidden ${
                  isLight
                    ? 'bg-white border-2 border-slate-300 text-slate-900 focus:border-slate-800 focus:ring-1 focus:ring-slate-800'
                    : isGlass
                    ? 'glass-input-style text-white placeholder-slate-400'
                    : 'bg-neutral-800 border border-neutral-700 text-neutral-100'
                }`}
              />
            </div>
            <div>
              <label
                htmlFor="edit-username"
                className={`block text-[11px] uppercase tracking-wider font-bold mb-1 ${
                  isLight ? 'text-slate-800' : 'text-neutral-400'
                }`}
              >
                Username
              </label>
              <input
                id="edit-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className={`w-full px-3 py-1.5 text-xs font-mono rounded font-medium focus:outline-hidden ${
                  isLight
                    ? 'bg-white border-2 border-slate-300 text-slate-900 focus:border-slate-800 focus:ring-1 focus:ring-slate-800'
                    : isGlass
                    ? 'glass-input-style text-white placeholder-slate-400'
                    : 'bg-neutral-800 border border-neutral-700 text-neutral-100'
                }`}
              />
            </div>
            <button
              type="submit"
              className={`w-full py-2 text-xs font-bold rounded cursor-pointer transition-all shadow-xs ${
                isLight
                  ? 'bg-slate-900 hover:bg-slate-800 text-white'
                  : 'bg-neutral-100 hover:bg-white text-neutral-900'
              }`}
            >
              Save Changes
            </button>
          </form>
        ) : (
          /* Profile Details */
          <div
            className={`space-y-2.5 pt-3 border-t text-xs ${
              isLight ? 'border-slate-200' : isGlass ? 'border-white/10' : 'border-neutral-800'
            }`}
          >
            {currentUser.email && (
              <div className={`flex items-center gap-2 font-medium ${isLight ? 'text-slate-800' : 'text-neutral-300'}`}>
                <Mail className={`w-3.5 h-3.5 ${isLight ? 'text-slate-600' : 'text-neutral-400'}`} />
                <span>{currentUser.email}</span>
              </div>
            )}
            <div className={`flex items-center gap-2 font-medium ${isLight ? 'text-slate-800' : 'text-neutral-300'}`}>
              <Calendar className={`w-3.5 h-3.5 ${isLight ? 'text-slate-600' : 'text-neutral-400'}`} />
              <span>Created on {formattedDate}</span>
            </div>
            <div className={`flex items-center gap-2 font-medium ${isLight ? 'text-slate-800' : 'text-neutral-300'}`}>
              <ShieldCheck className={`w-3.5 h-3.5 ${isLight ? 'text-slate-600' : 'text-neutral-400'}`} />
              <span>
                {currentUser.is_guest ? 'Local Session' : 'Supabase Authenticated'}
              </span>
            </div>
          </div>
        )}

        {/* Authentication Section */}
        {currentUser.is_guest ? (
          <div
            className={`pt-4 border-t ${
              isLight ? 'border-slate-200' : isGlass ? 'border-white/10' : 'border-neutral-800'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className={`text-xs font-bold ${isLight ? 'text-slate-950' : 'text-neutral-200'}`}>
                {authMode === 'signin' ? 'Sign in to cloud' : 'Create cloud account'}
              </span>
              <button
                type="button"
                onClick={() => setAuthMode(authMode === 'signin' ? 'signup' : 'signin')}
                className={`text-[11px] font-semibold cursor-pointer ${
                  isLight
                    ? 'text-slate-600 hover:text-slate-950 underline'
                    : 'text-neutral-400 hover:text-neutral-100'
                }`}
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
                className={`w-full px-3 py-1.5 text-xs rounded font-medium focus:outline-hidden ${
                  isLight
                    ? 'bg-white border-2 border-slate-300 text-slate-900 placeholder-slate-400 focus:border-slate-800'
                    : isGlass
                    ? 'glass-input-style text-white placeholder-slate-400'
                    : 'bg-neutral-800 border border-neutral-700 text-neutral-100 placeholder-neutral-500'
                }`}
              />
              <input
                id="auth-password-input"
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`w-full px-3 py-1.5 text-xs rounded font-medium focus:outline-hidden ${
                  isLight
                    ? 'bg-white border-2 border-slate-300 text-slate-900 placeholder-slate-400 focus:border-slate-800'
                    : isGlass
                    ? 'glass-input-style text-white placeholder-slate-400'
                    : 'bg-neutral-800 border border-neutral-700 text-neutral-100 placeholder-neutral-500'
                }`}
              />

              <button
                id="auth-submit-btn"
                type="submit"
                disabled={isSubmittingAuth}
                className={`w-full py-2 text-xs font-bold rounded transition-colors disabled:opacity-50 cursor-pointer shadow-xs ${
                  isLight
                    ? 'bg-slate-900 hover:bg-slate-800 text-white'
                    : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-900'
                }`}
              >
                {isSubmittingAuth ? 'Processing...' : authMode === 'signin' ? 'Sign In' : 'Sign Up'}
              </button>

              {!isCloud && (
                <p className={`text-[11px] text-center pt-1 ${isLight ? 'text-slate-600' : 'text-neutral-400'}`}>
                  Cloud auth requires Supabase.{' '}
                  <button
                    type="button"
                    onClick={onNavigateToSettings}
                    className={`underline cursor-pointer ${
                      isLight ? 'text-slate-900 font-semibold' : 'text-neutral-200'
                    }`}
                  >
                    Configure in Settings
                  </button>
                </p>
              )}
            </form>
          </div>
        ) : (
          <div
            className={`pt-3 border-t ${
              isLight ? 'border-slate-200' : isGlass ? 'border-white/10' : 'border-neutral-800'
            }`}
          >
            <button
              id="sign-out-btn"
              type="button"
              onClick={handleSignOut}
              className={`w-full py-2 text-xs font-bold rounded transition-colors cursor-pointer flex items-center justify-center gap-2 border ${
                isLight
                  ? 'text-rose-700 bg-rose-50 hover:bg-rose-100 border-rose-300'
                  : 'text-red-400 hover:bg-red-950/20 border-red-900/40'
              }`}
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
