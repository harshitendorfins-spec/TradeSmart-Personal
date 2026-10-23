import React, { useState } from 'react';
import { User, Lock, Eye, EyeOff, ShieldCheck, ArrowRight, AlertCircle, KeyRound } from 'lucide-react';

interface LoginModalProps {
  isOpen: boolean;
  onLogin: (username: string, password: string) => Promise<boolean> | boolean;
  currentUsername?: string;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onLogin,
  currentUsername = 'HARSHIT',
}) => {
  const [username, setUsername] = useState<string>(() => {
    return localStorage.getItem('tradesmart_username') || 'HARSHIT';
  });
  const [password, setPassword] = useState<string>(() => localStorage.getItem('tradesmart_username') === 'HARSHIT' || !localStorage.getItem('tradesmart_username') ? '@Harshit1234' : '');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [rememberMe, setRememberMe] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setError('Please enter your User ID');
      return;
    }
    if (!password.trim()) {
      setError('Please enter your Password');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const ok = await onLogin(username.trim(), password.trim());
      if (!ok) {
        setError('Invalid User ID or Password. HARSHIT / @Harshit1234');
      } else {
        if (rememberMe) {
          localStorage.setItem('tradesmart_username', username.trim().toUpperCase());
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Login failed. Please check credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-xs p-4 select-none">
      <div className="bg-white rounded-xl shadow-2xl border border-[#cbd5e1] w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Top Header Card */}
        <div className="p-6 pb-4 text-center border-b border-[#f1f5f9] bg-[#f8fafc]">
          <div className="w-12 h-12 bg-[#0284c7] rounded-lg mx-auto flex items-center justify-center shadow-md mb-3 text-white">
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
              <polyline points="16 7 22 7 22 13" />
            </svg>
          </div>
          <h2 className="text-lg font-extrabold text-[#0f172a] tracking-tight">
            Login to Trade<span className="text-[#0284c7]">Smart</span>
          </h2>
          <p className="text-xs text-[#64748b] mt-0.5">
            Virtual F&O Trading Terminal
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          
          {error && (
            <div className="flex items-center gap-2 p-2.5 bg-red-50 border border-red-200 rounded text-xs text-[#dc2626]">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* User ID Field */}
          <div>
            <label className="block text-xs font-semibold text-[#475569] mb-1">
              User ID
            </label>
            <div className="relative flex items-center">
              <User className="w-4 h-4 text-[#94a3b8] absolute left-3 pointer-events-none" />
              <input
                type="text"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value.toUpperCase());
                  setError('');
                }}
                placeholder="e.g. TRADER1"
                className="w-full pl-9 pr-3 py-2 text-xs uppercase font-medium bg-[#f8fafc] hover:bg-[#f1f5f9] focus:bg-white border border-[#cbd5e1] focus:border-[#0284c7] rounded outline-none transition-colors"
                autoFocus
              />
            </div>
          </div>

          {/* Password Field */}
          <div>
            <label className="block text-xs font-semibold text-[#475569] mb-1">
              Password
            </label>
            <div className="relative flex items-center">
              <Lock className="w-4 h-4 text-[#94a3b8] absolute left-3 pointer-events-none" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError('');
                }}
                placeholder="Enter password"
                className="w-full pl-9 pr-9 py-2 text-xs bg-[#f8fafc] hover:bg-[#f1f5f9] focus:bg-white border border-[#cbd5e1] focus:border-[#0284c7] rounded outline-none transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2.5 text-[#94a3b8] hover:text-[#475569] cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Remember me & Default hint */}
          <div className="flex items-center justify-between text-xs text-[#64748b]">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="rounded border-[#cbd5e1] text-[#0284c7] focus:ring-0"
              />
              <span>Remember User ID</span>
            </label>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-[#0284c7] hover:bg-[#0369a1] active:scale-[0.99] text-white font-semibold text-xs rounded shadow-xs flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
          >
            {loading ? (
              <span>Authenticating...</span>
            ) : (
              <>
                <span>Login to Terminal</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          {/* Default Credentials & New Account Info Box */}
          <div className="p-3 bg-[#f8fafc] border border-[#e2e8f0] rounded text-[11px] text-[#64748b] space-y-1.5">
            <div className="flex items-center gap-1 font-semibold text-[#334155]">
              <KeyRound className="w-3.5 h-3.5 text-[#0284c7]" />
              <span>Multi-User Isolated Terminal:</span>
            </div>
            <div className="flex justify-between font-mono text-[10px] text-[#475569] bg-white p-1.5 rounded border border-[#e2e8f0]">
              <span>Admin: <strong>TRADER1</strong></span>
              <span>Pass: <strong>trade123</strong></span>
            </div>
            <p className="text-[10.5px] text-[#0284c7] font-medium leading-tight">
              ✨ <strong>Friend / New User?</strong> Type your own User ID & Password to start with your private ₹1.00 Cr virtual capital!
            </p>
          </div>
        </form>
      </div>
    </div>
  );
};
