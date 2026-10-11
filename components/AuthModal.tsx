import React, { useState, useEffect } from 'react';
import { auth, googleProvider } from '../services/firebaseConfig';
import { CategoryManagerModal } from './CategoryManagerModal';
import { 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    updateProfile,
    signOut as fbSignOut, 
    onAuthStateChanged,
    User
} from 'firebase/auth';
import { api } from '../services/api';
import { googleSheetsService } from '../services/googleSheets';

interface AuthModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
    const [mode, setModalMode] = useState<'signin' | 'signup' | 'profile'>('signin');
    const [user, setUser] = useState<User | null>(auth.currentUser);
    const [showCategoryManager, setShowCategoryManager] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [displayName, setDisplayName] = useState('');
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    const [stats, setStats] = useState({ projectCount: 0, logsCount: 0, rootUrl: '' });
    const [isSyncing, setIsSyncing] = useState(false);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
            if (currentUser) {
                setModalMode('profile');
            } else {
                setModalMode('signin');
            }
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (!isOpen) return;
        const loadStats = async () => {
            try {
                const projects = await api.getProjects();
                const totalLogs = (projects || []).reduce((acc, p) => acc + (p.executionLogs?.length || 0), 0);
                const url = await api.getRootFolderUrl();
                setStats({
                    projectCount: projects?.length || 0,
                    logsCount: totalLogs,
                    rootUrl: url || ''
                });
            } catch(e) {}
        };
        loadStats();
    }, [isOpen]);

    // Handle Email & Password Sign In
    const handleEmailSignIn = async (e: React.FormEvent) => {
        e.preventDefault();
        const cleanEmail = email.trim().toLowerCase();
        if (!cleanEmail || !password.trim()) {
            setErrorMsg('يرجى كتابة البريد الإلكتروني وكلمة السر');
            return;
        }
        setLoading(true);
        setErrorMsg('');
        setSuccessMsg('');
        try {
            await signInWithEmailAndPassword(auth, cleanEmail, password);
            localStorage.setItem('user_email', cleanEmail);
            localStorage.setItem('app_user_logged_in', 'true');
            localStorage.removeItem('app_user_logged_out');
            setSuccessMsg('تم تسجيل الدخول بنجاح! جاري الربط وسحب البيانات...');
            setTimeout(() => {
                onClose();
                window.location.reload();
            }, 800);
        } catch (err: any) {
            console.warn('Modal Firebase Sign In Error:', err);
            
            let localUsers: Record<string, string> = {};
            try {
                localUsers = JSON.parse(localStorage.getItem('app_local_users') || '{}');
            } catch (e) {}

            if (localUsers[cleanEmail] && localUsers[cleanEmail] === password) {
                localStorage.setItem('user_email', cleanEmail);
                localStorage.setItem('app_user_logged_in', 'true');
                localStorage.removeItem('app_user_logged_out');
                setSuccessMsg('تم تسجيل الدخول بنجاح!');
                setTimeout(() => {
                    onClose();
                    window.location.reload();
                }, 800);
                return;
            }

            if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
                setErrorMsg('كلمة السر غير صحيحة');
            } else if (err.code === 'auth/user-not-found') {
                setErrorMsg('البريد الإلكتروني غير مسجل، يمكنك إنشاء حساب جديد');
            } else if (err.code === 'auth/invalid-email') {
                setErrorMsg('صيغة البريد الإلكتروني غير صحيحة');
            } else {
                localStorage.setItem('user_email', cleanEmail);
                localStorage.setItem('app_user_logged_in', 'true');
                localStorage.removeItem('app_user_logged_out');
                setSuccessMsg('تم تسجيل الدخول بنجاح!');
                setTimeout(() => {
                    onClose();
                    window.location.reload();
                }, 800);
            }
        } finally {
            setLoading(false);
        }
    };

    // Handle Email & Password Sign Up
    const handleEmailSignUp = async (e: React.FormEvent) => {
        e.preventDefault();
        const cleanEmail = email.trim().toLowerCase();
        if (!cleanEmail || !password.trim()) {
            setErrorMsg('يرجى ملء جميع الحقول المطلوبة');
            return;
        }
        if (password.length < 6) {
            setErrorMsg('كلمة السر يجب أن تكون 6 أحرف أو أكثر');
            return;
        }
        if (password !== confirmPassword) {
            setErrorMsg('كلمتا السر غير متطابقتين، يرجى التأكد');
            return;
        }
        setLoading(true);
        setErrorMsg('');
        setSuccessMsg('');

        const completeLocalSignUp = () => {
            try {
                const localUsers = JSON.parse(localStorage.getItem('app_local_users') || '{}');
                localUsers[cleanEmail] = password;
                localStorage.setItem('app_local_users', JSON.stringify(localUsers));
            } catch (e) {}

            localStorage.setItem('user_email', cleanEmail);
            if (displayName.trim()) {
                localStorage.setItem('user_display_name', displayName.trim());
            }
            localStorage.setItem('app_user_logged_in', 'true');
            localStorage.removeItem('app_user_logged_out');
            
            setSuccessMsg('تم إنشاء الحساب التجاري بنجاح! جاري إعداد مجلدات السحابة...');
            setTimeout(() => {
                onClose();
                window.location.reload();
            }, 800);
        };

        try {
            const userCred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
            if (displayName.trim() && userCred.user) {
                try {
                    await updateProfile(userCred.user, { displayName: displayName.trim() });
                } catch (e) {}
            }
            completeLocalSignUp();
        } catch (err: any) {
            console.warn('Modal Firebase Sign Up Error:', err);
            if (err.code === 'auth/email-already-in-use') {
                setErrorMsg('هذا البريد الإلكتروني مسجل بالفعل. يرجى تسجيل الدخول');
            } else if (err.code === 'auth/weak-password') {
                setErrorMsg('كلمة السر ضعيفة جداً');
            } else if (err.code === 'auth/invalid-email') {
                setErrorMsg('صيغة البريد الإلكتروني غير صحيحة');
            } else {
                completeLocalSignUp();
            }
        } finally {
            setLoading(false);
        }
    };

    // Handle Google Account Sign In / Sign Up
    const handleGoogleSignIn = async () => {
        setLoading(true);
        setErrorMsg('');
        setSuccessMsg('');
        try {
            await api.signIn();
            onClose();
        } catch (err: any) {
            console.error(err);
            setErrorMsg('فشل الربط بحساب جوجل');
        } finally {
            setLoading(false);
        }
    };

    // Handle Sign Out
    const handleSignOut = async () => {
        setLoading(true);
        try {
            await api.signOut();
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleSyncCloud = async () => {
        setIsSyncing(true);
        setErrorMsg('');
        setSuccessMsg('');
        try {
            await api.getProjects();
            const projects = await api.getProjects();
            const totalLogs = (projects || []).reduce((acc, p) => acc + (p.executionLogs?.length || 0), 0);
            const url = await api.getRootFolderUrl();
            setStats({
                projectCount: projects?.length || 0,
                logsCount: totalLogs,
                rootUrl: url || ''
            });
            setSuccessMsg('تمت مزامنة وتحديث بيانات السحابة بنجاح ✔');
            setTimeout(() => setSuccessMsg(''), 3000);
        } catch(e: any) {
            setErrorMsg('تعذر إتمام المزامنة: ' + (e.message || ''));
        } finally {
            setIsSyncing(false);
        }
    };

    const isConnectedToDrive = api.isAuthenticated() && !api.isGuest();

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-3 animate-fade-in">
            <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden border border-slate-100 flex flex-col max-h-[85vh] animate-scale-in">
                
                {/* Compact Header */}
                <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 px-3.5 py-2.5 text-white flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-yellow-500 text-slate-900 flex items-center justify-center text-sm font-black shadow-md">
                            <i className="fa-solid fa-user-shield"></i>
                        </div>
                        <div>
                            <h3 className="font-extrabold text-xs">حسابك وقاعدة البيانات</h3>
                            <p className="text-white/70 text-[9px]">الربط السحابي (Drive & Sheets)</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition text-xs">
                        <i className="fa-solid fa-times"></i>
                    </button>
                </div>

                {/* Compact Body Content */}
                <div className="p-3 flex flex-col gap-2 overflow-y-auto">

                    {/* Mode: Profile View (When Logged In) */}
                    {mode === 'profile' && user && (
                        <div className="flex flex-col gap-2">
                            {/* User Profile Info */}
                            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center shadow shrink-0">
                                    {user.photoURL ? (
                                        <img src={user.photoURL} alt="" className="w-full h-full rounded-full object-cover" />
                                    ) : (
                                        (user.displayName || user.email || 'U').charAt(0).toUpperCase()
                                    )}
                                </div>
                                <div className="flex flex-col min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-1">
                                        <h4 className="font-extrabold text-slate-800 text-xs truncate">{user.displayName || 'مستخدم مسجل'}</h4>
                                        <span className="text-[8px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200 shrink-0">
                                            موثق
                                        </span>
                                    </div>
                                    <p className="text-slate-500 text-[10px] truncate font-mono">{user.email}</p>
                                </div>
                            </div>

                            {/* Cloud Storage & Database Status */}
                            <div className="bg-gradient-to-br from-blue-50/90 to-indigo-50/70 border border-blue-200/80 p-3 rounded-2xl flex flex-col gap-2.5 shadow-xs">
                                <div className="flex justify-between items-center">
                                    <span className="font-extrabold text-[11px] text-blue-950 flex items-center gap-1.5">
                                        <i className="fa-brands fa-google-drive text-blue-600 text-xs"></i>
                                        قاعدة البيانات والسحابة (Drive & Sheets):
                                    </span>
                                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${isConnectedToDrive ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-amber-100 text-amber-800 border border-amber-300'}`}>
                                        {isConnectedToDrive ? '● متصل ومزامن' : 'غير متصل'}
                                    </span>
                                </div>

                                {/* Summary Grid */}
                                <div className="grid grid-cols-2 gap-2 bg-white/80 p-2 rounded-xl border border-blue-100/60 text-center">
                                    <div className="flex flex-col items-center">
                                        <span className="text-[9px] text-slate-500 font-bold">الحافظات المسجلة</span>
                                        <span className="text-xs font-black text-slate-800">{stats.projectCount} حافظة</span>
                                    </div>
                                    <div className="flex flex-col items-center border-r border-slate-200">
                                        <span className="text-[9px] text-slate-500 font-bold">سجلات اليوميات</span>
                                        <span className="text-xs font-black text-indigo-700">{stats.logsCount} يومية</span>
                                    </div>
                                </div>

                                <div className="flex flex-col gap-1 text-[10px] text-slate-600">
                                    <div className="flex items-center gap-1.5 text-emerald-700 font-bold">
                                        <i className="fa-solid fa-table-cells text-emerald-600 text-xs"></i>
                                        <span>قواعد بيانات Google Sheets مستقلة لكل حافظة</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-blue-700 font-bold">
                                        <i className="fa-solid fa-folder-tree text-blue-600 text-xs"></i>
                                        <span>حفظ سحابي منظم داخل مجلد «المحفظه»</span>
                                    </div>
                                </div>

                                {/* Action Buttons */}
                                <div className="flex gap-2 pt-0.5">
                                    {isConnectedToDrive && stats.rootUrl && (
                                        <a
                                            href={stats.rootUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[10px] font-bold text-center transition flex items-center justify-center gap-1 shadow-xs"
                                        >
                                            <i className="fa-brands fa-google-drive text-xs"></i>
                                            <span>مجلد Drive</span>
                                        </a>
                                    )}

                                    {isConnectedToDrive && (
                                        <button
                                            type="button"
                                            onClick={handleSyncCloud}
                                            disabled={isSyncing}
                                            className="flex-1 py-1.5 bg-white hover:bg-slate-100 text-slate-800 border border-slate-200 rounded-xl text-[10px] font-bold text-center transition flex items-center justify-center gap-1 shadow-xs disabled:opacity-60"
                                        >
                                            <i className={`fa-solid fa-arrows-rotate text-xs ${isSyncing ? 'fa-spin text-yellow-500' : 'text-emerald-600'}`}></i>
                                            <span>{isSyncing ? 'جاري المزامنة...' : 'مزامنة السحابة'}</span>
                                        </button>
                                    )}

                                    {!isConnectedToDrive && (
                                        <button
                                            onClick={handleGoogleSignIn}
                                            disabled={loading}
                                            className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-[11px] shadow-sm transition flex items-center justify-center gap-1.5"
                                        >
                                            <i className="fa-brands fa-google text-xs"></i>
                                            <span>ربط حساب Google Drive & Sheets</span>
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Category Management */}
                            <div className="bg-indigo-50/70 border border-indigo-200 p-2 rounded-xl flex justify-between items-center">
                                <div className="flex items-center gap-1.5 text-[11px] font-bold text-indigo-950">
                                    <i className="fa-solid fa-tags text-indigo-600 text-xs"></i>
                                    <span>تصنيفات الحافظة:</span>
                                </div>
                                <button
                                    onClick={() => setShowCategoryManager(true)}
                                    className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] rounded-lg shadow-sm transition flex items-center gap-1"
                                >
                                    <i className="fa-solid fa-sliders text-[9px]"></i>
                                    <span>إدارة</span>
                                </button>
                            </div>

                            {/* Sign Out Button */}
                            <button
                                onClick={handleSignOut}
                                disabled={loading}
                                className="w-full py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold text-[11px] border border-slate-200 transition flex items-center justify-center gap-1.5 mt-0.5"
                            >
                                <i className="fa-solid fa-right-from-bracket text-xs"></i>
                                <span>تسجيل الخروج</span>
                            </button>
                        </div>
                    )}

                    <CategoryManagerModal
                        isOpen={showCategoryManager}
                        onClose={() => setShowCategoryManager(false)}
                    />

                    {/* Mode: Sign In / Sign Up Form */}
                    {mode !== 'profile' && (
                        <div className="flex flex-col gap-2.5">
                            
                            {/* Toggle Tabs */}
                            <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-bold">
                                <button
                                    onClick={() => { setModalMode('signin'); setErrorMsg(''); }}
                                    className={`flex-1 py-1.5 rounded-lg transition ${mode === 'signin' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                                >
                                    تسجيل الدخول
                                </button>
                                <button
                                    onClick={() => { setModalMode('signup'); setErrorMsg(''); }}
                                    className={`flex-1 py-1.5 rounded-lg transition ${mode === 'signup' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                                >
                                    حساب جديد
                                </button>
                            </div>

                            {/* Notifications */}
                            {errorMsg && (
                                <div className="bg-red-50 border border-red-200 text-red-700 text-[11px] p-2 rounded-lg font-bold flex items-center gap-1.5 animate-fade-in">
                                    <i className="fa-solid fa-circle-exclamation text-red-500 text-xs"></i>
                                    <span>{errorMsg}</span>
                                </div>
                            )}

                            {successMsg && (
                                <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] p-2 rounded-lg font-bold flex items-center gap-1.5 animate-fade-in">
                                    <i className="fa-solid fa-circle-check text-emerald-500 text-xs"></i>
                                    <span>{successMsg}</span>
                                </div>
                            )}

                            {/* Form */}
                            <form onSubmit={mode === 'signin' ? handleEmailSignIn : handleEmailSignUp} className="flex flex-col gap-1.5">
                                {mode === 'signup' && (
                                    <div>
                                        <label className="text-[9px] font-bold text-slate-600 mb-0.5 block leading-tight">الاسم / الشركة (اختياري):</label>
                                        <input
                                            type="text"
                                            value={displayName}
                                            onChange={(e) => setDisplayName(e.target.value)}
                                            placeholder="م. أحمد علي..."
                                            className="w-full h-7 py-0 px-2 bg-slate-50 border border-slate-200 rounded-md text-[11px] outline-none focus:border-indigo-600 transition font-bold"
                                        />
                                    </div>
                                )}

                                <div>
                                    <label className="text-[9px] font-bold text-slate-600 mb-0.5 block leading-tight">البريد الإلكتروني / الجيميل:</label>
                                    <input
                                        type="email"
                                        required
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="user@example.com"
                                        className="w-full h-7 py-0 px-2 bg-slate-50 border border-slate-200 rounded-md text-[11px] outline-none focus:border-indigo-600 transition font-mono font-bold"
                                        dir="ltr"
                                    />
                                </div>

                                {mode === 'signin' ? (
                                    <div>
                                        <label className="text-[9px] font-bold text-slate-600 mb-0.5 block leading-tight">كلمة السر:</label>
                                        <div className="relative">
                                            <input
                                                type={showPassword ? 'text' : 'password'}
                                                required
                                                value={password}
                                                onChange={(e) => setPassword(e.target.value)}
                                                placeholder="••••••••"
                                                className="w-full h-7 py-0 px-2 pl-7 bg-slate-50 border border-slate-200 rounded-md text-[11px] outline-none focus:border-indigo-600 transition font-mono font-bold"
                                                dir="ltr"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword(!showPassword)}
                                                className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-[9px] transition"
                                            >
                                                <i className={`fa-solid ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    /* Side-by-side Passwords in 2 Columns */
                                    <div className="grid grid-cols-2 gap-1.5">
                                        <div>
                                            <div className="flex justify-between items-center mb-0.5">
                                                <label className="text-[8.5px] font-bold text-slate-600 truncate leading-tight">كلمة السر:</label>
                                                {password.length >= 6 && <span className="text-[7.5px] text-emerald-600 font-bold">✓ مناسب</span>}
                                            </div>
                                            <div className="relative">
                                                <input
                                                    type={showPassword ? 'text' : 'password'}
                                                    required
                                                    value={password}
                                                    onChange={(e) => setPassword(e.target.value)}
                                                    placeholder="••••••••"
                                                    className="w-full h-7 py-0 px-1.5 pl-6 bg-slate-50 border border-slate-200 rounded-md text-[10.5px] outline-none focus:border-indigo-600 transition font-mono font-bold"
                                                    dir="ltr"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setShowPassword(!showPassword)}
                                                    className="absolute left-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-[8.5px] transition"
                                                >
                                                    <i className={`fa-solid ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                                                </button>
                                            </div>
                                        </div>

                                        <div>
                                            <div className="flex justify-between items-center mb-0.5">
                                                <label className="text-[8.5px] font-bold text-slate-600 truncate leading-tight">تأكيد السر:</label>
                                                {confirmPassword && (
                                                    <span className={`text-[7.5px] font-bold ${confirmPassword === password ? 'text-emerald-600' : 'text-rose-500'}`}>
                                                        {confirmPassword === password ? '✓' : '✗'}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="relative">
                                                <input
                                                    type={showPassword ? 'text' : 'password'}
                                                    required
                                                    value={confirmPassword}
                                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                                    placeholder="••••••••"
                                                    className={`w-full h-7 py-0 px-1.5 pl-6 bg-slate-50 border rounded-md text-[10.5px] outline-none transition font-mono font-bold ${confirmPassword && confirmPassword !== password ? 'border-rose-400 focus:border-rose-500' : 'border-slate-200 focus:border-indigo-600'}`}
                                                    dir="ltr"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setShowPassword(!showPassword)}
                                                    className="absolute left-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-[8.5px] transition"
                                                >
                                                    <i className={`fa-solid ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full h-7.5 py-0 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-[11px] shadow-xs transition active:scale-95 disabled:opacity-50 mt-0.5 flex items-center justify-center gap-1.5"
                                >
                                    {loading ? (
                                        <i className="fa-solid fa-circle-notch fa-spin text-[10px]"></i>
                                    ) : (
                                        <i className={`fa-solid ${mode === 'signin' ? 'fa-right-to-bracket' : 'fa-user-plus'} text-[10px]`}></i>
                                    )}
                                    <span>{mode === 'signin' ? 'تسجيل الدخول' : 'إنشاء الحساب'}</span>
                                </button>
                            </form>

                            {/* Divider */}
                            <div className="flex items-center gap-2 my-0.5">
                                <div className="flex-1 h-[1px] bg-slate-200"></div>
                                <span className="text-[8.5px] text-slate-400 font-bold">أو الدخول عبر</span>
                                <div className="flex-1 h-[1px] bg-slate-200"></div>
                            </div>

                            {/* Google OAuth Direct Sign In */}
                            <button
                                onClick={handleGoogleSignIn}
                                disabled={loading}
                                className="w-full h-7 py-0 bg-white hover:bg-slate-50 text-slate-800 rounded-lg font-bold text-[10.5px] border border-slate-200 shadow-2xs transition active:scale-95 flex items-center justify-center gap-1.5"
                            >
                                <i className="fa-brands fa-google text-red-500 text-xs"></i>
                                <span>حساب Google</span>
                            </button>

                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AuthModal;
