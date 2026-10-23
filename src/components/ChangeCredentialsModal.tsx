import React, { useState } from 'react';
import { User, Lock, KeyRound, Check, X, AlertCircle } from 'lucide-react';

interface ChangeCredentialsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUsername: string;
  onUpdateCredentials: (oldPassword: string, newUsername?: string, newPassword?: string) => Promise<boolean> | boolean;
}

export const ChangeCredentialsModal: React.FC<ChangeCredentialsModalProps> = ({
  isOpen,
  onClose,
  currentUsername,
  onUpdateCredentials,
}) => {
  const [newUsername, setNewUsername] = useState<string>(currentUsername);
  const [currentPassword, setCurrentPassword] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword) {
      setError('Please enter your current password to confirm changes');
      return;
    }
    if (newPassword && newPassword.length < 4) {
      setError('New password must be at least 4 characters');
      return;
    }
    if (newPassword && newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const ok = await onUpdateCredentials(
        currentPassword,
        newUsername.trim() !== currentUsername ? newUsername.trim() : undefined,
        newPassword ? newPassword : undefined
      );

      if (ok) {
        setSuccess('Credentials updated successfully!');
        setTimeout(() => {
          onClose();
          setSuccess('');
          setCurrentPassword('');
          setNewPassword('');
          setConfirmPassword('');
        }, 1200);
      } else {
        setError('Current password is incorrect');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to update credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 select-none">
      <div className="bg-white rounded-xl shadow-2xl border border-[#cbd5e1] w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#e2e8f0] bg-[#f8fafc]">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-[#0284c7]" />
            <h3 className="font-bold text-sm text-[#0f172a]">Change User ID & Password</h3>
          </div>
          <button
            onClick={onClose}
            className="text-[#94a3b8] hover:text-[#0f172a] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-3.5">
          {error && (
            <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-[#dc2626]">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded text-xs text-[#166534]">
              <Check className="w-4 h-4 shrink-0 text-[#16a34a]" />
              <span>{success}</span>
            </div>
          )}

          {/* New User ID */}
          <div>
            <label className="block text-xs font-semibold text-[#475569] mb-1">
              User ID
            </label>
            <div className="relative flex items-center">
              <User className="w-4 h-4 text-[#94a3b8] absolute left-3 pointer-events-none" />
              <input
                type="text"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value.toUpperCase())}
                placeholder="e.g. TRADER1"
                className="w-full pl-9 pr-3 py-2 text-xs uppercase font-medium bg-[#f8fafc] border border-[#cbd5e1] focus:border-[#0284c7] rounded outline-none"
              />
            </div>
          </div>

          {/* Current Password */}
          <div>
            <label className="block text-xs font-semibold text-[#475569] mb-1">
              Current Password <span className="text-red-500">*</span>
            </label>
            <div className="relative flex items-center">
              <Lock className="w-4 h-4 text-[#94a3b8] absolute left-3 pointer-events-none" />
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Current password"
                className="w-full pl-9 pr-3 py-2 text-xs bg-[#f8fafc] border border-[#cbd5e1] focus:border-[#0284c7] rounded outline-none"
                required
              />
            </div>
          </div>

          {/* New Password */}
          <div>
            <label className="block text-xs font-semibold text-[#475569] mb-1">
              New Password (Optional)
            </label>
            <div className="relative flex items-center">
              <Lock className="w-4 h-4 text-[#94a3b8] absolute left-3 pointer-events-none" />
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Leave blank to keep same"
                className="w-full pl-9 pr-3 py-2 text-xs bg-[#f8fafc] border border-[#cbd5e1] focus:border-[#0284c7] rounded outline-none"
              />
            </div>
          </div>

          {/* Confirm New Password */}
          {newPassword && (
            <div>
              <label className="block text-xs font-semibold text-[#475569] mb-1">
                Confirm New Password
              </label>
              <div className="relative flex items-center">
                <Lock className="w-4 h-4 text-[#94a3b8] absolute left-3 pointer-events-none" />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat new password"
                  className="w-full pl-9 pr-3 py-2 text-xs bg-[#f8fafc] border border-[#cbd5e1] focus:border-[#0284c7] rounded outline-none"
                />
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#f1f5f9]">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-[#64748b] hover:bg-[#f1f5f9] rounded cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-1.5 text-xs font-semibold text-white bg-[#0284c7] hover:bg-[#0369a1] rounded cursor-pointer disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
