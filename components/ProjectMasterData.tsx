
// @ts-nocheck
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, HIDDEN_LOGS_FOLDER } from '../services/api';
import { imageUtils } from '../services/imageUtils';
import { printService } from '../services/printService';
import ConfirmModal from './ConfirmModal'; 
import ProjectReportModal from './ProjectReportModal';
import { ReportGenerator } from '../services/reportGenerator';
import { Project, ProjectLog, ProjectPayment, BOQItem, PaymentItem, FileItem, ItemType, EngineeringReportItem, RFI, Submittal, Correspondence, Checklist, NCR } from '../types';
import html2canvas from 'html2canvas';
import EngineeringReportsTab from './EngineeringReportsTab';
import PaymentsTab from './PaymentsTab';
import BoqTab from './BoqTab';
import { dbService } from '../services/db';

const LogThumbnail: React.FC<{
    src: string;
    onClick: (resolvedSrc: string) => void;
    aspectRatio?: string;
    isFullLength?: boolean;
    isThumbnail?: boolean;
}> = ({ src, onClick, aspectRatio, isFullLength = false, isThumbnail = false }) => {
    const [imageSrc, setImageSrc] = useState<string>(() => {
        if (!src) return '';
        if (src.startsWith('data:') || src.startsWith('blob:')) return src;
        let fileId = '';
        const matchLh3 = src.match(/googleusercontent\.com\/d\/([a-zA-Z0-9_-]+)/);
        const matchDrive = src.match(/\/d\/([a-zA-Z0-9_-]+)/);
        const matchId = src.match(/id=([a-zA-Z0-9_-]+)/);
        if (matchLh3) fileId = matchLh3[1];
        else if (matchDrive) fileId = matchDrive[1];
        else if (matchId) fileId = matchId[1];
        else if (/^[a-zA-Z0-9_-]{20,}$/.test(src.trim())) fileId = src.trim();

        if (fileId) {
            return `https://lh3.googleusercontent.com/d/${fileId}`;
        }
        return src;
    });

    const [hasError, setHasError] = useState<boolean>(false);
    const [isPortrait, setIsPortrait] = useState<boolean | null>(null);

    // Extract fileId helper
    const extractFileId = (s: string) => {
        if (!s) return '';
        const matchLh3 = s.match(/googleusercontent\.com\/d\/([a-zA-Z0-9_-]+)/);
        const matchDrive = s.match(/\/d\/([a-zA-Z0-9_-]+)/);
        const matchId = s.match(/id=([a-zA-Z0-9_-]+)/);
        if (matchLh3) return matchLh3[1];
        if (matchDrive) return matchDrive[1];
        if (matchId) return matchId[1];
        if (/^[a-zA-Z0-9_-]{20,}$/.test(s.trim())) return s.trim();
        return '';
    };

    const handleImgLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
        const img = e.currentTarget;
        if (img.naturalWidth && img.naturalHeight) {
            setIsPortrait(img.naturalHeight > img.naturalWidth);
        }
        setHasError(false);
    };

    const handleImgError = async () => {
        const fileId = extractFileId(src) || extractFileId(imageSrc);
        if (fileId) {
            try {
                const blob = await api.downloadFile(fileId);
                if (blob) {
                    const url = URL.createObjectURL(blob);
                    setImageSrc(url);
                    setHasError(false);
                    return;
                }
            } catch (e) {}
        }
        setHasError(true);
    };

    useEffect(() => {
        let isMounted = true;
        let blobUrlToRevoke: string | null = null;
        setHasError(false);

        const resolveImage = async () => {
            if (!src) return;
            if (src.startsWith('data:') || src.startsWith('blob:')) {
                setImageSrc(src);
                setHasError(false);
                return;
            }

            const fileId = extractFileId(src);

            if (fileId) {
                // Try IndexedDB blob cache first (instant!)
                try {
                    const cachedBlob = await dbService.getBlob(fileId);
                    if (cachedBlob && isMounted) {
                        const url = URL.createObjectURL(cachedBlob);
                        blobUrlToRevoke = url;
                        setImageSrc(url);
                        setHasError(false);
                        return;
                    }
                } catch (e) {}

                // Set direct LH3 URL initially
                if (isMounted) {
                    setImageSrc(`https://lh3.googleusercontent.com/d/${fileId}`);
                    setHasError(false);
                }

                // Also fetch blob in background for offline cache & auth access
                try {
                    const blob = await api.downloadFile(fileId);
                    if (blob && isMounted) {
                        const url = URL.createObjectURL(blob);
                        blobUrlToRevoke = url;
                        setImageSrc(url);
                        setHasError(false);
                        return;
                    }
                } catch (e) {}
            } else if (isMounted) {
                setImageSrc(src);
                setHasError(false);
            }
        };

        resolveImage();

        return () => {
            isMounted = false;
            if (blobUrlToRevoke) URL.revokeObjectURL(blobUrlToRevoke);
        };
    }, [src]);

    const imgClass = `block transition-all duration-200 hover:scale-[1.01] ${
        isPortrait === true 
            ? 'w-full h-auto' 
            : isPortrait === false 
                ? 'h-full w-auto' 
                : 'max-w-full max-h-full opacity-90'
    }`;

    if (isThumbnail || aspectRatio === '100%') {
        return (
            <div 
                className="w-full h-full rounded-lg overflow-hidden border border-slate-200 bg-slate-100 cursor-pointer relative shadow-2xs hover:shadow-xs transition flex items-center justify-center p-0"
                onClick={() => onClick(imageSrc)}
            >
                {!hasError ? (
                    <img 
                        src={imageSrc} 
                        alt="صورة اليومية" 
                        className="w-full h-full object-cover rounded-lg transition-transform duration-200 hover:scale-105"
                        onLoad={handleImgLoad}
                        onError={handleImgError}
                    />
                ) : (
                    <div className="flex flex-col items-center justify-center text-slate-400 p-1">
                        <i className="fa-solid fa-image text-xs text-slate-300"></i>
                    </div>
                )}
            </div>
        );
    }

    if (isFullLength) {
        return (
            <div 
                className="w-full h-64 sm:h-80 rounded-2xl overflow-hidden border border-slate-100 bg-slate-50 cursor-pointer relative shadow-xs hover:shadow-md transition flex items-center justify-center p-0"
                onClick={() => onClick(imageSrc)}
            >
                {!hasError ? (
                    <img 
                        src={imageSrc} 
                        alt="صورة اليومية" 
                        className={imgClass}
                        onLoad={handleImgLoad}
                        onError={handleImgError}
                    />
                ) : (
                    <div className="flex flex-col items-center justify-center text-slate-400 p-2">
                        <i className="fa-solid fa-image text-2xl mb-1 text-slate-300"></i>
                        <span className="text-[10px]">تعذر تحميل الصورة</span>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div 
            className="w-full h-48 sm:h-56 rounded-xl overflow-hidden border border-slate-100 bg-slate-50 cursor-pointer relative shadow-xs hover:shadow-md transition flex items-center justify-center p-0"
            onClick={() => onClick(imageSrc)}
        >
            {!hasError ? (
                <img 
                    src={imageSrc} 
                    alt="صورة اليومية" 
                    className={imgClass}
                    onLoad={handleImgLoad}
                    onError={handleImgError}
                />
            ) : (
                <div className="flex flex-col items-center justify-center text-slate-400 p-2">
                    <i className="fa-solid fa-image text-lg mb-1 text-slate-300"></i>
                    <span className="text-[9px]">غير متاحة</span>
                </div>
            )}
        </div>
    );
};

// Full screen viewer obeying exact user rule (width fit if portrait, height fit if landscape)
const FullScreenLogModal: React.FC<{ src: string; onClose: () => void }> = ({ src, onClose }) => {
    const [isPortrait, setIsPortrait] = useState<boolean | null>(null);

    return (
        <div 
            className="fixed inset-0 z-[2000] bg-black/95 flex items-center justify-center overflow-auto p-0 animate-fade-in"
            onClick={onClose}
        >
            <button 
                onClick={onClose} 
                className="fixed top-5 right-5 z-[2010] w-12 h-12 bg-white/20 hover:bg-white/30 text-white rounded-full flex items-center justify-center backdrop-blur-md transition shadow-2xl"
                title="إغلاق"
            >
                <i className="fa-solid fa-times text-xl"></i>
            </button>
            <div 
                className="flex items-center justify-center max-w-none max-h-none"
                onClick={(e) => e.stopPropagation()}
            >
                <img 
                    src={src} 
                    alt="عرض الصورة" 
                    onLoad={(e) => {
                        const img = e.currentTarget;
                        if (img.naturalWidth && img.naturalHeight) {
                            setIsPortrait(img.naturalHeight > img.naturalWidth);
                        }
                    }}
                    className={`block transition-all duration-200 select-none ${
                        isPortrait === true 
                            ? 'w-screen h-auto max-w-full' 
                            : isPortrait === false 
                                ? 'h-screen w-auto max-h-full' 
                                : 'w-auto h-auto max-w-full max-h-full'
                    }`}
                />
            </div>
        </div>
    );
};

interface ProjectMasterDataProps {
    projectId: string;
    isOpen: boolean;
    onClose: () => void;
    onReportGenerated?: () => void;
    initialProjectData?: Project | null;
}

export default function ProjectMasterData({ projectId, isOpen, onClose, onReportGenerated, initialProjectData }: ProjectMasterDataProps) {
    const navigate = useNavigate();
    
    // --- State Management ---
    const [activeTab, setActiveTab] = useState<'logs' | 'payments' | 'boq' | 'soil'>('logs');
    const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
    
    // Report Modal State
    const [showReportModal, setShowReportModal] = useState(false);
    const [isGeneratingReport, setIsGeneratingReport] = useState(false);
    
    // LOADING STATE: Initialize based on whether we have data. 
    // If we have initialData, we show it instantly (loading=false). 
    // If not, we show spinner (loading=true).
    const [loading, setLoading] = useState(!initialProjectData);
    
    // REFRESH STATE: Tracks background syncing even if we showed initial data
    const [isRefreshing, setIsRefreshing] = useState(false);

    // --- LAZY LOAD STATE ---
    const [visibleLogsCount, setVisibleLogsCount] = useState(10); // Start small for instant open

    // CRITICAL FIX: Ref to track if we are currently saving locally.
    const isSavingRef = useRef(false);

    // Helper to sort logs descending (Date DESC -> Creation Time DESC)
    const sortLogs = (logs: ProjectLog[]) => {
        if (!logs || !Array.isArray(logs)) return [];
        return [...logs].sort((a, b) => {
            // 1. Sort by Date (Newest Day First)
            const dateA = a?.date ? new Date(a.date).getTime() : 0;
            const dateB = b?.date ? new Date(b.date).getTime() : 0;
            const dateDiff = dateB - dateA;
            if (!isNaN(dateDiff) && dateDiff !== 0) return dateDiff;
            
            // 2. If same day, Sort by createdAt or ID timestamp (Newest Entry First)
            const getTimestamp = (l: ProjectLog) => {
                if (l?.createdAt) {
                    const t = new Date(l.createdAt).getTime();
                    if (!isNaN(t)) return t;
                }
                const parts = l?.id ? l.id.split('_') : [];
                const num = parseInt(parts[1] || '0', 10);
                return isNaN(num) ? 0 : num;
            };
            const timeDiff = getTimestamp(b) - getTimestamp(a);
            return isNaN(timeDiff) ? 0 : timeDiff;
        });
    };

    // Data State
    const [masterData, setMasterData] = useState<{ 
        fullDescription: string; 
        logs: ProjectLog[]; 
        payments: ProjectPayment[]; 
        boqItems: BOQItem[]; 
        engineeringReports: EngineeringReportItem[]; // NEW ARRAY
        soilReport: string; // DEPRECATED: Keep for backward compatibility view
        newLog: string; 
        logDate: string; 
        newPaymentCumulative: string; // CHANGED to Cumulative Input
        newPaymentNote: string; 
        newInvoiceNumber: string; // NEW
        // NEW: DCS & QHSE Data
        rfis: RFI[];
        submittals: Submittal[];
        correspondence: Correspondence[];
        checklists: Checklist[];
        ncrs: NCR[];
    }>({ 
        fullDescription: initialProjectData?.fullDescription || '', 
        logs: sortLogs(initialProjectData?.executionLogs || []), // Sort initially
        payments: initialProjectData?.payments || [], 
        boqItems: initialProjectData?.boqItems || [], 
        engineeringReports: initialProjectData?.engineeringReports || [],
        soilReport: initialProjectData?.soilReportAnalysis || '', 
        newLog: '', 
        logDate: new Date().toISOString().split('T')[0], 
        newPaymentCumulative: '', 
        newPaymentNote: '',
        newInvoiceNumber: '',
        // Initialize new arrays
        rfis: initialProjectData?.rfis || [],
        submittals: initialProjectData?.submittals || [],
        correspondence: initialProjectData?.correspondence || [],
        checklists: initialProjectData?.checklists || [],
        ncrs: initialProjectData?.ncrs || []
    });

    // --- Report Generation ---
    const handleGenerateReport = async (startDate: string, endDate: string, reportType: string, title: string) => {
        setIsGeneratingReport(true);
        
        try {
            // 1. Fetch full project logs to filter
            const fullProject = await api.getProjectById(projectId);
            const logs = fullProject?.executionLogs || [];
            
            // 2. Filter logs by date range
            const filteredLogs = logs.filter(log => {
                const logDate = new Date(log.date);
                const start = new Date(startDate);
                const end = new Date(endDate);
                // Normalize dates to avoid time issues
                logDate.setHours(0,0,0,0);
                start.setHours(0,0,0,0);
                end.setHours(23,59,59,999);
                return logDate >= start && logDate <= end;
            });

            // 3. Assemble Structured Summary
            const targetProj = fullProject || initialProjectData;
            const aiSummaryHtml = `
                <div class="info-box" style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 14px 18px; margin-bottom: 20px;">
                    <h3 style="margin-top: 0; color: #1e3a8a; font-size: 1.15rem; font-weight: 700;">ملخص تقرير الأعمال والتوثيق الموقعي</h3>
                    <p style="margin: 4px 0;"><strong>اسم المشروع:</strong> ${targetProj?.name || '---'}</p>
                    <p style="margin: 4px 0;"><strong>المقاول المنفذ:</strong> ${targetProj?.contractor || '---'}</p>
                    <p style="margin: 4px 0;"><strong>الجهة المالكة / العميل:</strong> ${targetProj?.client || '---'}</p>
                    <p style="margin: 4px 0;"><strong>الفترة الزمنية:</strong> من ${startDate} إلى ${endDate}</p>
                    <p style="margin: 4px 0;"><strong>عدد السجلات الموثقة:</strong> ${filteredLogs.length} سجل عمل وملاحظة موقعية</p>
                </div>
            `;

            // 4. Assemble the Full Report
            const finalReportHtml = ReportGenerator.buildPhotoReport(
                title,
                aiSummaryHtml,
                filteredLogs,
                targetProj,
                { start: startDate, end: endDate }
            );

            // 5. Navigate to Editor
            // We need to close the modal first? Or just navigate.
            // Navigation will unmount this component if it's routed, but this is a modal.
            // We should close the modal.
            onClose();
            navigate(`/editor/${projectId}/${projectId}`, { 
                state: { 
                    initialContent: finalReportHtml, 
                    filename: `${title.replace(/ /g, '_')}_${endDate}`,
                    returnToMasterData: true
                } 
            });
            
            setShowReportModal(false);

        } catch (error) {
            console.error(error);
            alert("حدث خطأ أثناء إنشاء التقرير.");
        } finally {
            setIsGeneratingReport(false);
        }
    };

    // --- Effects ---
    const logImageInputRef = useRef<HTMLInputElement>(null);
    const logCameraInputRef = useRef<HTMLInputElement>(null);
    const editLogImageInputRef = useRef<HTMLInputElement>(null);
    const editLogCameraInputRef = useRef<HTMLInputElement>(null);
    
    const paymentFileRef = useRef<HTMLInputElement>(null);
    const paymentCameraRef = useRef<HTMLInputElement>(null);
    
    const boqImageRef = useRef<HTMLInputElement>(null);
    const boqCameraRef = useRef<HTMLInputElement>(null);
    
    const soilReportInputRef = useRef<HTMLInputElement>(null);
    const soilCameraRef = useRef<HTMLInputElement>(null);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);

    // Specific States (Logs)
    const [logImages, setLogImages] = useState<string[]>([]);
    const [selectedFullScreenImage, setSelectedFullScreenImage] = useState<string | null>(null);
    const [isUploadingImages, setIsUploadingImages] = useState(false); // Used for "Processing" state now
    const [editingLogId, setEditingLogId] = useState<string | null>(null);
    const [tempEditLogContent, setTempEditLogContent] = useState('');
    const [tempEditLogDate, setTempEditLogDate] = useState('');
    const [tempEditLogImages, setTempEditLogImages] = useState<string[]>([]);
    const [logToDeleteId, setLogToDeleteId] = useState<string | null>(null);
    
    // Specific States (Payments) - Moved to PaymentsTab

    // Specific States (BOQ) - Moved to BoqTab
// --- NEW: Document Management State ---
    const [itemToDelete, setItemToDelete] = useState<{ type: 'rfi' | 'submittal' | 'correspondence' | 'checklist' | 'ncr', id: string } | null>(null);
    const [editingItemType, setEditingItemType] = useState<'rfi' | 'submittal' | 'correspondence' | 'checklist' | 'ncr' | null>(null);
    const [editingItemId, setEditingItemId] = useState<string | null>(null);    
    // Specific States (DCS & QHSE)
    const [dcsSubTab, setDcsSubTab] = useState<'rfi' | 'submittal' | 'correspondence'>('rfi');
    const [qhseSubTab, setQhseSubTab] = useState<'checklist' | 'ncr'>('checklist');

    // DCS Form States
    const [showRfiModal, setShowRfiModal] = useState(false);
    const [newRfiData, setNewRfiData] = useState<Partial<RFI>>({ status: 'open', date: new Date().toISOString().split('T')[0] });
    
    const [showSubmittalModal, setShowSubmittalModal] = useState(false);
    const [newSubmittalData, setNewSubmittalData] = useState<Partial<Submittal>>({ status: 'pending', type: 'material', submissionDate: new Date().toISOString().split('T')[0] });

    const [showCorrespondenceModal, setShowCorrespondenceModal] = useState(false);
    const [newCorrespondenceData, setNewCorrespondenceData] = useState<Partial<Correspondence>>({ direction: 'incoming', date: new Date().toISOString().split('T')[0] });

    // QHSE Form States
    const [showChecklistModal, setShowChecklistModal] = useState(false);
    const [newChecklistData, setNewChecklistData] = useState<Partial<Checklist>>({ status: 'pending', date: new Date().toISOString().split('T')[0], items: [] });

    const [showNcrModal, setShowNcrModal] = useState(false);
    const [newNcrData, setNewNcrData] = useState<Partial<NCR>>({ status: 'open', issueDate: new Date().toISOString().split('T')[0] });

    // Specific States (Soil & General)
    const [isAnalyzingSoil, setIsAnalyzingSoil] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [voiceTarget, setVoiceTarget] = useState<'log' | 'payment'>('log');
    const [isProcessingVoice, setIsProcessingVoice] = useState(false);
    
    // Soil Viewer & Editing States - Moved to EngineeringReportsTab

    // Internal Modals
    const [sourceModal, setSourceModal] = useState<{ type: 'log' | 'editLog' | 'payment' | 'boq' | 'soil'; title: string } | null>(null);

    // App File Picker State
    const [showAppFilePicker, setShowAppFilePicker] = useState(false);
    const [pickerContext, setPickerContext] = useState<'log' | 'editLog' | 'payment' | 'boq' | 'soil' | null>(null);
    const [pickerCurrentFolderId, setPickerCurrentFolderId] = useState<string>(projectId);
    const [pickerBreadcrumbs, setPickerBreadcrumbs] = useState<{id: string, name: string}[]>([{id: projectId, name: 'الرئيسية'}]);
    const [pickerItems, setPickerItems] = useState<FileItem[]>([]);
    const [loadingPickerFiles, setLoadingPickerFiles] = useState(false);
    const [selectedPickerItems, setSelectedPickerItems] = useState<Set<string>>(new Set());
    const [isProcessingPicker, setIsProcessingPicker] = useState(false);

    // --- Effects ---
    useEffect(() => {
        // If initial data changes (e.g. parent updates), reflect it
        if (initialProjectData) {
             setMasterData(prev => {
                const incLogs = initialProjectData.executionLogs;
                const finalLogs = (incLogs && incLogs.length > 0) ? incLogs : prev.logs;
                return {
                    ...prev,
                    fullDescription: initialProjectData.fullDescription || prev.fullDescription,
                    logs: sortLogs(finalLogs), // Always sort descending
                    payments: initialProjectData.payments || prev.payments || [],
                    boqItems: initialProjectData.boqItems || prev.boqItems || [],
                    engineeringReports: initialProjectData.engineeringReports || prev.engineeringReports || [],
                    soilReport: initialProjectData.soilReportAnalysis || prev.soilReport,
                    rfis: initialProjectData.rfis || prev.rfis || [],
                    submittals: initialProjectData.submittals || prev.submittals || [],
                    correspondence: initialProjectData.correspondence || prev.correspondence || [],
                    checklists: initialProjectData.checklists || prev.checklists || [],
                    ncrs: initialProjectData.ncrs || prev.ncrs || []
                };
             });
             // If we got new data, stop loading spinner
             setLoading(false);
        }
    }, [initialProjectData]);

    useEffect(() => {
        if (isOpen && projectId) {
            const load = async () => {
                const logsKey = `pmd_logs_${projectId}`;
                try {
                    const savedLogsStr = localStorage.getItem(logsKey);
                    if (savedLogsStr) {
                        const parsedLogs = JSON.parse(savedLogsStr);
                        if (Array.isArray(parsedLogs) && parsedLogs.length > 0) {
                            setMasterData(prev => ({
                                ...prev,
                                logs: sortLogs(parsedLogs)
                            }));
                        }
                    }
                } catch(e) {}

                // Try to load other fields from LocalStorage draft
                const localStorageKey = `pmd_draft_${projectId}`;
                try {
                    const localDraftStr = localStorage.getItem(localStorageKey);
                    if (localDraftStr) {
                        const localDraft = JSON.parse(localDraftStr);
                        if (localDraft && typeof localDraft === 'object') {
                            setMasterData(prev => ({
                                ...prev,
                                ...localDraft,
                                logs: sortLogs((localDraft.logs && localDraft.logs.length > 0) ? localDraft.logs : prev.logs)
                            }));
                        }
                    }
                } catch (e) {
                    console.warn("Failed to load local draft", e);
                }

                // Trigger refresh state to show small indicator if data exists
                if (masterData.logs.length > 0) setIsRefreshing(true);
                else setLoading(true);

                try {
                    const currentProject = await api.getProjectById(projectId);
                    if (currentProject) {
                        setMasterData(prev => {
                            const incLogs = currentProject.executionLogs;
                            const finalLogs = (incLogs && incLogs.length > 0) ? incLogs : prev.logs;
                            if (finalLogs && finalLogs.length > 0) {
                                try { localStorage.setItem(logsKey, JSON.stringify(finalLogs)); } catch(e) {}
                            }
                            return {
                                ...prev,
                                fullDescription: currentProject.fullDescription || prev.fullDescription,
                                logs: sortLogs(finalLogs),
                                payments: currentProject.payments || prev.payments || [],
                                boqItems: currentProject.boqItems || prev.boqItems || [],
                                engineeringReports: currentProject.engineeringReports || prev.engineeringReports || [],
                                soilReport: currentProject.soilReportAnalysis || prev.soilReport,
                                rfis: currentProject.rfis || prev.rfis || [],
                                submittals: currentProject.submittals || prev.submittals || [],
                                correspondence: currentProject.correspondence || prev.correspondence || [],
                                checklists: currentProject.checklists || prev.checklists || [],
                                ncrs: currentProject.ncrs || prev.ncrs || []
                            };
                        });
                    }

                    // Also pull any direct updates from Google Sheets in background
                    if (navigator.onLine && !api.isGuest()) {
                        api.syncProjectFromGoogleSheets(projectId).then(synced => {
                            if (synced) {
                                setMasterData(prev => ({
                                    ...prev,
                                    fullDescription: synced.fullDescription || prev.fullDescription,
                                    logs: sortLogs(synced.executionLogs && synced.executionLogs.length > 0 ? synced.executionLogs : prev.logs)
                                }));
                            }
                        }).catch(() => {});
                    }
                } finally {
                    setLoading(false);
                    setIsRefreshing(false);
                }
            };
            load();

            if (!api.isGuest()) {
                const unsubscribe = api.subscribeToProject(projectId, (updatedProject) => {
                    if (isSavingRef.current) {
                        return;
                    }

                    setMasterData(prev => {
                        const incLogs = updatedProject.executionLogs;
                        const finalLogs = (incLogs && incLogs.length > 0) ? incLogs : prev.logs;
                        return {
                            ...prev,
                            fullDescription: updatedProject.fullDescription || prev.fullDescription,
                            logs: sortLogs(finalLogs),
                            payments: updatedProject.payments || [],
                            boqItems: updatedProject.boqItems || [],
                            engineeringReports: updatedProject.engineeringReports || prev.engineeringReports || [],
                            soilReport: updatedProject.soilReportAnalysis || prev.soilReport,
                            rfis: updatedProject.rfis || prev.rfis || [],
                            submittals: updatedProject.submittals || prev.submittals || [],
                            correspondence: updatedProject.correspondence || prev.correspondence || [],
                            checklists: updatedProject.checklists || prev.checklists || [],
                            ncrs: updatedProject.ncrs || prev.ncrs || []
                        };
                    });
                });
                return () => unsubscribe();
            }
        }
    }, [isOpen, projectId]);

    const triggerAutoSave = async (newData: any) => {
        if (!projectId) return;
        setAutoSaveStatus('saving');
        isSavingRef.current = true; 
        
        // Save to LocalStorage immediately as a local fallback draft
        const localStorageKey = `pmd_draft_${projectId}`;
        try {
            localStorage.setItem(localStorageKey, JSON.stringify({
                fullDescription: newData.fullDescription,
                payments: newData.payments,
                boqItems: newData.boqItems,
                engineeringReports: newData.engineeringReports,
                soilReport: newData.soilReport,
                rfis: newData.rfis,
                submittals: newData.submittals,
                correspondence: newData.correspondence,
                checklists: newData.checklists,
                ncrs: newData.ncrs
            }));
        } catch (e) {
            console.warn("Failed to save draft to localStorage", e);
        }
        
        try {
            await api.updateProjectMasterData(projectId, { 
                fullDescription: newData.fullDescription, 
                // Logs handled separately via api.addProjectLog / updateProjectLog
                // executionLogs: newData.logs, 
                payments: newData.payments, 
                boqItems: newData.boqItems, 
                engineeringReports: newData.engineeringReports, // Save new array
                soilReportAnalysis: newData.soilReport, // Legacy field sync
                // NEW FIELDS
                rfis: newData.rfis,
                submittals: newData.submittals,
                correspondence: newData.correspondence,
                checklists: newData.checklists,
                ncrs: newData.ncrs
            });
            setAutoSaveStatus('saved');
            setTimeout(() => setAutoSaveStatus('idle'), 2000);
        } catch (e) {
            setAutoSaveStatus('idle');
            console.error("Auto save failed", e);
        } finally {
            setTimeout(() => {
                isSavingRef.current = false;
            }, 5000);
        }
    };

    // Voice Input (Browser Native Speech Recognition)
    const startRecording = async (target: 'log' | 'payment') => { 
        setVoiceTarget(target); 
        const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (SpeechRec) {
            try {
                const recognition = new SpeechRec();
                recognition.lang = 'ar-EG';
                recognition.interimResults = false;
                recognition.maxAlternatives = 1;
                setIsRecording(true);
                recognition.onresult = (event: any) => {
                    const text = event.results[0][0].transcript;
                    if (target === 'log') {
                        setMasterData(prev => ({ ...prev, newLog: (prev.newLog ? prev.newLog + ' ' : '') + text }));
                    } else {
                        setMasterData(prev => ({ ...prev, newPaymentNote: (prev.newPaymentNote ? prev.newPaymentNote + ' ' : '') + text }));
                    }
                };
                recognition.onend = () => {
                    setIsRecording(false);
                };
                recognition.onerror = () => {
                    setIsRecording(false);
                };
                recognition.start();
                return;
            } catch (err) {}
        }
        alert("خاصية الإملاء الصوتي المباشر تعمل في المتصفحات الداعمة للتعرف على الصوت.");
    };
    
    const stopRecording = () => { setIsRecording(false); };

    // --- LOGS IMAGE HANDLING (OPEN / UNLIMITED IMAGES PER LOG) ---
    const handleLogImageSelect = async (e: React.ChangeEvent<HTMLInputElement>, isEdit: boolean = false) => { 
        const files = Array.from(e.target.files || []); 
        if (files.length === 0) return; 
        
        setIsUploadingImages(true); 
        const processedImages: string[] = [];

        try {
            for (const file of files) {
                // Compress: Resize to max 600px width, 0.4 quality for fast upload and storage
                const compressedFile = await imageUtils.compressImage(file, 0.4, 600);
                
                // Convert to Base64
                const reader = new FileReader();
                const base64Promise = new Promise<string>((resolve) => {
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.readAsDataURL(compressedFile);
                });
                const base64String = await base64Promise;
                
                if (base64String) {
                    processedImages.push(base64String);
                }
            }

            // Update state with all processed images (unlimited / open)
            if (isEdit) { 
                setTempEditLogImages(prev => [...prev, ...processedImages]); 
            } else { 
                setLogImages(prev => [...prev, ...processedImages]); 
            }

        } catch (error) {
            console.error("Image Processing Failed", error);
            alert("حدث خطأ أثناء معالجة الصور.");
        } finally {
            setIsUploadingImages(false);
            if (logImageInputRef.current) logImageInputRef.current.value = ''; 
            if (logCameraInputRef.current) logCameraInputRef.current.value = ''; 
            if (editLogImageInputRef.current) editLogImageInputRef.current.value = '';
            if (editLogCameraInputRef.current) editLogCameraInputRef.current.value = '';
            if (e.target) e.target.value = '';
        }
    };

    const addLog = async () => { 
        if (!masterData.newLog && logImages.length === 0) return; 
        
        // --- OPTIMISTIC UPDATE: UPDATE UI IMMEDIATELY ---
        const newLogItem: ProjectLog = { 
            id: `log_${Date.now()}`, 
            date: masterData.logDate || new Date().toISOString().split('T')[0], 
            content: masterData.newLog,
            images: logImages 
        };

        // 1. Update State First (Instant Feedback)
        // Sort descending so the new log appears at the top if date is today
        const updatedLogs = sortLogs([newLogItem, ...masterData.logs]);
        setMasterData(prev => ({ ...prev, logs: updatedLogs, newLog: '' }));
        setLogImages([]); 
        try {
            localStorage.setItem(`pmd_logs_${projectId}`, JSON.stringify(updatedLogs));
        } catch(e) {}
        
        // 2. Indicate Saving Background
        setAutoSaveStatus('saving');

        try {
            // 3. Send to Server in Background
            const saved = await api.addProjectLog(projectId, newLogItem);
            if (saved && saved.images && saved.images.length > 0) {
                setMasterData(prev => {
                    const synced = (prev.logs || []).map(l => l.id === newLogItem.id ? { ...l, images: saved.images } : l);
                    try { localStorage.setItem(`pmd_logs_${projectId}`, JSON.stringify(synced)); } catch(e) {}
                    return { ...prev, logs: synced };
                });
            }
            setAutoSaveStatus('saved');
        } catch (e) {
            console.error("Failed to add log", e);
            setAutoSaveStatus('idle');
            // Theoretically we should revert here, but for now we keep it optimistic 
            // as syncing logic usually retries.
        }
        
        setTimeout(() => setAutoSaveStatus('idle'), 2000);
    };

    // Helper to convert Base64 string or Drive URL to File object
    const base64ToFile = (base64String: string, filename: string): File | null => {
        try {
            const arr = base64String.split(',');
            if (arr.length < 2) return null;
            const mimeMatch = arr[0].match(/:(.*?);/);
            const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
            const bstr = atob(arr[1]);
            let n = bstr.length;
            const u8arr = new Uint8Array(n);
            while (n--) {
                u8arr[n] = bstr.charCodeAt(n);
            }
            return new File([u8arr], filename, { type: mime });
        } catch (e) {
            console.error("Error converting base64 to file", e);
            return null;
        }
    };

    const resolveLogImageToFile = async (imgStr: string, index: number): Promise<File | null> => {
        if (!imgStr) return null;
        const filename = `log_photo_${index + 1}.jpg`;
        if (imgStr.startsWith('data:')) {
            return base64ToFile(imgStr, filename);
        }
        let fileId = '';
        const matchLh3 = imgStr.match(/googleusercontent\.com\/d\/([a-zA-Z0-9_-]+)/);
        const matchDrive = imgStr.match(/\/d\/([a-zA-Z0-9_-]+)/);
        const matchId = imgStr.match(/id=([a-zA-Z0-9_-]+)/);
        if (matchLh3) fileId = matchLh3[1];
        else if (matchDrive) fileId = matchDrive[1];
        else if (matchId) fileId = matchId[1];
        else if (/^[a-zA-Z0-9_-]{20,}$/.test(imgStr.trim())) fileId = imgStr.trim();

        if (fileId) {
            try {
                const cachedBlob = await dbService.getBlob(fileId);
                if (cachedBlob) {
                    return new File([cachedBlob], filename, { type: cachedBlob.type || 'image/jpeg' });
                }
                const downloadedBlob = await api.downloadFile(fileId);
                if (downloadedBlob) {
                    return new File([downloadedBlob], filename, { type: downloadedBlob.type || 'image/jpeg' });
                }
            } catch (e) {}
        } else if (imgStr.startsWith('http://') || imgStr.startsWith('https://')) {
            try {
                const res = await fetch(imgStr);
                if (res.ok) {
                    const blob = await res.blob();
                    return new File([blob], filename, { type: blob.type || 'image/jpeg' });
                }
            } catch(e) {}
        }
        return null;
    };

    const shareLog = async (log: ProjectLog, mode: 'textWithImages' | 'cardImage' = 'textWithImages') => {
        const projectName = initialProjectData?.name || masterData.fullDescription || 'المشروع';
        let formattedText = `📌 *يومية مشروع: ${projectName}*\n📅 *التاريخ:* ${log.date}\n📝 *البيان:* ${log.content}`;

        if (mode === 'textWithImages') {
            const imageFiles: File[] = [];

            if (log.images && log.images.length > 0) {
                for (let i = 0; i < log.images.length; i++) {
                    const img = log.images[i];
                    const file = await resolveLogImageToFile(img, i);
                    if (file) {
                        imageFiles.push(file);
                    }
                }
            }

            // Native Web Share with Files (Direct WhatsApp/App share with text AND attached image files)
            if (navigator.canShare && imageFiles.length > 0 && navigator.canShare({ files: imageFiles })) {
                try {
                    await navigator.share({
                        title: `يومية مشروع: ${projectName}`,
                        text: formattedText,
                        files: imageFiles
                    });
                    return;
                } catch (error) {
                    console.log('Share with files canceled or failed', error);
                }
            } else if (navigator.share) {
                try {
                    await navigator.share({
                        title: `يومية مشروع: ${projectName}`,
                        text: formattedText
                    });
                    return;
                } catch (error) {
                    console.log('Share text canceled or failed', error);
                }
            }

            try {
                await navigator.clipboard.writeText(formattedText);
                alert('تم نسخ تفاصيل اليومية للحافظة. سيتم فتح الواتساب لمشاركتها.');
            } catch (e) {}
            window.open(`https://wa.me/?text=${encodeURIComponent(formattedText)}`, '_blank');
            return;
        }

        if (mode === 'cardImage') {
            const elementId = `log-card-${log.id}`;
            const element = document.getElementById(elementId);
            if (!element) return;

            try {
                const actionsDiv = element.querySelector('.log-actions-container');
                if (actionsDiv) actionsDiv.classList.add('hidden');
                
                const projectNameHeader = element.querySelector('.share-only-project-name');
                if (projectNameHeader) projectNameHeader.classList.remove('hidden');
                
                const canvas = await html2canvas(element, {
                    useCORS: true,
                    scale: 3,
                    backgroundColor: '#ffffff'
                });
                
                if (actionsDiv) actionsDiv.classList.remove('hidden');
                if (projectNameHeader) projectNameHeader.classList.add('hidden');

                canvas.toBlob(async (blob) => {
                    if (!blob) return;
                    
                    const file = new File([blob], `log_${log.date}.png`, { type: 'image/png' });
                    
                    if (navigator.canShare && navigator.canShare({ files: [file] })) {
                        try {
                            await navigator.share({
                                title: `يومية مشروع: ${projectName}`,
                                text: formattedText,
                                files: [file]
                            });
                            return;
                        } catch (error) {
                            console.log('Share canceled or failed', error);
                        }
                    }
                    
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `log_${log.date}.png`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    
                    alert('تم حفظ صورة بطاقة اليومية في جهازك.');
                    window.open(`https://wa.me/?text=${encodeURIComponent(formattedText)}`, '_blank');
                    
                }, 'image/png');
            } catch (error) {
                console.error("Error generating image:", error);
                alert("حدث خطأ أثناء تجهيز الصورة للمشاركة.");
            }
        }
    };

    const shareLogToWhatsApp = async (log: ProjectLog) => {
        await shareLog(log, 'textWithImages');
    };

    const analyzeSoilFile = async (file: Blob) => { 
        setIsAnalyzingSoil(true); 
        try { 
            const newReport: EngineeringReportItem = {
                id: `rep_${Date.now()}`,
                type: 'soil',
                title: `تقرير أبحاث التربة والجسات - ${new Date().toLocaleDateString('ar-EG')}`,
                content: `<div style="padding:16px; font-family:'Tajawal',sans-serif; direction:rtl; line-height:1.8;">
                    <h3 style="color:#1e3a8a; margin-top:0;">📋 تقرير فحص أبحاث التربة والجسات</h3>
                    <p>تم إرفاق مستند تقرير التربة بنجاح بتاريخ ${new Date().toLocaleDateString('ar-EG')}.</p>
                    <p>يرجى الرجوع للمرفق المعتمد من معمل ميكانيكا التربة للاطلاع على منسوب التأسيس والإجهاد المسموح به وتوصيات العزل وتصميم القواعد.</p>
                </div>`,
                date: new Date().toISOString()
            };
            
            const newData = { 
                ...masterData, 
                engineeringReports: [newReport, ...(masterData.engineeringReports || [])] 
            };
            
            setMasterData(newData); 
            triggerAutoSave(newData);
            alert("تم إرفاق تقرير التربة بنجاح.");
        } catch (e) { 
            alert("فشل إضافة تقرير التربة."); 
        } finally { 
            setIsAnalyzingSoil(false); 
        } 
    };

    const handleSoilAnalysis = async (e: React.ChangeEvent<HTMLInputElement>) => { 
        const file = e.target.files?.[0]; 
        if (!file) return; 
        await analyzeSoilFile(file); 
        if (soilReportInputRef.current) soilReportInputRef.current.value = '';
        if (soilCameraRef.current) soilCameraRef.current.value = '';
    };

    // --- LAZY LOADED LOGS & HELPERS ---
    const activeLogs = useMemo(() => {
        return (masterData.logs || []).filter(l => !l.isDeleted);
    }, [masterData.logs]);

    const visibleLogs = useMemo(() => {
        return activeLogs.slice(0, visibleLogsCount);
    }, [activeLogs, visibleLogsCount]);

    const handleLoadMoreLogs = () => {
        setVisibleLogsCount(prev => prev + 10);
    };

    const getCardColor = (index: number) => {
        const colors = [
            'bg-amber-50/80 border-amber-200/60 hover:border-amber-300',
            'bg-emerald-50/80 border-emerald-200/60 hover:border-emerald-300',
            'bg-sky-50/80 border-sky-200/60 hover:border-sky-300',
            'bg-indigo-50/80 border-indigo-200/60 hover:border-indigo-300',
            'bg-purple-50/80 border-purple-200/60 hover:border-purple-300',
            'bg-rose-50/80 border-rose-200/60 hover:border-rose-300',
        ];
        return colors[index % colors.length];
    };

    const saveEditLog = async (logId: string) => {
        const updatedLogs = masterData.logs.map(log => {
            if (log.id === logId) {
                return {
                    ...log,
                    content: tempEditLogContent,
                    date: tempEditLogDate,
                    images: tempEditLogImages
                };
            }
            return log;
        });

        setMasterData(prev => ({ ...prev, logs: updatedLogs }));
        setEditingLogId(null);
        try {
            localStorage.setItem(`pmd_logs_${projectId}`, JSON.stringify(updatedLogs));
        } catch(e) {}
        setAutoSaveStatus('saving');

        try {
            const editedLog = updatedLogs.find(l => l.id === logId);
            if (editedLog) {
                const saved = await api.updateProjectLog(projectId, editedLog);
                if (saved && saved.images && saved.images.length > 0) {
                    setMasterData(prev => {
                        const synced = (prev.logs || []).map(l => l.id === logId ? { ...l, images: saved.images } : l);
                        try { localStorage.setItem(`pmd_logs_${projectId}`, JSON.stringify(synced)); } catch(e) {}
                        return { ...prev, logs: synced };
                    });
                }
            }
            setAutoSaveStatus('saved');
        } catch (e) {
            console.error("Failed to update log", e);
            setAutoSaveStatus('idle');
        }
        setTimeout(() => setAutoSaveStatus('idle'), 2000);
    };

    const confirmDeleteLog = async () => {
        if (!logToDeleteId) return;
        const targetLog = masterData.logs.find(l => l.id === logToDeleteId);
        // Mark as deleted in state so it remains available in deleted records
        const updatedLogs = masterData.logs.map(l => l.id === logToDeleteId ? { ...l, isDeleted: true, status: 'محذوف', deletedAt: new Date().toISOString() } : l);
        setMasterData(prev => ({ ...prev, logs: updatedLogs }));
        setLogToDeleteId(null);
        try {
            localStorage.setItem(`pmd_logs_${projectId}`, JSON.stringify(updatedLogs));
        } catch(e) {}
        setAutoSaveStatus('saving');

        try {
            await api.deleteProjectLog(projectId, logToDeleteId, targetLog);
            setAutoSaveStatus('saved');
        } catch (e) {
            console.error("Failed to delete log", e);
            setAutoSaveStatus('idle');
        }
        setTimeout(() => setAutoSaveStatus('idle'), 2000);
    };

    const confirmDeleteItem = () => {
        if (!itemToDelete) return;
        const { type, id } = itemToDelete;
        const newData = { ...masterData };
        if (type === 'rfi') newData.rfis = (newData.rfis || []).filter(i => i.id !== id);
        else if (type === 'submittal') newData.submittals = (newData.submittals || []).filter(i => i.id !== id);
        else if (type === 'correspondence') newData.correspondence = (newData.correspondence || []).filter(i => i.id !== id);
        else if (type === 'checklist') newData.checklists = (newData.checklists || []).filter(i => i.id !== id);
        else if (type === 'ncr') newData.ncrs = (newData.ncrs || []).filter(i => i.id !== id);
        setMasterData(newData);
        triggerAutoSave(newData);
        setItemToDelete(null);
    };

    // --- SOURCE & FILE PICKER HANDLERS ---
    const handleSourceChoice = (source: 'camera' | 'device' | 'app') => {
        if (!sourceModal) return;
        const type = sourceModal.type;
        setSourceModal(null);

        if (source === 'camera') {
            if (type === 'log') logCameraInputRef.current?.click();
            else if (type === 'editLog') editLogCameraInputRef.current?.click();
            else if (type === 'payment') paymentCameraRef.current?.click();
            else if (type === 'boq') boqCameraRef.current?.click();
            else if (type === 'soil') soilCameraRef.current?.click();
        } else if (source === 'device') {
            if (type === 'log') logImageInputRef.current?.click();
            else if (type === 'editLog') editLogImageInputRef.current?.click();
            else if (type === 'payment') paymentFileRef.current?.click();
            else if (type === 'boq') boqImageRef.current?.click();
            else if (type === 'soil') soilReportInputRef.current?.click();
        } else if (source === 'app') {
            setPickerContext(type);
            setSelectedPickerItems(new Set());
            setPickerCurrentFolderId(projectId);
            setPickerBreadcrumbs([{ id: projectId, name: 'الرئيسية' }]);
            loadPickerFiles(projectId);
            setShowAppFilePicker(true);
        }
    };

    const loadPickerFiles = async (folderId: string) => {
        setLoadingPickerFiles(true);
        try {
            const files = await api.getFolderItems(folderId);
            setPickerItems(files || []);
        } catch (e) {
            console.error("Failed to load picker files", e);
            setPickerItems([]);
        } finally {
            setLoadingPickerFiles(false);
        }
    };

    const navigatePickerFolder = (folder: FileItem) => {
        setPickerCurrentFolderId(folder.id);
        setPickerBreadcrumbs(prev => [...prev, { id: folder.id, name: folder.name }]);
        loadPickerFiles(folder.id);
    };

    const navigatePickerBack = () => {
        if (pickerBreadcrumbs.length <= 1) return;
        const newCrumbs = pickerBreadcrumbs.slice(0, pickerBreadcrumbs.length - 1);
        const parentFolder = newCrumbs[newCrumbs.length - 1];
        setPickerBreadcrumbs(newCrumbs);
        setPickerCurrentFolderId(parentFolder.id);
        loadPickerFiles(parentFolder.id);
    };

    const togglePickerSelection = (id: string) => {
        setSelectedPickerItems(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const confirmPickerSelection = async () => {
        if (selectedPickerItems.size === 0) return;
        setIsProcessingPicker(true);
        try {
            const selectedFiles = pickerItems.filter(i => selectedPickerItems.has(i.id));
            const base64List: string[] = [];

            for (const fileItem of selectedFiles) {
                if (fileItem.previewUrl || fileItem.webContentLink) {
                    const src = fileItem.previewUrl || fileItem.webContentLink;
                    if (src) base64List.push(src);
                }
            }

            if (pickerContext === 'log') {
                setLogImages(prev => [...prev, ...base64List]);
            } else if (pickerContext === 'editLog') {
                setTempEditLogImages(prev => [...prev, ...base64List]);
            }

            setShowAppFilePicker(false);
            setSelectedPickerItems(new Set());
        } catch (e) {
            console.error("Error confirming picker selection", e);
            alert("حدث خطأ أثناء تحميل الملفات المختارة.");
        } finally {
            setIsProcessingPicker(false);
        }
    };

    const handleManualSyncFromSheets = async () => {
        setIsRefreshing(true);
        try {
            const synced = await api.syncProjectFromGoogleSheets(projectId);
            if (synced) {
                setMasterData(prev => ({
                    ...prev,
                    fullDescription: synced.fullDescription || prev.fullDescription,
                    logs: sortLogs(synced.executionLogs && synced.executionLogs.length > 0 ? synced.executionLogs : prev.logs)
                }));
                const logsKey = `pmd_logs_${projectId}`;
                try { localStorage.setItem(logsKey, JSON.stringify(synced.executionLogs || [])); } catch(e) {}
            }
        } catch(e) {
            console.warn("Manual sync error:", e);
        } finally {
            setIsRefreshing(false);
        }
    };

    const handleOpenSheet = async () => {
        try {
            const url = await api.getSpreadsheetUrl(projectId);
            if (url) {
                window.open(url, '_blank', 'noopener,noreferrer');
            } else {
                alert("جاري تجهيز قاعدة بيانات الحافظة على Google Sheets...");
                const currentProject = await api.getProjectById(projectId);
                if (currentProject) {
                    await api.syncProjectFromGoogleSheets(projectId);
                    const newUrl = await api.getSpreadsheetUrl(projectId);
                    if (newUrl) window.open(newUrl, '_blank', 'noopener,noreferrer');
                }
            }
        } catch (e) {
            console.warn("Could not open spreadsheet", e);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/50 z-[1500] flex items-center justify-center backdrop-blur-sm animate-fade-in">
            <div className="bg-white w-full h-full md:w-[98vw] md:h-[95vh] md:rounded-3xl shadow-2xl flex flex-col animate-scale-in overflow-hidden relative">
                
                {/* Full Screen Image View */}
                {selectedFullScreenImage && (
                    <FullScreenLogModal 
                        src={selectedFullScreenImage} 
                        onClose={() => setSelectedFullScreenImage(null)} 
                    />
                )}

                {/* Header */}
                <div className="p-3 bg-slate-900 flex justify-between items-center text-white shrink-0 relative z-[1601]">
                    <h3 className="font-bold flex items-center gap-2 text-xs"> <i className="fa-solid fa-clipboard-list text-yellow-400 text-sm"></i> سجل الحافظة </h3>
                    <div className="flex items-center gap-2.5">
                        {/* Background Refresh Indicator (Subtle) */}
                        {isRefreshing && !loading && (
                            <span className="text-[9px] text-blue-300 font-bold animate-pulse flex items-center gap-1">
                                <i className="fa-solid fa-circle-notch fa-spin"></i> جاري التحديث
                            </span>
                        )}
                        
                        {autoSaveStatus !== 'idle' && <span className={`text-[10px] font-bold px-2 py-0.5 rounded transition-all ${autoSaveStatus === 'saving' ? 'text-yellow-300 animate-pulse' : 'text-green-400'}`}>{autoSaveStatus === 'saving' ? 'جاري الحفظ...' : 'تم الحفظ ✔'}</span>}
                        <div className="flex gap-2">
                            <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition transform active:scale-90" title="إغلاق"><i className="fa-solid fa-times text-sm"></i></button>
                        </div>
                    </div>
                </div>

                {/* Content */}
                {/* REMOVED min-h-0 and added custom-scrollbar and webkit scrolling for better mobile touch */}
                <div className="flex-1 overflow-y-auto p-1 bg-slate-50 relative custom-scrollbar enlarged-tabs" style={{ WebkitOverflowScrolling: 'touch' }}>
                    {/* ... (Hidden Inputs) ... */}
                    <input type="file" ref={logImageInputRef} onChange={(e) => handleLogImageSelect(e, false)} accept="image/*" multiple className="hidden" />
                    <input type="file" ref={logCameraInputRef} onChange={(e) => handleLogImageSelect(e, false)} accept="image/*" capture="environment" className="hidden" />
                    <input type="file" ref={editLogImageInputRef} onChange={(e) => handleLogImageSelect(e, true)} accept="image/*" multiple className="hidden" />
                    <input type="file" ref={editLogCameraInputRef} onChange={(e) => handleLogImageSelect(e, true)} accept="image/*" capture="environment" className="hidden" />
                    {/* Payment Inputs moved to PaymentsTab */}
                    {/* BOQ Image input moved to BoqTab */}
                    {/* BOQ Camera input moved to BoqTab */}
                    <input type="file" ref={soilReportInputRef} onChange={handleSoilAnalysis} accept="image/*,application/pdf" className="hidden" />
                    <input type="file" ref={soilCameraRef} onChange={handleSoilAnalysis} accept="image/*" capture="environment" className="hidden" />

                    {activeTab === 'logs' && (
                        <div className="flex flex-col gap-2 pb-20">
                            {/* Add New Log Box */}
                            <div className="bg-white rounded-xl p-2 border border-blue-100 shadow-sm shrink-0">
                                <div className="flex gap-2 items-center mb-2">
                                    <input type="date" className="bg-white border border-blue-200 text-xs rounded-lg px-2 py-1.5 outline-none text-slate-700 font-bold w-24" value={masterData.logDate} onChange={(e) => setMasterData({...masterData, logDate: e.target.value})} />
                                    <div className="flex-1"></div>
                                    <button onClick={() => setSourceModal({ type: 'log', title: 'رفع صورة لليومية' })} className="bg-white border border-blue-200 text-blue-700 px-3 h-8 rounded-lg text-[10px] font-bold hover:bg-blue-50 transition flex items-center justify-center shadow-sm gap-1 shrink-0">
                                        <i className="fa-solid fa-camera"></i>
                                    </button>
                                    <button onClick={addLog} disabled={isUploadingImages} className="bg-blue-600 text-white px-3 h-8 rounded-lg text-[10px] font-bold hover:bg-blue-700 transition flex items-center justify-center shadow-sm gap-1 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed">
                                        {isUploadingImages ? <i className="fa-solid fa-circle-notch fa-spin"></i> : <i className="fa-solid fa-plus"></i>} 
                                        <span>إضافة</span>
                                    </button>
                                </div>
                                {isUploadingImages && (
                                    <div className="mb-2 text-xs text-blue-600 font-bold flex items-center gap-2 bg-blue-50 p-2 rounded-lg">
                                        <i className="fa-solid fa-gear fa-spin"></i> جاري ضغط الصور وتجهيزها للحفظ...
                                    </div>
                                )}
                                {logImages.length > 0 && (
                                    <div className="flex gap-2 flex-wrap max-h-36 overflow-y-auto py-1 mb-2 bg-slate-50 p-1.5 rounded-lg border border-blue-100">
                                        {logImages.map((img, idx) => (
                                            <div key={idx} className="relative w-12 h-12 shrink-0 rounded-lg">
                                                <img src={img} alt="" className="w-full h-full object-cover rounded-lg border border-blue-200" />
                                                <button 
                                                    type="button"
                                                    onClick={() => setLogImages(prev => prev.filter((_, i) => i !== idx))} 
                                                    className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center text-[8px] shadow-sm cursor-pointer z-10"
                                                >
                                                    <i className="fa-solid fa-times"></i>
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <textarea className="w-full p-2 text-xs rounded-lg border border-blue-200 outline-none focus:ring-2 focus:ring-blue-500 transition text-slate-900 resize-y min-h-[60px]" placeholder="ماذا تم إنجازه؟" value={masterData.newLog} onChange={(e) => setMasterData({...masterData, newLog: e.target.value})} rows={2} />
                            </div>
                            
                            <div className="space-y-2 pr-1">
                                {visibleLogs.map((log, idx) => (
                                    <div key={log.id} className="relative group">
                                        {editingLogId === log.id ? (
                                            <div className="bg-blue-50/90 p-2.5 rounded-xl border-2 border-blue-300 shadow-md">
                                                <input type="date" className="w-full p-2 text-xs bg-white border border-blue-200 rounded-lg mb-2 font-bold text-slate-700 outline-none" value={tempEditLogDate} onChange={(e) => setTempEditLogDate(e.target.value)} />
                                                <textarea className="w-full p-2 text-xs bg-white border border-blue-200 rounded-lg mb-2 min-h-[80px] outline-none focus:ring-1 focus:ring-blue-500 font-medium" value={tempEditLogContent} onChange={(e) => setTempEditLogContent(e.target.value)} />
                                                
                                                {/* Thumbnails Container */}
                                                {tempEditLogImages.length > 0 && (
                                                    <div className="mb-2.5">
                                                        <div className="text-[10px] font-bold text-slate-600 mb-1 flex items-center justify-between">
                                                            <span>صور اليومية المرفقة ({tempEditLogImages.length}):</span>
                                                            <span className="text-[9px] text-blue-600 font-normal">اضغط للتكبير، أو × للحذف</span>
                                                        </div>
                                                        <div className="flex gap-2 flex-wrap max-h-48 overflow-y-auto p-1.5 bg-white rounded-lg border border-blue-200/80 shadow-2xs">
                                                            {tempEditLogImages.map((img, i) => (
                                                                <div key={i} className="relative w-14 h-14 sm:w-16 sm:h-16 shrink-0 rounded-lg group">
                                                                    <LogThumbnail 
                                                                        src={img} 
                                                                        onClick={(resolved) => setSelectedFullScreenImage(resolved)} 
                                                                        isThumbnail={true} 
                                                                    />
                                                                    <button 
                                                                        type="button"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setTempEditLogImages(prev => prev.filter((_, idx) => idx !== i));
                                                                        }} 
                                                                        className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-600 hover:bg-red-700 text-white rounded-full flex items-center justify-center text-[10px] shadow-sm z-20 cursor-pointer transition active:scale-90"
                                                                        title="حذف الصورة"
                                                                    >
                                                                        <i className="fa-solid fa-times"></i>
                                                                    </button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Action Bar */}
                                                <div className="flex justify-between items-center pt-2 border-t border-blue-200/60 mt-1">
                                                    <button 
                                                        type="button"
                                                        onClick={() => setSourceModal({ type: 'editLog', title: 'إضافة صورة' })} 
                                                        className="text-[11px] text-blue-700 bg-blue-100 hover:bg-blue-200 active:bg-blue-300 px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
                                                    >
                                                        <i className="fa-solid fa-camera text-blue-600 text-xs"></i>
                                                        <span>إضافة صورة</span>
                                                        {tempEditLogImages.length > 0 && (
                                                            <span className="bg-blue-600 text-white text-[9px] px-1.5 py-0.2 rounded-full font-bold">
                                                                {tempEditLogImages.length}
                                                            </span>
                                                        )}
                                                    </button>
                                                    <div className="flex gap-2">
                                                        <button 
                                                            type="button"
                                                            onClick={() => saveEditLog(log.id)} 
                                                            className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-1.5 rounded-lg font-bold transition shadow-xs cursor-pointer active:scale-95"
                                                        >
                                                            حفظ
                                                        </button>
                                                        <button 
                                                            type="button"
                                                            onClick={() => setEditingLogId(null)} 
                                                            className="text-xs bg-white border border-slate-300 hover:bg-slate-100 px-3 py-1.5 rounded-lg font-bold text-slate-700 transition cursor-pointer"
                                                        >
                                                            إلغاء
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div 
                                                id={`log-card-${log.id}`} 
                                                className={`p-3 rounded-2xl shadow-sm border-4 hover:shadow-md transition relative flex flex-col gap-2 ${getCardColor(idx)}`}
                                            >
                                                {/* Hidden project name for sharing */}
                                                <div className="hidden share-only-project-name flex items-center gap-2 mb-2 pb-3 border-b-2 border-black/10 mt-[-5px]">
                                                    <i className="fa-solid fa-building text-blue-600 text-lg"></i>
                                                    <span className="text-lg font-bold text-slate-800 leading-none mt-[-6px]">مشروع: {initialProjectData?.name || 'بدون اسم'}</span>
                                                </div>
                                                <div className="flex justify-between items-center border-b border-black/5 pb-2">
                                                    <div className="flex items-center gap-2 mt-[-2px]">
                                                        <div className="w-8 h-8 rounded-full bg-white/50 text-slate-700 flex items-center justify-center shadow-sm">
                                                            <i className="fa-solid fa-calendar-day text-xs"></i>
                                                        </div>
                                                        <span className="font-bold text-slate-800 bg-white/50 border-black/5 text-base font-mono px-3 h-8 flex items-center justify-center rounded border leading-none pb-1.5">
                                                            {log.date}
                                                        </span>
                                                    </div>
                                                    <div className="flex gap-1.5 items-center log-actions-container">
                                                        <button onClick={() => shareLog(log, 'textWithImages')} className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition flex items-center justify-center" title="مشاركة اليومية (رسالة وصور)">
                                                            <i className="fa-solid fa-share-nodes text-[11px]"></i>
                                                        </button>
                                                        <button onClick={() => shareLog(log, 'cardImage')} className="w-7 h-7 rounded-lg bg-white/70 text-slate-700 hover:text-blue-600 border border-slate-200 transition flex items-center justify-center" title="مشاركة اليومية كبطاقة مصورة">
                                                            <i className="fa-solid fa-image text-[11px]"></i>
                                                        </button>
                                                        <button onClick={() => { setEditingLogId(log.id); setTempEditLogContent(log.content); setTempEditLogDate(log.date); setTempEditLogImages(log.images || []); }} className="w-7 h-7 rounded-lg bg-white/70 text-slate-700 hover:text-blue-600 border border-slate-200 transition flex items-center justify-center" title="تعديل"><i className="fa-solid fa-pen text-[10px]"></i></button>
                                                        <button onClick={() => setLogToDeleteId(log.id)} className="w-7 h-7 rounded-lg bg-white/70 text-slate-700 hover:text-red-600 border border-slate-200 transition flex items-center justify-center" title="حذف"><i className="fa-solid fa-trash text-[10px]"></i></button>
                                                    </div>
                                                </div>
                                                <p className="text-slate-900 text-lg leading-normal font-bold whitespace-pre-wrap mt-[-4px]">
                                                    {log.content}
                                                </p>
                                                {/* FULL-LENGTH IMAGES: Display all photos in full length with responsive grid and zoom on click */}
                                                {log.images && log.images.length > 0 && (
                                                    <div className={`grid gap-2 mt-1.5 w-full ${
                                                        log.images.length === 1 ? 'grid-cols-1' : 
                                                        log.images.length === 2 ? 'grid-cols-2' : 
                                                        log.images.length === 3 ? 'grid-cols-3' : 
                                                        'grid-cols-2 sm:grid-cols-3 md:grid-cols-4'
                                                    }`}>
                                                        {log.images.map((img, i) => (
                                                            <LogThumbnail 
                                                                key={i} 
                                                                src={img} 
                                                                isFullLength={true}
                                                                onClick={(resolved) => setSelectedFullScreenImage(resolved)}
                                                            />
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                                
                                {/* Show More Button */}
                                {visibleLogsCount < activeLogs.length && (
                                    <button 
                                        onClick={handleLoadMoreLogs}
                                        className="w-full py-2 bg-slate-100 text-slate-600 rounded-xl font-bold text-xs hover:bg-slate-200 transition shadow-sm mt-2"
                                    >
                                        عرض المزيد ({activeLogs.length - visibleLogsCount} سجل متبقي)
                                    </button>
                                )}

                                {activeLogs.length === 0 && (
                                    <div className="text-center py-10 text-slate-400 text-xs">
                                        لا توجد سجلات يومية حالياً.
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'payments' && (
                        <PaymentsTab
                            projectId={projectId}
                            masterData={masterData}
                            setMasterData={setMasterData}
                            triggerAutoSave={triggerAutoSave}
                            isRecording={isRecording}
                            voiceTarget={voiceTarget}
                            startRecording={startRecording}
                            stopRecording={stopRecording}
                            onUploadClick={() => setSourceModal({ type: 'payment', title: 'رفع مستخلص' })}
                            paymentFileRef={paymentFileRef}
                            paymentCameraRef={paymentCameraRef}
                        />
                    )}

                    {activeTab === 'boq' && (
                        <BoqTab
                            projectId={projectId}
                            masterData={masterData}
                            setMasterData={setMasterData}
                            triggerAutoSave={triggerAutoSave}
                            boqImageRef={boqImageRef}
                            boqCameraRef={boqCameraRef}
                            onUploadClick={() => setSourceModal({ type: 'boq', title: 'رفع المقايسة' })}
                        />
                    )}

                    {activeTab === 'soil' && (
                        <EngineeringReportsTab
                            projectId={projectId}
                            masterData={masterData}
                            setMasterData={setMasterData}
                            triggerAutoSave={triggerAutoSave}
                            isAnalyzingSoil={isAnalyzingSoil}
                            onAddReportClick={() => setSourceModal({ type: 'soil', title: 'رفع تقرير هندسي جديد' })}
                        />
                    )}

                    {/* --- MODALS FOR DCS & QHSE REMOVED --- */}
                </div>

                {/* Footer REMOVED */}

                {/* Confirm Delete Log Modal */}
                <ConfirmModal 
                    isOpen={!!logToDeleteId}
                    title="حذف اليومية"
                    message="هل أنت متأكد من حذف هذا السجل؟"
                    onConfirm={confirmDeleteLog}
                    onCancel={() => setLogToDeleteId(null)}
                    type="danger"
                />

                {/* Confirm Delete Document Modal */}
                <ConfirmModal 
                    isOpen={!!itemToDelete}
                    title="حذف المستند"
                    message="هل أنت متأكد من حذف هذا المستند؟ لا يمكن التراجع عن هذا الإجراء."
                    onConfirm={confirmDeleteItem}
                    onCancel={() => setItemToDelete(null)}
                    type="danger"
                />

                {/* Report Modal */}
                <ProjectReportModal
                    isOpen={showReportModal}
                    onClose={() => setShowReportModal(false)}
                    project={initialProjectData || null}
                    onGenerate={handleGenerateReport}
                    isGenerating={isGeneratingReport}
                />

                {/* ... (Modals remain unchanged) ... */}
                {sourceModal && (
                    <div className="fixed inset-0 z-[1600] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
                        <div className="bg-white w-full max-w-xs rounded-2xl shadow-2xl p-4 animate-scale-in border border-slate-200 text-center">
                            <h3 className="text-slate-800 font-bold mb-4 text-sm">{sourceModal.title}</h3>
                            <div className="grid grid-cols-1 gap-2">
                                <button onClick={() => handleSourceChoice('camera')} className="bg-blue-50 text-blue-700 p-3 rounded-xl hover:bg-blue-100 transition flex items-center justify-center gap-2 font-bold text-xs border border-blue-100">
                                    <i className="fa-solid fa-camera"></i> التقاط صورة (الكاميرا)
                                </button>
                                <button onClick={() => handleSourceChoice('device')} className="bg-slate-50 text-slate-700 p-3 rounded-xl hover:bg-slate-100 transition flex items-center justify-center gap-2 font-bold text-xs border border-slate-200">
                                    <i className="fa-regular fa-image"></i> من معرض الجهاز
                                </button>
                                <button onClick={() => handleSourceChoice('app')} className="bg-indigo-50 text-indigo-700 p-3 rounded-xl hover:bg-indigo-100 transition flex items-center justify-center gap-2 font-bold text-xs border border-indigo-200">
                                    <i className="fa-solid fa-folder-open"></i> من ملفات المشروع
                                </button>
                            </div>
                            <button onClick={() => setSourceModal(null)} className="mt-4 text-slate-400 text-xs font-bold hover:text-red-500">إلغاء</button>
                        </div>
                    </div>
                )}

                {/* App File Picker Modal */}
                {showAppFilePicker && (
                    <div className="fixed inset-0 z-[1700] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
                        {/* ... (Keep existing App Picker) ... */}
                        <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl flex flex-col max-h-[80vh] animate-scale-in border border-slate-200 overflow-hidden">
                            <div className="p-3 bg-slate-100 border-b border-slate-200 flex justify-between items-center shrink-0">
                                <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm"><i className="fa-solid fa-folder-tree text-orange-500"></i> اختر صور من المشروع</h3>
                                <button onClick={() => setShowAppFilePicker(false)} className="w-8 h-8 rounded-full hover:bg-slate-200 flex items-center justify-center text-slate-500 transition"><i className="fa-solid fa-times"></i></button>
                            </div>
                            <div className="px-3 py-2 bg-white border-b border-slate-100 flex items-center gap-1 overflow-x-auto text-xs whitespace-nowrap">
                                {pickerBreadcrumbs.length > 1 && <button onClick={navigatePickerBack} className="w-6 h-6 flex items-center justify-center bg-slate-100 rounded-full hover:bg-slate-200 mr-1"><i className="fa-solid fa-arrow-right text-[10px] text-slate-600"></i></button>}
                                {pickerBreadcrumbs.map((crumb, idx) => (<div key={crumb.id} className="flex items-center">{idx > 0 && <span className="text-slate-300 mx-1">/</span>}<span className={`font-bold ${idx === pickerBreadcrumbs.length - 1 ? 'text-orange-600' : 'text-slate-500'}`}>{crumb.name}</span></div>))}
                            </div>
                            <div className="flex-1 overflow-y-auto p-2 bg-slate-50">
                                {loadingPickerFiles ? <div className="text-center py-10"><div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div><p className="text-xs text-slate-400">جاري التحميل...</p></div> : pickerItems.length === 0 ? <div className="text-center py-10 text-slate-400"><i className="fa-solid fa-folder-open text-3xl mb-2 opacity-30"></i><p className="text-xs font-bold">فارغ</p></div> : (
                                    <div className="space-y-1">
                                        {pickerItems.map(item => {
                                            const isFolder = item.type === ItemType.FOLDER;
                                            const isSelected = selectedPickerItems.has(item.id);
                                            // Filter logic if needed
                                            if (!isFolder && pickerContext !== 'soil' && !item.mimeType?.match(/(image|pdf|text|word)/)) return null;
                                            
                                            return (
                                                <div key={item.id} onClick={() => isFolder ? navigatePickerFolder(item) : togglePickerSelection(item.id)} className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer border transition ${isFolder ? 'bg-white border-slate-100 hover:bg-yellow-50' : isSelected ? 'bg-blue-50 border-blue-300' : 'bg-white border-transparent hover:bg-slate-50'}`}>
                                                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${isFolder ? 'bg-yellow-100 text-yellow-600' : 'bg-slate-100 text-slate-500 overflow-hidden'}`}>
                                                        {isFolder ? <i className="fa-solid fa-folder text-sm"></i> : item.previewUrl ? <img src={item.previewUrl} alt="" className="w-full h-full object-cover" /> : <i className="fa-solid fa-image text-sm"></i>}
                                                    </div>
                                                    <div className="flex-1 min-w-0"><h4 className={`text-xs font-bold truncate ${isSelected ? 'text-blue-800' : 'text-slate-700'}`}>{item.name}</h4></div>
                                                    {isFolder ? <i className="fa-solid fa-chevron-left text-slate-300 text-xs"></i> : <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition ${isSelected ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300'}`}><i className="fa-solid fa-check text-[10px]"></i></div>}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                            <div className="p-3 bg-white border-t border-slate-200 shrink-0">
                                <button onClick={confirmPickerSelection} disabled={selectedPickerItems.size === 0 || isProcessingPicker} className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition shadow-lg flex items-center justify-center gap-2 disabled:opacity-50">{isProcessingPicker ? <i className="fa-solid fa-circle-notch fa-spin"></i> : <i className="fa-solid fa-check-double"></i>} {isProcessingPicker ? 'جاري التحميل...' : `إضافة ${selectedPickerItems.size} ملفات`}</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
