import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const MobileDoubleBackHandler: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const [showToast, setShowToast] = useState(false);
  const [isExited, setIsExited] = useState(false);
  
  const lastPressRef = useRef<number>(0);
  const timerRef = useRef<number | null>(null);
  const isExitingRef = useRef<boolean>(false);
  const isGuardArmedRef = useRef<boolean>(false);

  // Arm history guard whenever we are at the home/root route ('/')
  useEffect(() => {
    if (isExited) return;

    if (location.pathname === '/') {
      // Push an app guard entry so pressing Back doesn't immediately dump the user out of the site/PWA
      try {
        window.history.pushState({ app_root_guard: true, t: Date.now() }, '', window.location.href);
        isGuardArmedRef.current = true;
      } catch (e) {
        // Safe catch for environment constraints
      }
    } else {
      isGuardArmedRef.current = false;
    }
  }, [location.pathname, isExited]);

  // Global popstate handler
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      // If exit is already acknowledged, don't intervene
      if (isExitingRef.current) return;

      // 1. Give open modals / overlays a chance to intercept and close themselves
      const customEvent = new CustomEvent('app-back-button', { cancelable: true });
      window.dispatchEvent(customEvent);

      if (customEvent.defaultPrevented) {
        // An active modal handled the back action and closed itself.
        // Re-arm the guard state so browser history stack remains balanced.
        if (location.pathname === '/') {
          try {
            window.history.pushState({ app_root_guard: true, t: Date.now() }, '', window.location.href);
          } catch (e) {}
        }
        return;
      }

      // 2. If user is in a deep route (e.g. /project/xyz or /editor/xyz) and no previous history
      // Take them back to home dashboard instead of dumping them out
      if (location.pathname !== '/') {
        navigate('/', { replace: true });
        return;
      }

      // 3. User is at the root dashboard ('/')
      const now = Date.now();
      const timeDiff = now - lastPressRef.current;

      // Check if this is the SECOND PRESS within 2 seconds (Double tap back to exit)
      if (lastPressRef.current > 0 && timeDiff <= 2000) {
        // Confirmed double press: EXIT AND CLOSE THE APP
        isExitingRef.current = true;
        if (timerRef.current) {
          window.clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        setShowToast(false);
        lastPressRef.current = 0;
        setIsExited(true);

        // Attempt all available native and web exit techniques:
        try {
          // 1. Android wrapper / Cordova / Capacitor / WebView exit
          const nav = window.navigator as any;
          if (nav?.app?.exitApp) {
            nav.app.exitApp();
          }
        } catch (e) {}

        try {
          // 2. Standard window.close (works for popups, standalone PWAs, WebViews)
          window.close();
        } catch (e) {}

        try {
          // 3. Browser history pop
          window.history.back();
        } catch (e) {}

        return;
      }

      // FIRST PRESS on root screen:
      // Prevent exiting, re-arm guard, and show toast prompt to press again
      lastPressRef.current = now;
      setShowToast(true);

      // Re-arm history guard immediately so the NEXT back press can also be intercepted
      try {
        window.history.pushState({ app_root_guard: true, t: Date.now() }, '', window.location.href);
      } catch (e) {}

      // Reset after 2 seconds
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
      timerRef.current = window.setTimeout(() => {
        setShowToast(false);
        lastPressRef.current = 0;
      }, 2000);
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, [location.pathname, navigate]);

  // If the app was closed by double-back
  if (isExited) {
    return (
      <div 
        dir="rtl" 
        className="fixed inset-0 z-[999999] bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center select-none animate-in fade-in duration-300"
      >
        <div className="w-20 h-20 rounded-3xl bg-slate-900 border border-slate-800 flex items-center justify-center mb-6 shadow-2xl text-emerald-400">
          <i className="fa-solid fa-circle-check text-4xl"></i>
        </div>

        <h1 className="text-2xl font-bold mb-2 text-slate-100">تم الخروج من التطبيق</h1>
        <p className="text-slate-400 text-sm max-w-xs mb-8 leading-relaxed">
          تم إغلاق التطبيق وحفظ كافة بياناتك بنجاح. يمكنك الآن إغلاق علامة التبويب بأمان أو العودة للشاشة الرئيسية لهاتفك.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
          <button
            onClick={() => {
              isExitingRef.current = false;
              setIsExited(false);
              navigate('/');
            }}
            className="w-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white py-3 px-6 rounded-2xl font-bold text-sm shadow-lg shadow-blue-600/30 transition flex items-center justify-center gap-2"
          >
            <i className="fa-solid fa-rotate-right text-xs"></i>
            <span>إعادة فتح التطبيق</span>
          </button>
          
          <button
            onClick={() => {
              try {
                window.close();
              } catch (e) {}
            }}
            className="w-full bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-slate-300 py-3 px-6 rounded-2xl font-bold text-sm border border-slate-700 transition flex items-center justify-center gap-2"
          >
            <i className="fa-solid fa-xmark text-xs"></i>
            <span>إغلاق التبويب</span>
          </button>
        </div>
      </div>
    );
  }

  // Floating Toast notification when user presses back once
  if (!showToast) return null;

  return (
    <div 
      dir="rtl"
      className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[99999] pointer-events-none transition-all duration-300 animate-in fade-in slide-in-from-bottom-5"
    >
      <style>{`
        @keyframes toastShrink {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
      <div className="bg-slate-900/95 text-white backdrop-blur-md px-5 py-3 rounded-2xl shadow-2xl border border-slate-700/70 flex items-center gap-3 text-xs sm:text-sm font-bold min-w-[270px] justify-center relative overflow-hidden">
        {/* Animated countdown bar at bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-800 overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-amber-400 to-orange-500" 
            style={{ animation: 'toastShrink 2s linear forwards' }}
          />
        </div>

        <div className="w-7 h-7 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
          <i className="fa-solid fa-arrow-right-from-bracket text-xs"></i>
        </div>
        <span className="text-slate-100 tracking-wide">
          اضغط مرة أخرى للخروج من التطبيق
        </span>
      </div>
    </div>
  );
};

export default MobileDoubleBackHandler;
