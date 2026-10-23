import React, { useState } from 'react';
import { X, Cloud, Download, ExternalLink, CheckCircle2, ArrowRight, ShieldCheck, Zap } from 'lucide-react';

interface NetlifyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NetlifyModal: React.FC<NetlifyModalProps> = ({ isOpen, onClose }) => {
  const [downloaded, setDownloaded] = useState(false);

  if (!isOpen) return null;

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = '/tradesmart_build.zip';
    link.download = 'tradesmart_build.zip';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setDownloaded(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 select-none">
      <div className="bg-white rounded shadow-2xl border border-[#cbd5e1] w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#e2e8f0] bg-[#f8fafc]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-[#00ad9f]/10 text-[#00ad9f] flex items-center justify-center font-bold">
              <Cloud className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-[#0f172a]">1-Click Netlify Deployment</h3>
              <p className="text-[11px] text-[#64748b]">Get your personal public URL with 0 Google login restrictions</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-[#64748b] hover:text-[#0f172a] hover:bg-[#e2e8f0] rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-5 space-y-4 text-xs">
          
          <div className="p-3 bg-[#f0fdf4] border border-[#bbf7d0] rounded text-[#166534] flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-[#16a34a] shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-xs">Production Build Ready!</p>
              <p className="text-[11px] text-[#15803d] mt-0.5">
                Mene aapka pura TradeSmart terminal bundle karke <b>tradesmart_build.zip</b> file me pack kar diya hai.
              </p>
            </div>
          </div>

          <div className="space-y-3 pt-1">
            <div className="font-bold text-xs text-[#334155] uppercase tracking-wider">
              Follow These 2 Quick Steps:
            </div>

            {/* Step 1 */}
            <div className="p-3 border border-[#e2e8f0] rounded bg-[#f8fafc] flex items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-[#0284c7] text-white flex items-center justify-center text-[11px] font-bold shrink-0 mt-0.5">
                  1
                </span>
                <div>
                  <p className="font-bold text-[#0f172a]">Download Deployment Package</p>
                  <p className="text-[11px] text-[#64748b]">Click karke zip file apne computer/phone par download karein</p>
                </div>
              </div>

              <button
                onClick={handleDownload}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-[#0284c7] hover:bg-[#0369a1] text-white font-semibold rounded shadow-xs transition-colors shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{downloaded ? 'Downloaded ✓' : 'Download Zip'}</span>
              </button>
            </div>

            {/* Step 2 */}
            <div className="p-3 border border-[#e2e8f0] rounded bg-[#f8fafc] flex items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-[#00ad9f] text-white flex items-center justify-center text-[11px] font-bold shrink-0 mt-0.5">
                  2
                </span>
                <div>
                  <p className="font-bold text-[#0f172a]">Netlify Drop Par Drag & Drop Karein</p>
                  <p className="text-[11px] text-[#64748b]">Netlify Drop kholkar download ki hui zip file waha drop kar dein</p>
                </div>
              </div>

              <a
                href="https://app.netlify.com/drop"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 px-3.5 py-2 bg-[#00ad9f] hover:bg-[#009387] text-white font-semibold rounded shadow-xs transition-colors shrink-0"
              >
                <span>Open Netlify Drop</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          <div className="p-3 bg-[#f8fafc] border border-[#e2e8f0] rounded text-[11px] text-[#64748b] space-y-1">
            <p className="font-semibold text-[#334155] flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 text-[#eab308]" />
              Netlify ke fayde:
            </p>
            <ul className="list-disc list-inside space-y-0.5 pl-1 text-[11px]">
              <li><b>100% Free Lifetime Hosting</b> bina kisi credit card ke.</li>
              <li>Aapko <b>https://your-name.netlify.app</b> public link milega.</li>
              <li>Kisi bhi mobile ya browser par bina 403 error ke open hoga.</li>
            </ul>
          </div>

        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-5 py-3 border-t border-[#f1f5f9] bg-[#f8fafc]">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-[#475569] hover:bg-[#e2e8f0] rounded transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
