import React, { useState } from 'react';
import { ShieldAlert, Lock, KeyRound, Loader2, X, Eye, EyeOff, AlertTriangle } from 'lucide-react';

interface MainAdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (token: string) => void;
}

export const MainAdminModal: React.FC<MainAdminModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setErrorMessage('Please enter the Main Admin password.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const storedToken =
        localStorage.getItem('ps_admin_token') ||
        localStorage.getItem('pscrappers_admin_token') ||
        'ps_admin_session_token_secure_2026';

      const res = await fetch('/api/auth/verify-main-admin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${storedToken}`,
          'x-admin-token': storedToken,
        },
        body: JSON.stringify({ password: password.trim() }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.message || 'Incorrect Main Admin password.');
      }

      const token = data.token;
      if (token && typeof window !== 'undefined') {
        sessionStorage.setItem('ps_main_admin_token', token);
      }

      setPassword('');
      onSuccess(token);
      onClose();
    } catch (err: any) {
      console.error('Main Admin verification error:', err);
      setErrorMessage(err.message || 'Verification failed. Please check password and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border-2 border-amber-300 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-start justify-between pb-3.5 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <span className="p-2.5 bg-amber-100 text-amber-800 rounded-xl">
              <ShieldAlert className="w-6 h-6" />
            </span>
            <div>
              <h3 className="text-lg font-bold text-[#0d2847]">
                Main Admin Verification
              </h3>
              <p className="text-xs text-amber-800 font-semibold mt-0.5">
                Elevated Security Layer &bull; Master Database Access
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Security Notice */}
        <div className="my-4 p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 leading-relaxed">
          <p className="font-semibold text-slate-800 mb-1 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-amber-600" />
            Protected Certificate Database
          </p>
          Enter the master <strong>Main Admin Password</strong> to unlock the complete certificate registry, search older records, and perform administrative edits or deletions.
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="mb-4 p-3 bg-rose-50 border border-rose-300 rounded-xl text-rose-950 text-xs flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1 font-semibold">{errorMessage}</div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1.5">
              Main Admin Password <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <KeyRound className="w-4 h-4" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter Main Admin password"
                autoFocus
                required
                className="w-full pl-9 pr-10 py-2.5 text-sm border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-[#0d2847] bg-white font-medium"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-700 cursor-pointer"
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Elevated session automatically expires after 15 minutes of inactivity.
            </p>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer transition-colors"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isSubmitting || !password.trim()}
              className="px-5 py-2.5 text-xs font-bold text-white bg-[#0d2847] hover:bg-[#163a63] active:bg-[#091b30] disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Verifying Authorization...</span>
                </>
              ) : (
                <>
                  <Lock className="w-3.5 h-3.5" />
                  <span>Unlock Complete Database</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
