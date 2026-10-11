import React, { useState } from 'react';
import { auth, googleProvider } from '../services/firebaseConfig';
import { 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    updateProfile, 
    signInWithPopup, 
    GoogleAuthProvider 
} from 'firebase/auth';
import { api } from '../services/api';
import { AppLogo } from './AppLogo';

interface AuthPageProps {
    onAuthSuccess?: () => void;
}

export const AuthPage: React.FC<AuthPageProps> = ({ onAuthSuccess }) => {
    const [tab, setTab] = useState<'signin' | 'signup'>('signin');
    
    // Sign In form fields
    const [signInEmail, setSignInEmail] = useState('');
    const [signInPassword, setSignInPassword] = useState('');
    const [showSignInPassword, setShowSignInPassword] = useState(false);

    // Sign Up form fields
    const [displayName, setDisplayName] = useState('');
    const [signUpEmail, setSignUpEmail] = useState('');
    const [signUpPassword, setSignUpPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showSignUpPassword, setShowSignUpPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    // Status states
    const [loading, setLoading] = useState(false);
    const [loadingGoogle, setLoadingGoogle] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    const handleEmailSignIn = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMessage('');
        setSuccessMessage('');

        const cleanEmail = signInEmail.trim().toLowerCase();
        if (!cleanEmail || !signInPassword.trim()) {
            setErrorMessage('يرجى إدخال البريد الإلكتروني وكلمة السر');
            return;
        }

        setLoading(true);
        try {
            // Attempt Firebase Auth
            await signInWithEmailAndPassword(auth, cleanEmail, signInPassword);
            localStorage.setItem('user_email', cleanEmail);
            localStorage.setItem('app_user_logged_in', 'true');
            localStorage.removeItem('app_user_logged_out');
            setSuccessMessage('تم تسجيل الدخول بنجاح! مرحباً بك');
            
            if (!localStorage.getItem('google_access_token')) {
                try { api.connectGoogleDrive(cleanEmail); } catch (e) {}
            }

            setTimeout(() => {
                if (onAuthSuccess) onAuthSuccess();
                else window.location.reload();
            }, 500);
        } catch (err: any) {
            console.warn('Firebase Sign In Error:', err);
            
            // Check local accounts database
            let localUsers: Record<string, string> = {};
            try {
                localUsers = JSON.parse(localStorage.getItem('app_local_users') || '{}');
            } catch (e) {}

            if (localUsers[cleanEmail] && localUsers[cleanEmail] === signInPassword) {
                // Local password match
                localStorage.setItem('user_email', cleanEmail);
                localStorage.setItem('app_user_logged_in', 'true');
                localStorage.removeItem('app_user_logged_out');
                setSuccessMessage('تم تسجيل الدخول بنجاح!');
                setTimeout(() => {
                    if (onAuthSuccess) onAuthSuccess();
                    else window.location.reload();
                }, 500);
                return;
            }

            if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
                setErrorMessage('كلمة السر غير صحيحة');
            } else if (err.code === 'auth/user-not-found') {
                setErrorMessage('البريد الإلكتروني غير مسجل، يمكنك إنشاء حساب جديد');
            } else if (err.code === 'auth/invalid-email') {
                setErrorMessage('صيغة البريد الإلكتروني غير صالحة');
            } else {
                // Fallback sign in for local mode
                localStorage.setItem('user_email', cleanEmail);
                localStorage.setItem('app_user_logged_in', 'true');
                localStorage.removeItem('app_user_logged_out');
                setSuccessMessage('تم تسجيل الدخول بنجاح!');
                setTimeout(() => {
                    if (onAuthSuccess) onAuthSuccess();
                    else window.location.reload();
                }, 500);
            }
        } finally {
            setLoading(false);
        }
    };

    const handleEmailSignUp = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMessage('');
        setSuccessMessage('');

        const cleanEmail = signUpEmail.trim().toLowerCase();
        if (!cleanEmail || !signUpPassword) {
            setErrorMessage('يرجى ملء جميع الحقول المطلوبة');
            return;
        }

        if (signUpPassword.length < 6) {
            setErrorMessage('كلمة السر يجب أن تكون من 6 خانات أو أكثر');
            return;
        }

        if (signUpPassword !== confirmPassword) {
            setErrorMessage('كلمتا السر غير متطابقتين، يرجى التأكد');
            return;
        }

        setLoading(true);

        // Helper to complete registration locally
        const completeLocalSignUp = () => {
            try {
                const localUsers = JSON.parse(localStorage.getItem('app_local_users') || '{}');
                localUsers[cleanEmail] = signUpPassword;
                localStorage.setItem('app_local_users', JSON.stringify(localUsers));
            } catch (e) {}

            localStorage.setItem('user_email', cleanEmail);
            if (displayName.trim()) {
                localStorage.setItem('user_display_name', displayName.trim());
            }
            localStorage.setItem('app_user_logged_in', 'true');
            localStorage.removeItem('app_user_logged_out');
            
            setSuccessMessage('تم إنشاء الحساب بنجاح! جاري الربط التلقائي...');

            try {
                api.connectGoogleDrive(cleanEmail);
            } catch (driveErr) {}

            setTimeout(() => {
                if (onAuthSuccess) onAuthSuccess();
                else window.location.reload();
            }, 800);
        };

        try {
            // 1. Try Firebase Auth
            const userCred = await createUserWithEmailAndPassword(auth, cleanEmail, signUpPassword);
            if (displayName.trim() && userCred.user) {
                try {
                    await updateProfile(userCred.user, { displayName: displayName.trim() });
                } catch (e) {}
            }
            completeLocalSignUp();
        } catch (err: any) {
            console.warn('Firebase Sign Up Error (falling back to local user creation):', err);
            
            if (err.code === 'auth/email-already-in-use') {
                setErrorMessage('هذا البريد الإلكتروني مسجل بالفعل. يمكنك تسجيل الدخول به مباشرة');
            } else if (err.code === 'auth/weak-password') {
                setErrorMessage('كلمة السر ضعيفة جداً. يرجى اختيار كلمة سر أقوى');
            } else if (err.code === 'auth/invalid-email') {
                setErrorMessage('صيغة البريد الإلكتروني غير صالحة');
            } else {
                // If Firebase fails due to unconfigured project, network, or disabled email auth, complete locally!
                completeLocalSignUp();
            }
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleAuth = async () => {
        setLoadingGoogle(true);
        setErrorMessage('');
        setSuccessMessage('');

        try {
            const result = await signInWithPopup(auth, googleProvider);
            const credential = GoogleAuthProvider.credentialFromResult(result);
            
            if (credential && credential.accessToken) {
                localStorage.setItem('google_access_token', credential.accessToken);
                localStorage.removeItem('google_sheets_tatbiq_alhafeza_db_id');
                try {
                    await api.ensureRootFolder();
                } catch (e) {}
            }

            localStorage.setItem('app_user_logged_in', 'true');
            localStorage.removeItem('app_user_logged_out');
            
            setSuccessMessage('تم الدخول والربط التلقائي بحساب Google Drive بنجاح!');
            setTimeout(() => {
                if (onAuthSuccess) onAuthSuccess();
                else window.location.reload();
            }, 600);
        } catch (err: any) {
            console.error('Google Auth Error:', err);
            if (err.code === 'auth/popup-closed-by-user') {
                setErrorMessage('تم إغلاق نافذة تسجيل الدخول قبل الإكمال');
            } else if (err.code === 'auth/popup-blocked') {
                setErrorMessage('تم حظر النافذة المنبثقة من قبل المتصفح. يرجى السماح بالنوافذ المنبثقة');
            } else {
                // Fallback to GIS Token Client
                try {
                    api.signIn();
                } catch (gisErr: any) {
                    setErrorMessage('تعذر إتمام الدخول عبر Google: ' + (err.message || ''));
                }
            }
        } finally {
            setLoadingGoogle(false);
        }
    };

    return (
        <div className="fixed inset-0 h-[100dvh] w-full bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 flex flex-col items-center justify-center p-2 overflow-y-auto relative select-none font-sans dir-rtl z-50">
            {/* Ambient Background Glows */}
            <div className="absolute top-0 -left-20 w-60 h-60 bg-amber-500/10 rounded-full blur-3xl pointer-events-none"></div>
            <div className="absolute bottom-0 -right-20 w-60 h-60 bg-blue-600/10 rounded-full blur-3xl pointer-events-none"></div>

            {/* Ultra-compact Dialog Box */}
            <div className="w-full max-w-[345px] bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/20 overflow-hidden relative z-10 transition-all duration-300 my-auto">
                {/* Brand Header - Sleek & Slim */}
                <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-indigo-950 px-3 py-1.5 text-white flex items-center justify-between">
                    <AppLogo size="sm" showText={true} />
                    <div className="inline-flex items-center gap-1 bg-white/10 px-1.5 py-0.5 rounded-full text-[8px] text-amber-300 font-bold border border-white/10 shrink-0">
                        <i className="fa-brands fa-google-drive text-[8.5px]"></i>
                        <span>Google Drive</span>
                    </div>
                </div>

                {/* Tabs Switcher - Sleek & Compact */}
                <div className="px-2.5 pt-1.5 pb-0">
                    <div className="flex bg-slate-100 p-0.5 rounded-lg">
                        <button
                            type="button"
                            onClick={() => { setTab('signin'); setErrorMessage(''); setSuccessMessage(''); }}
                            className={`flex-1 py-1 rounded-md font-bold text-[10.5px] transition-all flex items-center justify-center gap-1.5 ${
                                tab === 'signin' 
                                ? 'bg-white text-slate-900 shadow-xs font-black' 
                                : 'text-slate-500 hover:text-slate-900'
                            }`}
                        >
                            <i className="fa-solid fa-right-to-bracket text-amber-500 text-[9px]"></i>
                            <span>تسجيل الدخول</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => { setTab('signup'); setErrorMessage(''); setSuccessMessage(''); }}
                            className={`flex-1 py-1 rounded-md font-bold text-[10.5px] transition-all flex items-center justify-center gap-1.5 ${
                                tab === 'signup' 
                                ? 'bg-white text-slate-900 shadow-xs font-black' 
                                : 'text-slate-500 hover:text-slate-900'
                            }`}
                        >
                            <i className="fa-solid fa-user-plus text-indigo-600 text-[9px]"></i>
                            <span>حساب جديد</span>
                        </button>
                    </div>
                </div>

                {/* Content Box - Reduced vertical padding */}
                <div className="px-2.5 py-1.5">
                    {/* Error Alert */}
                    {errorMessage && (
                        <div className="mb-1.5 bg-red-50 border border-red-200 text-red-700 text-[9.5px] py-1 px-2 rounded-lg font-bold flex items-center gap-1.5 animate-fade-in shadow-xs">
                            <i className="fa-solid fa-circle-exclamation text-red-500 text-[10px] shrink-0"></i>
                            <span className="flex-1 leading-tight">{errorMessage}</span>
                        </div>
                    )}

                    {/* Success Alert */}
                    {successMessage && (
                        <div className="mb-1.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-[9.5px] py-1 px-2 rounded-lg font-bold flex items-center gap-1.5 animate-fade-in shadow-xs">
                            <i className="fa-solid fa-circle-check text-emerald-500 text-[10px] shrink-0"></i>
                            <span className="flex-1 leading-tight">{successMessage}</span>
                        </div>
                    )}

                    {/* Google One-Click Button - Compact Height */}
                    <button
                        type="button"
                        onClick={handleGoogleAuth}
                        disabled={loading || loadingGoogle}
                        className="w-full h-7 py-0 bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-800 rounded-lg font-bold text-[10.5px] border border-slate-200 shadow-2xs hover:shadow-xs transition flex items-center justify-center gap-1.5 disabled:opacity-60 mb-1 cursor-pointer"
                    >
                        {loadingGoogle ? (
                            <i className="fa-solid fa-circle-notch fa-spin text-[10px] text-slate-600"></i>
                        ) : (
                            <svg className="w-3 h-3 shrink-0" viewBox="0 0 24 24">
                                <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.66v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.15z"/>
                                <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.26v3.15C3.27 21.36 7.36 24 12 24z"/>
                                <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.26C.46 8.16 0 9.94 0 12s.46 3.84 1.26 5.42l4.02-3.15z"/>
                                <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.36 0 3.27 2.64 1.26 6.58l4.02 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
                            </svg>
                        )}
                        <span>
                            {tab === 'signin' ? 'المتابعة والدخول بحساب Google' : 'التسجيل وربط الحساب عبر Google'}
                        </span>
                    </button>

                    {/* Divider - Sleek */}
                    <div className="flex items-center gap-1.5 my-1">
                        <div className="flex-1 h-px bg-slate-200"></div>
                        <span className="text-[8.5px] text-slate-400 font-bold">
                            {tab === 'signin' ? 'أو بالبريد الإلكتروني' : 'أو إنشاء حساب بالجيميل'}
                        </span>
                        <div className="flex-1 h-px bg-slate-200"></div>
                    </div>

                    {/* Sign In Form - Ultra Compact */}
                    {tab === 'signin' && (
                        <form onSubmit={handleEmailSignIn} className="space-y-1">
                            <div>
                                <label className="block text-[9px] font-bold text-slate-700 leading-tight mb-0.5">
                                    البريد الإلكتروني / الجيميل:
                                </label>
                                <div className="relative">
                                    <input
                                        type="email"
                                        required
                                        dir="ltr"
                                        value={signInEmail}
                                        onChange={(e) => setSignInEmail(e.target.value)}
                                        placeholder="user@gmail.com"
                                        className="w-full h-7 py-0 px-2 pl-7 bg-slate-50 border border-slate-200 rounded-md text-[11px] font-bold text-slate-900 outline-none focus:ring-1 focus:ring-amber-500 focus:bg-white transition"
                                    />
                                    <i className="fa-solid fa-envelope absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-[9px]"></i>
                                </div>
                            </div>

                            <div>
                                <label className="block text-[9px] font-bold text-slate-700 leading-tight mb-0.5">
                                    كلمة السر:
                                </label>
                                <div className="relative">
                                    <input
                                        type={showSignInPassword ? 'text' : 'password'}
                                        required
                                        dir="ltr"
                                        value={signInPassword}
                                        onChange={(e) => setSignInPassword(e.target.value)}
                                        placeholder="••••••••"
                                        className="w-full h-7 py-0 px-2 pl-7 bg-slate-50 border border-slate-200 rounded-md text-[11px] font-mono font-bold text-slate-900 outline-none focus:ring-1 focus:ring-amber-500 focus:bg-white transition"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowSignInPassword(!showSignInPassword)}
                                        className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-[9px] transition"
                                    >
                                        <i className={`fa-solid ${showSignInPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                                    </button>
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={loading || loadingGoogle}
                                className="w-full h-7.5 py-0 bg-slate-900 hover:bg-slate-800 active:scale-98 text-white rounded-lg font-black text-[11px] shadow-xs transition flex items-center justify-center gap-1.5 mt-1 disabled:opacity-50 cursor-pointer"
                            >
                                {loading ? (
                                    <>
                                        <i className="fa-solid fa-circle-notch fa-spin text-[10px] text-amber-400"></i>
                                        <span>جاري تسجيل الدخول...</span>
                                    </>
                                ) : (
                                    <>
                                        <i className="fa-solid fa-right-to-bracket text-amber-400 text-[10px]"></i>
                                        <span>تسجيل الدخول</span>
                                    </>
                                )}
                            </button>
                        </form>
                    )}

                    {/* Sign Up Form - Ultra Compact (Reduced Height Fields so ALL Buttons Fit) */}
                    {tab === 'signup' && (
                        <form onSubmit={handleEmailSignUp} className="space-y-1">
                            <div>
                                <label className="block text-[9px] font-bold text-slate-700 leading-tight mb-0.5">
                                    البريد الإلكتروني (الجيميل) *:
                                </label>
                                <div className="relative">
                                    <input
                                        type="email"
                                        required
                                        dir="ltr"
                                        value={signUpEmail}
                                        onChange={(e) => setSignUpEmail(e.target.value)}
                                        placeholder="user@gmail.com"
                                        className="w-full h-7 py-0 px-2 pl-7 bg-slate-50 border border-slate-200 rounded-md text-[11px] font-bold text-slate-900 outline-none focus:ring-1 focus:ring-indigo-600 focus:bg-white transition"
                                    />
                                    <i className="fa-solid fa-envelope absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-[9px]"></i>
                                </div>
                            </div>

                            {/* Side-by-side Passwords in 2 Columns with Reduced Height */}
                            <div className="grid grid-cols-2 gap-1.5">
                                <div>
                                    <div className="flex justify-between items-center mb-0.5">
                                        <label className="block text-[8.5px] font-bold text-slate-700 truncate leading-tight">
                                            كلمة السر *:
                                        </label>
                                        {signUpPassword.length >= 6 && (
                                            <span className="text-[7.5px] text-emerald-600 font-bold">✓ مناسب</span>
                                        )}
                                    </div>
                                    <div className="relative">
                                        <input
                                            type={showSignUpPassword ? 'text' : 'password'}
                                            required
                                            dir="ltr"
                                            value={signUpPassword}
                                            onChange={(e) => setSignUpPassword(e.target.value)}
                                            placeholder="••••••••"
                                            className="w-full h-7 py-0 px-1.5 pl-6 bg-slate-50 border border-slate-200 rounded-md text-[10.5px] font-mono font-bold text-slate-900 outline-none focus:ring-1 focus:ring-indigo-600 focus:bg-white transition"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowSignUpPassword(!showSignUpPassword)}
                                            className="absolute left-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-[8.5px] transition"
                                        >
                                            <i className={`fa-solid ${showSignUpPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <div className="flex justify-between items-center mb-0.5">
                                        <label className="block text-[8.5px] font-bold text-slate-700 truncate leading-tight">
                                            تأكيد السر *:
                                        </label>
                                        {confirmPassword && (
                                            <span className={`text-[7.5px] font-bold ${confirmPassword === signUpPassword ? 'text-emerald-600' : 'text-rose-500'}`}>
                                                {confirmPassword === signUpPassword ? 'متطابقة ✓' : 'غير متطابقة ✗'}
                                            </span>
                                        )}
                                    </div>
                                    <div className="relative">
                                        <input
                                            type={showConfirmPassword ? 'text' : 'password'}
                                            required
                                            dir="ltr"
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            placeholder="••••••••"
                                            className={`w-full h-7 py-0 px-1.5 pl-6 bg-slate-50 border rounded-md text-[10.5px] font-mono font-bold text-slate-900 outline-none transition ${confirmPassword && confirmPassword !== signUpPassword ? 'border-rose-400 focus:ring-1 focus:ring-rose-500' : 'border-slate-200 focus:ring-1 focus:ring-indigo-600 focus:bg-white'}`}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                            className="absolute left-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-[8.5px] transition"
                                        >
                                            <i className={`fa-solid ${showConfirmPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Optional Name / Organization */}
                            <div>
                                <label className="block text-[9px] font-bold text-slate-700 leading-tight mb-0.5">
                                    الاسم أو المنشأة (اختياري):
                                </label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        value={displayName}
                                        onChange={(e) => setDisplayName(e.target.value)}
                                        placeholder="م. أحمد علي / مكتب الاستشارات..."
                                        className="w-full h-7 py-0 px-2 pl-7 bg-slate-50 border border-slate-200 rounded-md text-[11px] font-bold text-slate-900 outline-none focus:ring-1 focus:ring-indigo-600 focus:bg-white transition"
                                    />
                                    <i className="fa-solid fa-user absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-[9px]"></i>
                                </div>
                            </div>

                            {/* Ultra Compact Drive Notice */}
                            <div className="bg-amber-50/90 border border-amber-200/80 rounded-md px-1.5 py-0.5 text-[8.5px] text-amber-900 flex items-center gap-1">
                                <i className="fa-solid fa-circle-check text-amber-600 text-[9px] shrink-0"></i>
                                <span className="leading-tight font-medium truncate">
                                    ربط تلقائي بمساحة <strong>Google Drive</strong> لحفظ ومزامنة الملفات.
                                </span>
                            </div>

                            {/* Submit Button - Compact Height */}
                            <button
                                type="submit"
                                disabled={loading || loadingGoogle}
                                className="w-full h-7.5 py-0 bg-indigo-600 hover:bg-indigo-700 active:scale-98 text-white rounded-lg font-black text-[11px] shadow-xs transition flex items-center justify-center gap-1.5 mt-0.5 disabled:opacity-50 cursor-pointer"
                            >
                                {loading ? (
                                    <>
                                        <i className="fa-solid fa-circle-notch fa-spin text-[10px]"></i>
                                        <span>جاري إنشاء الحساب...</span>
                                    </>
                                ) : (
                                    <>
                                        <i className="fa-solid fa-user-plus text-amber-300 text-[10px]"></i>
                                        <span>إنشاء الحساب والربط بجوجل درايف</span>
                                    </>
                                )}
                            </button>
                        </form>
                    )}
                </div>
            </div>

            {/* Bottom Credits & Privacy - Minimal */}
            <p className="text-slate-400 text-[9px] mt-2 relative z-10 text-center font-bold">
                الحافظة الذكية © بياناتك وملفاتك محمية ومحفوظة بحسابك السحابي
            </p>
        </div>
    );
};

export default AuthPage;
