import React, { useState } from 'react';
import { Lock, KeyRound, ShieldAlert, Check, ArrowRight } from 'lucide-react';

interface PinLockModalProps {
  isOpen: boolean;
  onUnlock: (enteredPin: string) => boolean;
  onUpdatePin: (oldPin: string, newPin: string) => boolean;
}

export const PinLockModal: React.FC<PinLockModalProps> = ({
  isOpen,
  onUnlock,
  onUpdatePin,
}) => {
  const [pin, setPin] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [isChangingPin, setIsChangingPin] = useState<boolean>(false);
  const [oldPinInput, setOldPinInput] = useState<string>('');
  const [newPinInput, setNewPinInput] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');

  if (!isOpen) return null;

  const handleDigit = (digit: string) => {
    if (pin.length < 6) {
      const next = pin + digit;
      setPin(next);
      setError('');
      if (next.length === 6) {
        // Auto verify upon 6th digit
        const ok = onUnlock(next);
        if (!ok) {
          setError('Invalid PIN. Default PIN is 123456.');
          setPin('');
        }
      }
    }
  };

  const handleBackspace = () => {
    setPin(pin.slice(0, -1));
    setError('');
  };

  const handleChangePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPinInput.length < 4) {
      setError('New PIN must be at least 4 digits');
      return;
    }
    const ok = onUpdatePin(oldPinInput, newPinInput);
    if (ok) {
      setSuccessMsg('PIN updated successfully!');
      setTimeout(() => {
        setIsChangingPin(false);
        setSuccessMsg('');
        setOldPinInput('');
        setNewPinInput('');
      }, 1200);
    } else {
      setError('Current PIN is incorrect');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 select-none">
      <div className="bg-white rounded-lg shadow-2xl border border-[#d0d0d0] w-full max-w-sm overflow-hidden p-6 text-center animate-in fade-in zoom-in-95 duration-150">
        
        {/* Trident Brand Lockup */}
        <div className="w-12 h-12 bg-[#1e293b] rounded-md mx-auto flex items-center justify-center shadow-md mb-3">
          <svg className="w-6 h-6 text-[#38bdf8]" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2L15 8H9L12 2ZM4 7L7 11H3L4 7ZM20 7L21 11H17L20 7ZM11 10H13V22H11V10Z" />
          </svg>
        </div>

        <h2 className="text-base font-bold text-[#333]">
          {isChangingPin ? 'Change Terminal PIN' : 'Enter 6-Digit PIN'}
        </h2>
        <p className="text-xs text-[#888] mt-0.5 mb-5">
          {isChangingPin
            ? 'Set a custom PIN for your virtual trading session'
            : 'Default PIN: 123456'}
        </p>

        {!isChangingPin ? (
          <div>
            {/* PIN Dots (6 circles) */}
            <div className="flex justify-center gap-3 mb-6">
              {[0, 1, 2, 3, 4, 5].map((idx) => (
                <div
                  key={idx}
                  className={`w-3.5 h-3.5 rounded-full border transition-all ${
                    idx < pin.length
                      ? 'bg-[#387ed1] border-[#387ed1] scale-110'
                      : 'bg-[#f5f5f5] border-[#ccc]'
                  }`}
                />
              ))}
            </div>

            {error && (
              <p className="text-xs text-[#df514c] font-medium mb-4 animate-shake">
                {error}
              </p>
            )}

            {/* Numpad */}
            <div className="grid grid-cols-3 gap-2.5 max-w-[240px] mx-auto mb-4">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                <button
                  key={digit}
                  type="button"
                  onClick={() => handleDigit(digit)}
                  className="h-12 rounded-lg bg-[#f8f9fa] hover:bg-[#ebedf0] active:scale-95 text-base font-semibold text-[#333] transition-all border border-[#e5e7eb]"
                >
                  {digit}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setIsChangingPin(true)}
                className="h-12 rounded-lg text-xs font-semibold text-[#387ed1] hover:bg-blue-50 transition-colors"
              >
                Change PIN
              </button>
              <button
                type="button"
                onClick={() => handleDigit('0')}
                className="h-12 rounded-lg bg-[#f8f9fa] hover:bg-[#ebedf0] active:scale-95 text-base font-semibold text-[#333] transition-all border border-[#e5e7eb]"
              >
                0
              </button>
              <button
                type="button"
                onClick={handleBackspace}
                className="h-12 rounded-lg text-xs font-semibold text-[#666] hover:bg-[#f0f0f0] transition-colors"
              >
                ⌫
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleChangePinSubmit} className="space-y-3 text-left text-xs">
            {error && <p className="text-xs text-[#df514c] font-medium">{error}</p>}
            {successMsg && <p className="text-xs text-[#4caf50] font-medium">{successMsg}</p>}

            <div>
              <label className="text-[#555] font-medium block mb-1">Current PIN</label>
              <input
                type="password"
                maxLength={6}
                value={oldPinInput}
                onChange={(e) => setOldPinInput(e.target.value)}
                className="w-full px-3 py-2 border rounded outline-none text-center font-semibold tracking-widest text-sm"
                placeholder="••••••"
              />
            </div>

            <div>
              <label className="text-[#555] font-medium block mb-1">New PIN</label>
              <input
                type="password"
                maxLength={6}
                value={newPinInput}
                onChange={(e) => setNewPinInput(e.target.value)}
                className="w-full px-3 py-2 border rounded outline-none text-center font-semibold tracking-widest text-sm"
                placeholder="••••••"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsChangingPin(false);
                  setError('');
                }}
                className="w-1/2 py-2 border rounded text-xs font-medium text-[#666] hover:bg-[#f5f5f5]"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="w-1/2 py-2 bg-[#387ed1] hover:bg-[#2b6ba8] text-white rounded text-xs font-semibold"
              >
                Save PIN
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
