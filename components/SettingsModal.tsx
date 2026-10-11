// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { auth } from '../services/firebaseConfig';
import { User } from 'firebase/auth';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(auth.currentUser);
  const [loadingDrive, setLoadingDrive] = useState(false);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((user) => {
      setCurrentUser(user);
    });
    return () => unsub();
  }, []);

  if (!isOpen) return null;

  const handleOpenDrivePortfolio = async () => {
    setLoadingDrive(true);
    try {
      const url = await api.getRootFolderUrl();
      if (url) {
        window.open(url, '_blank');
      } else {
        window.open('https://drive.google.com', '_blank');
      }
    } catch (e) {
      window.open('https://drive.google.com', '_blank');
    } finally {
      setLoadingDrive(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await api.signOut();
      onClose();
    } catch (e) {
      console.error('Error signing out:', e);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[1000] flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-slate-100 flex flex-col animate-scale-in">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-blue-400">
              <i className="fa-solid fa-gear text-lg"></i>
            </div>
            <div>
              <h2 className="text-base font-bold">إعدادات التطبيق</h2>
              <p className="text-[10px] text-slate-300">إدارة الحساب ومزامنة Google Drive</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition text-slate-300 hover:text-white"
            title="إغلاق"
          >
            <i className="fa-solid fa-times text-sm"></i>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5 bg-slate-50/50">
          
          {/* User Profile Card */}
          {currentUser && (
            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-lg border border-blue-200 shrink-0 overflow-hidden">
                {currentUser.photoURL ? (
                  <img src={currentUser.photoURL} alt="User" className="w-full h-full object-cover" />
                ) : (
                  (currentUser.displayName || currentUser.email || 'U').charAt(0).toUpperCase()
                )}
              </div>
              <div className="overflow-hidden flex-1">
                <h3 className="font-bold text-slate-800 text-sm truncate">
                  {currentUser.displayName || 'مستخدم الحافظة'}
                </h3>
                <p className="text-xs text-slate-500 truncate">{currentUser.email || 'مسجل الدخول'}</p>
              </div>
            </div>
          )}

          {/* Google Drive Portfolio File/Folder Button Section */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
            <div className="flex items-center gap-2 text-slate-800 font-bold text-sm">
              <i className="fa-brands fa-google-drive text-emerald-600 text-base"></i>
              <span>ملف المحفظة على جوجل درايف</span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              افتح مجلد وملفات المحفظة مباشرة على حساب Google Drive لمتابعة التخزين والنسخ الاحتياطي.
            </p>
            <button
              onClick={handleOpenDrivePortfolio}
              disabled={loadingDrive}
              className="w-full bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white py-3 px-4 rounded-xl font-bold text-xs shadow-md shadow-emerald-600/20 transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loadingDrive ? (
                <>
                  <i className="fa-solid fa-circle-notch fa-spin"></i>
                  <span>جاري الاتصال بـ Google Drive...</span>
                </>
              ) : (
                <>
                  <i className="fa-brands fa-google-drive text-sm"></i>
                  <span>فتح ملف المحفظة علي جوجل درايف مباشرة</span>
                  <i className="fa-solid fa-arrow-up-right-from-square text-[10px] mr-auto"></i>
                </>
              )}
            </button>
          </div>

          {/* Logout Section */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
            <div className="flex items-center gap-2 text-slate-800 font-bold text-sm">
              <i className="fa-solid fa-right-from-bracket text-red-500 text-base"></i>
              <span>تسجيل الخروج</span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              إنهاء الجلسة الحالية والعودة لصفحة تسجيل الدخول.
            </p>
            <button
              onClick={handleSignOut}
              className="w-full bg-red-50 hover:bg-red-100 active:bg-red-200 text-red-600 border border-red-200 py-2.5 px-4 rounded-xl font-bold text-xs transition flex items-center justify-center gap-2"
            >
              <i className="fa-solid fa-sign-out-alt"></i>
              <span>تسجيل الخروج من التطبيق</span>
            </button>
          </div>

        </div>

        {/* Footer */}
        <div className="bg-white px-6 py-3 border-t border-slate-100 flex justify-between items-center text-slate-400 text-[10px]">
          <span>تطبيق الحافظة الهندسية</span>
          <button 
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition text-xs"
          >
            إغلاق
          </button>
        </div>

      </div>
    </div>
  );
};

export default SettingsModal;
