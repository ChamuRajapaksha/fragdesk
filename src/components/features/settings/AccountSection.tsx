import { useState } from 'react';
import { UserCircle2 } from 'lucide-react';
import {
  extractErrorMessage,
  isSupabaseConfigured,
  supabase,
} from '../../../community/supabaseClient';
import { useAuth } from '../../../community/useAuth';
import { useToast } from '../../ui';
import type { NavId } from '../../../features/registry';

interface AccountSectionProps {
  setActiveTab?: (tab: NavId) => void;
}

function PasswordInput({
  id,
  value,
  onChange,
  placeholder,
  autoComplete,
  show,
  onToggleShow,
  label,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete: string;
  show: boolean;
  onToggleShow: () => void;
  label: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={show ? 'text' : 'password'}
          required
          minLength={6}
          autoComplete={autoComplete}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-frag-bg border border-frag-border rounded-lg pl-3 pr-10 py-2.5 text-sm text-frag-text placeholder:text-frag-muted focus:outline-none focus:border-frag-primary focus:ring-1 focus:ring-frag-primary/30 transition-colors"
        />
        <button
          type="button"
          onClick={onToggleShow}
          aria-label={show ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-frag-muted hover:text-frag-text p-1 rounded-md transition-colors"
        >
          {show ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.6 18.6 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="1" y1="1" x2="23" y2="23" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}

export default function AccountSection({ setActiveTab }: AccountSectionProps) {
  const { user, loading, signOut } = useAuth();
  const { toast } = useToast();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [changing, setChanging] = useState(false);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase || !user) return;
    setChanging(true);
    try {
      // Re-auth with the current password first -- a session can go stale
      // long before the user notices, and Supabase requires a recent login
      // to change credentials. Treat this as confirmation of identity, not
      // as a redundant sign-in.
      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email: user.email ?? '',
        password: currentPassword,
      });
      if (reauthError) throw reauthError;

      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;

      setCurrentPassword('');
      setNewPassword('');
      toast('Password updated', 'success');
    } catch (err) {
      const message = extractErrorMessage(err);
      toast(message, 'error');
    } finally {
      setChanging(false);
    }
  }

  if (!isSupabaseConfigured) {
    return (
      <section className="bg-frag-surface border border-frag-border rounded-lg p-4 md:p-6 space-y-3">
        <div className="flex items-center gap-3">
          <UserCircle2 size={20} className="text-frag-primary shrink-0" />
          <h2 className="text-lg font-semibold text-frag-text">Account</h2>
        </div>
        <p className="text-sm text-frag-muted break-words">
          Community account features not set up. Add{' '}
          <code className="text-frag-primary">VITE_SUPABASE_URL</code> and{' '}
          <code className="text-frag-primary">VITE_SUPABASE_ANON_KEY</code> to your{' '}
          <code className="text-frag-primary">.env</code> file, then restart the dev server.
        </p>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="bg-frag-surface border border-frag-border rounded-lg p-4 md:p-6">
        <p className="text-sm text-frag-muted">Loading account…</p>
      </section>
    );
  }

  if (!user) {
    return (
      <section className="bg-frag-surface border border-frag-border rounded-lg p-4 md:p-6 space-y-3">
        <div className="flex items-center gap-3">
          <UserCircle2 size={20} className="text-frag-primary shrink-0" />
          <h2 className="text-lg font-semibold text-frag-text">Account</h2>
        </div>
        <p className="text-sm text-frag-muted break-words">
          You&apos;re signed out of your Community account. Sign in to change your password or
          manage your account.
        </p>
        <button
          onClick={() => setActiveTab?.('community')}
          className="px-4 py-2 rounded-lg bg-frag-primary hover:bg-frag-primary/80 active:scale-[0.99] text-frag-bg text-sm font-semibold transition-all"
        >
          Go to Community sign in
        </button>
      </section>
    );
  }

  return (
    <section className="bg-frag-surface border border-frag-border rounded-lg p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <UserCircle2 size={20} className="text-frag-primary shrink-0" />
          <h2 className="text-lg font-semibold text-frag-text">Account</h2>
        </div>
        <button onClick={() => signOut()} className="text-sm text-frag-danger hover:underline">
          Sign out
        </button>
      </div>

      <p className="text-sm text-frag-muted break-words">
        Signed in as <span className="text-frag-text">{user.email}</span>
      </p>

      <form onSubmit={handleChangePassword} className="space-y-3 max-w-sm">
        <div>
          <label htmlFor="account-current-password" className="sr-only">
            Current password
          </label>
          <PasswordInput
            id="account-current-password"
            label="Current password"
            placeholder="Current password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={setCurrentPassword}
            show={showCurrent}
            onToggleShow={() => setShowCurrent((v) => !v)}
          />
        </div>
        <div>
          <label htmlFor="account-new-password" className="sr-only">
            New password
          </label>
          <PasswordInput
            id="account-new-password"
            label="New password"
            placeholder="New password (min 6 characters)"
            autoComplete="new-password"
            value={newPassword}
            onChange={setNewPassword}
            show={showNew}
            onToggleShow={() => setShowNew((v) => !v)}
          />
        </div>
        <button
          type="submit"
          disabled={changing || newPassword.length < 6}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-frag-primary hover:bg-frag-primary/80 active:scale-[0.99] text-frag-bg text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          {changing && (
            <svg
              className="animate-spin"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
              <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
          )}
          {changing ? 'Updating…' : 'Change password'}
        </button>
      </form>
    </section>
  );
}