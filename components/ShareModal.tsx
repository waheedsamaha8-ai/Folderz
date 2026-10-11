import React, { useState } from 'react';
import { FileItem, ItemType } from '../types';
import { api } from '../services/api';
import JSZip from 'jszip';

interface ShareModalProps {
    item: FileItem | null;
    projectName?: string;
    onClose: () => void;
}

export const ShareModal: React.FC<ShareModalProps> = ({ item, projectName, onClose }) => {
    const [downloading, setDownloading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [fileBlob, setFileBlob] = useState<File | null>(null);
    const [copied, setCopied] = useState(false);
    const [statusMsg, setStatusMsg] = useState('');

    if (!item) return null;

    const isFolder = item.type === ItemType.FOLDER;
    const isDwg = !isFolder && (
        item.name.toLowerCase().endsWith('.dwg') || 
        item.name.toLowerCase().endsWith('.dxf') || 
        (item.mimeType || '').includes('acad') || 
        (item.mimeType || '').includes('dwg')
    );

    const shareUrl = item.webViewLink || (window.location.origin + '/#/project/' + (item.parentId || '') + '/' + item.id);
    const dateStr = new Date(item.createdTime).toLocaleDateString('ar-EG');
    const cleanProjectName = projectName || item.projectName || 'مشروع تنفيذي';

    // Format filesize string
    const formatSize = (bytes?: number) => {
        if (!bytes) return 'غير محدد';
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} كيلوبايت`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} ميجابايت`;
    };

    // Construct text message for WhatsApp and text sharing
    const getShareMessage = () => {
        if (isFolder) {
            return `📁 *مشاركة مجلد من مشروع: ${cleanProjectName}*\n` +
                   `📌 *اسم المجلد:* ${item.name}\n` +
                   `📄 *المحتويات:* ${item.fileCount || 0} ملفات | ${item.folderCount || 0} مجلدات فرعية\n` +
                   `📅 *تاريخ التحديث:* ${dateStr}\n\n` +
                   `🔗 *رابط الوصول المباشر:*\n${shareUrl}`;
        } else if (isDwg) {
            return `📐 *مشاركة مخطط أوتوكاد DWG*\n` +
                   `🏗️ *المشروع:* ${cleanProjectName}\n` +
                   `📐 *اسم المخطط:* ${item.name}\n` +
                   `📦 *الحجم:* ${formatSize(item.size)}\n` +
                   `📅 *تاريخ الإضافة:* ${dateStr}\n\n` +
                   `🔗 *رابط التحميل والملاحظات:*\n${shareUrl}\n\n` +
                   `💡 *ملاحظة:* يمكنك فتح الملف مباشرة باستخدام تطبيق DWG FastView أو AutoCAD على الهاتف.`;
        } else {
            return `📄 *مشاركة ملف من مشروع: ${cleanProjectName}*\n` +
                   `📌 *اسم الملف:* ${item.name}\n` +
                   `📦 *الحجم:* ${formatSize(item.size)}\n` +
                   `📅 *تاريخ الإضافة:* ${dateStr}\n\n` +
                   `🔗 *رابط المعاينة والتحميل:*\n${shareUrl}`;
        }
    };

    // Download single file blob for native file sharing or CAD opening
    const prepareFileBlob = async (): Promise<File | null> => {
        if (fileBlob) return fileBlob;
        setDownloading(true);
        setStatusMsg('جاري جلب وتحضير الملف الأصلي للمشاركة...');
        try {
            const blob = await api.downloadFileBlob(item.id, (p) => setProgress(p));
            let mimeType = blob.type || 'application/octet-stream';
            if (isDwg) {
                mimeType = 'application/acad';
            }
            const file = new File([blob], item.name, { type: mimeType });
            setFileBlob(file);
            setDownloading(false);
            setStatusMsg('');
            return file;
        } catch (e) {
            console.error("Failed to download blob for share", e);
            setDownloading(false);
            setStatusMsg('فشل تحميل الملف، سيتم مشاركة الرابط كبديل');
            return null;
        }
    };

    // 1. Direct File Sharing (Sends the ACTUAL FILE to WhatsApp/Apps)
    const handleDirectFileShare = async () => {
        if (isFolder) return;
        setDownloading(true);
        setStatusMsg('جاري تحميل الملف وتمريره للواتساب/التطبيقات...');
        try {
            const readyFile = fileBlob || await prepareFileBlob();
            if (readyFile) {
                if (navigator.canShare && navigator.canShare({ files: [readyFile] })) {
                    await navigator.share({
                        files: [readyFile],
                        title: item.name,
                        text: getShareMessage()
                    });
                    onClose();
                    return;
                }

                // Fallback: Trigger direct browser download of the actual physical file
                const url = URL.createObjectURL(readyFile);
                const a = document.createElement('a');
                a.href = url;
                a.download = item.name;
                document.body.appendChild(a);
                a.click();
                setTimeout(() => {
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                }, 1000);
                alert("تم تحميل الملف المباشر على جهازك بنجاح. يمكنك الآن إرساله لأي شخص.");
            }
        } catch (e) {
            console.log("Direct share canceled or error", e);
        } finally {
            setDownloading(false);
        }
    };

    // 2. Direct Folder Sharing (Zips entire folder into a real .ZIP file to send)
    const handleZipAndShareFolder = async () => {
        if (!isFolder) return;
        setDownloading(true);
        setStatusMsg('جاري تجميع وضغط كافة ملفات المجلد في ملف ZIP واحد...');
        setProgress(10);
        try {
            const contents = await api.getContents(item.id, false);
            const filesOnly = contents.filter(i => i.type === ItemType.FILE && !api.isHiddenSystemItem(i.name, i.mimeType));
            
            if (filesOnly.length === 0) {
                alert("المجلد فارغ لا يحتوي على ملفات قابلة للضغط.");
                setDownloading(false);
                return;
            }

            const zip = new JSZip();
            let completed = 0;

            for (let i = 0; i < filesOnly.length; i++) {
                const fileItem = filesOnly[i];
                setStatusMsg(`جاري ضغط الملف (${i + 1}/${filesOnly.length}): ${fileItem.name}`);
                try {
                    const blob = await api.downloadFileBlob(fileItem.id);
                    zip.file(fileItem.name, blob);
                } catch (err) {
                    console.warn("Skipping file in zip compression", fileItem.name, err);
                }
                completed++;
                setProgress(Math.round((completed / filesOnly.length) * 75));
            }

            setStatusMsg('جاري إنشاء أرشيف الـ ZIP المباشر...');
            const zipBlob = await zip.generateAsync({ type: 'blob' }, (metadata) => {
                setProgress(75 + Math.round(metadata.percent * 0.25));
            });

            const zipFileName = `${item.name.replace(/[\/\\?%*:|"<> ]/g, '_')}.zip`;
            const zipFile = new File([zipBlob], zipFileName, { type: 'application/zip' });
            
            setDownloading(false);
            setStatusMsg('');

            // Share native zip file via Web Share API
            if (navigator.canShare && navigator.canShare({ files: [zipFile] })) {
                await navigator.share({
                    files: [zipFile],
                    title: zipFileName,
                    text: `📁 *مجلد مضغوط:* ${item.name}\n🏗️ *المشروع:* ${cleanProjectName}`
                });
                onClose();
                return;
            }

            // Download zip file directly if share is unsupported
            const url = URL.createObjectURL(zipBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = zipFileName;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 1000);
            alert("تم تحميل المجلد كاملاً كملف مضغوط ZIP على جهازك بنجاح!");

        } catch (e: any) {
            console.error("Failed to zip folder", e);
            alert(`حدث خطأ أثناء ضغط المجلد: ${e?.message || 'خطأ غير معروف'}`);
        } finally {
            setDownloading(false);
        }
    };

    // 3. Share text/link via WhatsApp
    const handleWhatsAppTextShare = () => {
        const text = getShareMessage();
        const encoded = encodeURIComponent(text);
        const waUrl = `https://api.whatsapp.com/send?text=${encoded}`;
        window.open(waUrl, '_blank');
        onClose();
    };

    // 4. Open DWG File directly in Mobile AutoCAD Viewer Apps (DWG FastView / AutoCAD)
    const handleOpenInCadApp = async () => {
        if (!isDwg) return;
        setDownloading(true);
        setStatusMsg('جاري تجهيز مخطط الأوتوكاد وتمريره لتطبيق الموبايل...');
        
        try {
            const readyFile = fileBlob || await prepareFileBlob();
            if (readyFile) {
                if (navigator.canShare && navigator.canShare({ files: [readyFile] })) {
                    setStatusMsg('اختر DWG FastView أو AutoCAD من القائمة...');
                    await navigator.share({
                        files: [readyFile],
                        title: item.name,
                        text: `فتح مخطط ${item.name}`
                    });
                    setDownloading(false);
                    setStatusMsg('');
                    onClose();
                    return;
                }

                // Direct File Object URL trigger with strict CAD MIME
                const url = URL.createObjectURL(readyFile);
                const a = document.createElement('a');
                a.href = url;
                a.download = item.name.endsWith('.dwg') ? item.name : `${item.name}.dwg`;
                a.target = '_self';
                document.body.appendChild(a);
                a.click();

                setTimeout(() => {
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                }, 1000);

                setStatusMsg('تم تحميل المخطط. افتح الملف المحمل عبر DWG FastView');
            }
        } catch (e) {
            console.error(e);
            alert("حدث خطأ أثناء فتح الملف. تحقق من اتصال الإنترنت.");
        } finally {
            setDownloading(false);
        }
    };

    // 5. Copy Message / Link
    const handleCopyText = () => {
        const text = getShareMessage();
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
    };

    return (
        <div className="fixed inset-0 z-[200] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-slate-100 flex flex-col">
                {/* Header */}
                <div className={`p-5 text-white flex justify-between items-center ${isDwg ? 'bg-gradient-to-r from-red-700 to-rose-600' : isFolder ? 'bg-gradient-to-r from-amber-600 to-yellow-500' : 'bg-gradient-to-r from-emerald-600 to-teal-600'}`}>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-xl shadow-inner border border-white/20">
                            <i className={`fa-solid ${isDwg ? 'fa-compass-drafting' : isFolder ? 'fa-folder-open' : 'fa-paperclip'}`}></i>
                        </div>
                        <div>
                            <h3 className="font-extrabold text-base">{isFolder ? 'مشاركة مجلد مباشر' : isDwg ? 'مشاركة مخطط أوتوكاد مباشر' : 'مشاركة ملف مباشر'}</h3>
                            <p className="text-white/80 text-[11px] truncate max-w-[220px]">{item.name}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 rounded-full bg-black/20 hover:bg-black/40 flex items-center justify-center text-white transition">
                        <i className="fa-solid fa-times"></i>
                    </button>
                </div>

                {/* Progress / Status Bar */}
                {downloading && (
                    <div className="bg-blue-50 border-b border-blue-100 p-3.5 flex flex-col gap-1.5 animate-pulse">
                        <div className="flex justify-between items-center text-xs font-bold text-blue-800">
                            <span className="truncate max-w-[260px]">{statusMsg || 'جاري التحضير والضغط...'}</span>
                            <span>{progress}%</span>
                        </div>
                        <div className="w-full bg-blue-200 h-2 rounded-full overflow-hidden">
                            <div className="bg-blue-600 h-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
                        </div>
                    </div>
                )}

                {/* Body Details Card */}
                <div className="p-5 flex flex-col gap-4 overflow-y-auto max-h-[70vh]">
                    <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80 text-xs text-slate-700 space-y-1.5 font-mono">
                        <div className="flex justify-between border-b border-slate-200/60 pb-1.5 font-sans font-bold text-slate-800">
                            <span>العنصر:</span>
                            <span className="truncate max-w-[200px]" title={item.name}>{item.name}</span>
                        </div>
                        <div className="flex justify-between text-[11px]">
                            <span>المشروع:</span>
                            <span className="font-sans font-bold text-teal-700">{cleanProjectName}</span>
                        </div>
                        {!isFolder && (
                            <div className="flex justify-between text-[11px]">
                                <span>الحجم الفعلي:</span>
                                <span>{formatSize(item.size)}</span>
                            </div>
                        )}
                        {isFolder && (
                            <div className="flex justify-between text-[11px]">
                                <span>المحتويات:</span>
                                <span>{item.fileCount || 0} ملف | {item.folderCount || 0} مجلد</span>
                            </div>
                        )}
                    </div>

                    {/* AutoCAD Special Actions Banner */}
                    {isDwg && (
                        <div className="bg-red-50 border border-red-200 p-3.5 rounded-2xl flex flex-col gap-2.5">
                            <div className="flex items-center gap-2 text-red-800 font-bold text-xs">
                                <i className="fa-solid fa-cube text-red-600 text-sm"></i>
                                <span>فتح المخطط مباشرة على تطبيقات الهاتف</span>
                            </div>
                            <button
                                onClick={handleOpenInCadApp}
                                disabled={downloading}
                                className="w-full py-2.5 bg-[#c41e3a] hover:bg-[#a01830] text-white rounded-xl font-bold text-xs shadow-md flex items-center justify-center gap-2 transition active:scale-95 disabled:opacity-50"
                            >
                                <i className="fa-solid fa-up-right-from-square"></i>
                                <span>فتح المخطط بالتطبيق (DWG FastView / AutoCAD)</span>
                            </button>
                        </div>
                    )}

                    {/* DIRECT FILE & FOLDER SHARING ACTIONS */}
                    <div className="flex flex-col gap-3 pt-1">
                        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider text-right">المشاركة المباشرة للملفات والمجلدات:</span>

                        {/* 1. DIRECT FILE SHARE BUTTON (For Files) */}
                        {!isFolder && (
                            <button
                                onClick={handleDirectFileShare}
                                disabled={downloading}
                                className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-2xl font-bold text-sm shadow-xl flex items-center justify-center gap-2.5 transition transform active:scale-95 border border-emerald-400/30 disabled:opacity-50"
                            >
                                <i className="fa-solid fa-file-arrow-up text-lg"></i>
                                <span>إرسال الملف نفسه مباشرة (File Share)</span>
                            </button>
                        )}

                        {/* 2. DIRECT FOLDER ZIP SHARE BUTTON (For Folders) */}
                        {isFolder && (
                            <button
                                onClick={handleZipAndShareFolder}
                                disabled={downloading}
                                className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white rounded-2xl font-bold text-sm shadow-xl flex items-center justify-center gap-2.5 transition transform active:scale-95 border border-amber-300/30 disabled:opacity-50"
                            >
                                <i className="fa-solid fa-file-zipper text-lg"></i>
                                <span>إرسال المجلد كاملاً كملف مضغوط (ZIP)</span>
                            </button>
                        )}

                        {/* 3. WHATSAPP LINK & TEXT SHARE */}
                        <button
                            onClick={handleWhatsAppTextShare}
                            disabled={downloading}
                            className="w-full py-2.5 bg-[#25D366] hover:bg-[#20bd5a] text-white rounded-2xl font-bold text-xs shadow-md flex items-center justify-center gap-2 transition active:scale-95 border border-emerald-400/30 disabled:opacity-50"
                        >
                            <i className="fa-brands fa-whatsapp text-lg"></i>
                            <span>مشاركة معلومات ورابط الوصول عبر واتساب</span>
                        </button>

                        {/* 4. COPY TEXT & LINK */}
                        <button
                            onClick={handleCopyText}
                            className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 transition border border-slate-200"
                        >
                            <i className={`fa-solid ${copied ? 'fa-check text-green-600' : 'fa-copy'}`}></i>
                            <span>{copied ? 'تم نسخ المعلومات والروابط!' : 'نسخ المعلومات والرابط'}</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ShareModal;
