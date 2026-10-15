import React, { useEffect, useState } from 'react';

// Simple Observer Pattern to handle progress & text updates
type LoadingListener = (loading: boolean, progress: number, text?: string) => void;
const listeners = new Set<LoadingListener>();

const notify = (loading: boolean, progress: number, text?: string) => {
    listeners.forEach(listener => listener(loading, progress, text));
};

export const triggerLoadingStart = (text?: string) => {
    notify(true, 5, text || 'جاري تجهيز الملفات والرفع...');
};

export const triggerLoadingStop = () => {
    notify(false, 100);
};

export const triggerLoadingProgress = (percent: number, text?: string) => {
    notify(true, percent, text);
};

const GlobalLoadingBar: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [isFinished, setIsFinished] = useState(false);

  useEffect(() => {
    let finishTimeout: any;

    const handleStateChange = (isLoading: boolean, newProgress: number, text?: string) => {
        if (text !== undefined && text !== '') {
            setStatusText(text);
        }

        if (isLoading) {
            setLoading(true);
            setIsFinished(false);
            setProgress(Math.min(100, Math.max(0, newProgress)));
            if (finishTimeout) clearTimeout(finishTimeout);
        } else {
            // Finished
            setProgress(100);
            setIsFinished(true);
            
            finishTimeout = setTimeout(() => {
                setLoading(false);
                setProgress(0);
                setStatusText('');
                setIsFinished(false);
            }, 1400);
        }
    };

    listeners.add(handleStateChange);

    return () => {
        listeners.delete(handleStateChange);
        if (finishTimeout) clearTimeout(finishTimeout);
    };
  }, []);

  if (!loading) return null;

  const currentPercent = Math.round(progress);

  return (
    <div className="fixed bottom-6 sm:bottom-8 inset-x-0 mx-auto z-[10000] pointer-events-none animate-slide-up px-4 w-full max-w-md">
      <div className="bg-slate-950/95 backdrop-blur-xl text-white px-5 py-3.5 rounded-2xl shadow-[0_15px_40px_rgba(0,0,0,0.6)] border border-cyan-500/30 flex flex-col gap-2.5" dir="rtl">
        
        {/* Header Row */}
        <div className="flex items-center justify-between gap-3 text-xs font-bold">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            {isFinished ? (
              <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center shrink-0">
                <i className="fa-solid fa-check text-xs"></i>
              </div>
            ) : (
              <div className="w-6 h-6 rounded-full bg-blue-500/20 text-cyan-400 border border-cyan-500/40 flex items-center justify-center shrink-0 animate-pulse">
                <i className="fa-solid fa-cloud-arrow-up text-xs animate-bounce"></i>
              </div>
            )}
            <span className="truncate text-[11px] font-extrabold text-slate-100">
              {isFinished ? 'تم رفع واستكمال الملفات بنجاح ✔' : (statusText || 'جاري رفع وتحميل الملفات إلى السحابة...')}
            </span>
          </div>

          {/* Percentage Pill */}
          <div className={`px-2.5 py-0.5 rounded-lg text-[11px] font-mono font-black shrink-0 border transition-colors ${
            isFinished 
              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' 
              : 'bg-blue-500/20 text-cyan-300 border-cyan-400/30 shadow-[0_0_10px_rgba(6,182,212,0.3)]'
          }`}>
            {currentPercent}%
          </div>
        </div>

        {/* Animated Progress Track */}
        <div className="w-full bg-slate-800/80 h-2.5 rounded-full overflow-hidden border border-white/10 relative p-0.5 shadow-inner" dir="rtl">
          <div 
            className={`h-full transition-all duration-300 ease-out rounded-full relative ${
              isFinished 
                ? 'bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-300' 
                : 'bg-gradient-to-r from-blue-600 via-cyan-400 to-indigo-400 shadow-[0_0_12px_rgba(6,182,212,0.8)]'
            }`}
            style={{ width: `${Math.max(4, Math.min(100, currentPercent))}%` }}
          >
            {/* Light streak shine effect */}
            {!isFinished && (
              <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/30 to-transparent animate-pulse"></div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default GlobalLoadingBar;
