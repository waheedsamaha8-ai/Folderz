import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EngineeringReportItem } from '../types';

interface EngineeringReportsTabProps {
    projectId: string;
    masterData: {
        soilReport: string;
        engineeringReports: EngineeringReportItem[];
    };
    setMasterData: React.Dispatch<React.SetStateAction<any>>;
    triggerAutoSave: (newData: any) => Promise<void>;
    isAnalyzingSoil: boolean;
    onAddReportClick: () => void;
}

export default function EngineeringReportsTab({
    projectId,
    masterData,
    setMasterData,
    triggerAutoSave,
    isAnalyzingSoil,
    onAddReportClick
}: EngineeringReportsTabProps) {
    const navigate = useNavigate();

    // Local state for reports
    const [selectedReport, setSelectedReport] = useState<EngineeringReportItem | null>(null);
    const [renamingReportId, setRenamingReportId] = useState<string | null>(null);
    const [tempReportTitle, setTempReportTitle] = useState('');
    const [reportToDeleteId, setReportToDeleteId] = useState<string | null>(null);

    // View Full Screen
    const openReportFullScreen = (report: EngineeringReportItem) => {
        if (renamingReportId === report.id) return;
        setSelectedReport(report);
    };

    // Edit as Letter (Navigate to Editor)
    const handleEditReport = (report: EngineeringReportItem) => {
        navigate(`/editor/${projectId}/${projectId}`, { 
            state: { 
                initialContent: report.content,
                filename: report.title,
                returnToMasterData: true
            } 
        });
    };

    // Start Rename
    const handleStartRenameReport = (e: React.MouseEvent, report: EngineeringReportItem) => {
        e.stopPropagation();
        setRenamingReportId(report.id);
        setTempReportTitle(report.title);
    };

    // Save Rename
    const saveReportRename = (e: React.MouseEvent, reportId: string) => {
        e.stopPropagation();
        if (!tempReportTitle.trim()) return;
        const newData = {
            ...masterData,
            engineeringReports: masterData.engineeringReports.map(r => 
                r.id === reportId ? { ...r, title: tempReportTitle } : r
            )
        };
        setMasterData(newData);
        setRenamingReportId(null);
        triggerAutoSave(newData);
    };

    // Confirm Delete Report
    const confirmDeleteReport = () => {
        if (!reportToDeleteId) return;
        const newData = {
            ...masterData,
            engineeringReports: masterData.engineeringReports.filter(r => r.id !== reportToDeleteId)
        };
        setMasterData(newData);
        setReportToDeleteId(null);
        triggerAutoSave(newData);
    };

    return (
        <div className="p-0 pb-20 flex flex-col h-full relative" id="engineering-reports-tab">
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 flex justify-between items-center shrink-0 mb-3 mx-1 mt-1 sticky top-0 z-20 shadow-sm" id="reports-tab-header">
                <div>
                    <h4 className="font-bold text-orange-900 text-sm flex items-center gap-2">
                        <i className="fa-solid fa-microscope text-orange-500"></i>
                        تقارير 
                    </h4>
                    <p className="text-[8px] text-orange-700 opacity-80">جسات - اختبارات  - تقارير </p>
                </div>
                <button 
                    onClick={onAddReportClick} 
                    disabled={isAnalyzingSoil} 
                    className="bg-orange-600 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg hover:bg-orange-700 transition flex items-center gap-2 disabled:opacity-50"
                    id="analyze-report-btn"
                >
                    {isAnalyzingSoil ? <i className="fa-solid fa-circle-notch fa-spin"></i> : <i className="fa-solid fa-plus"></i>} 
                    تحليل
                </button>
            </div>
            
            {/* Reports Grid */}
            <div className="flex-1 overflow-y-auto px-1" id="reports-grid-container">
                {masterData.engineeringReports.length === 0 && !masterData.soilReport ? (
                    <div className="flex flex-col items-center justify-center h-64 text-slate-400 opacity-60" id="no-reports-fallback">
                        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-3">
                            <i className="fa-solid fa-layer-group text-2xl"></i>
                        </div>
                        <p className="text-sm font-bold">لا توجد تقارير محفوظة</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" id="reports-grid">
                        {/* Backward Compatibility: Show Old Single Soil Report if exists and not in array */}
                        {masterData.soilReport && !masterData.engineeringReports.some(r => r.type === 'soil' && r.content === masterData.soilReport) && (
                            <div 
                                className="bg-white p-4 rounded-2xl shadow-sm border border-orange-100 hover:shadow-md transition cursor-pointer group relative overflow-hidden" 
                                onClick={() => openReportFullScreen({id: 'legacy', type: 'soil', title: 'تقرير الجسات الأساسي', content: masterData.soilReport, date: new Date().toISOString()})}
                                id="legacy-soil-report-card"
                            >
                                <div className="absolute top-0 right-0 w-16 h-16 bg-orange-50 rounded-bl-full -mr-8 -mt-8 z-0"></div>
                                <div className="relative z-10">
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center text-lg font-bold"><i className="fa-solid fa-file-contract"></i></div>
                                        <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-bold">قديم</span>
                                    </div>
                                    <h3 className="font-bold text-slate-800 text-sm mb-1">تقرير الجسات الأساسي</h3>
                                    <p className="text-[10px] text-slate-400 line-clamp-2">التقرير المحفوظ سابقاً في بيانات المشروع.</p>
                                </div>
                            </div>
                        )}

                        {masterData.engineeringReports.map((report) => (
                            <div 
                                key={report.id} 
                                onClick={() => openReportFullScreen(report)}
                                className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 hover:border-blue-300 hover:shadow-md transition cursor-pointer group relative overflow-hidden font-sans"
                                id={`report-card-${report.id}`}
                            >
                                <div className="flex justify-between items-start mb-3">
                                    {/* Report Icon & Date */}
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold shrink-0 ${report.type === 'soil' ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600'}`}>
                                        <i className={`fa-solid ${report.type === 'soil' ? 'fa-mountain-sun' : 'fa-flask'}`}></i>
                                    </div>
                                    
                                    {/* Actions or Edit Mode */}
                                    {renamingReportId === report.id ? (
                                        <div className="flex items-center gap-2 flex-1 mr-3" onClick={(e) => e.stopPropagation()} id={`rename-container-${report.id}`}>
                                            <input 
                                                type="text" 
                                                value={tempReportTitle} 
                                                onChange={(e) => setTempReportTitle(e.target.value)} 
                                                className="w-full p-1 border border-blue-300 rounded text-xs font-bold"
                                                autoFocus
                                            />
                                            <button 
                                                onClick={(e) => saveReportRename(e, report.id)}
                                                className="w-6 h-6 bg-green-500 text-white rounded flex items-center justify-center shrink-0"
                                                id={`save-rename-btn-${report.id}`}
                                            >
                                                <i className="fa-solid fa-check text-[10px]"></i>
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-1" id={`report-actions-${report.id}`}>
                                            <button 
                                                onClick={(e) => handleStartRenameReport(e, report)}
                                                className="w-7 h-7 rounded-full hover:bg-blue-50 text-slate-300 hover:text-blue-600 flex items-center justify-center transition border border-transparent hover:border-blue-100"
                                                title="تعديل العنوان"
                                                id={`start-rename-btn-${report.id}`}
                                            >
                                                <i className="fa-solid fa-pen text-[10px]"></i>
                                            </button>
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); setReportToDeleteId(report.id); }}
                                                className="w-7 h-7 rounded-full hover:bg-red-50 text-slate-300 hover:text-red-500 flex items-center justify-center transition border border-transparent hover:border-red-100"
                                                title="حذف التقرير"
                                                id={`trigger-delete-btn-${report.id}`}
                                            >
                                                <i className="fa-solid fa-trash text-[10px]"></i>
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* Report Title */}
                                {renamingReportId !== report.id && (
                                    <h3 className="font-bold text-slate-800 text-sm mb-1 line-clamp-1" id={`report-title-${report.id}`}>{report.title}</h3>
                                )}
                                
                                <p className="text-[10px] text-slate-500 line-clamp-2 leading-relaxed" id={`report-summary-${report.id}`}>
                                    {report.summary || "انقر لعرض التفاصيل الكاملة للتقرير والتحليل الهندسي..."}
                                </p>
                                
                                <div className="mt-3 pt-2 border-t border-slate-50 flex justify-between items-center" id={`report-footer-${report.id}`}>
                                    <span className="text-[9px] text-slate-400 font-mono">{new Date(report.date).toLocaleDateString('ar-EG')}</span>
                                    <span className="text-[10px] font-bold text-blue-600 group-hover:underline flex items-center gap-1">عرض التفاصيل <i className="fa-solid fa-arrow-left"></i></span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Full Screen Report Overlay */}
            {selectedReport && (
                <div className="fixed inset-0 z-[1700] bg-white animate-scale-in flex flex-col" id="report-fullscreen-overlay">
                    <div className="bg-slate-900 text-white p-4 flex justify-between items-center shadow-md shrink-0">
                        <div className="flex items-center gap-3">
                            <button onClick={() => setSelectedReport(null)} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition" id="close-overlay-btn"><i className="fa-solid fa-arrow-right rtl:rotate-180"></i></button>
                            <h3 className="font-bold text-sm sm:text-base truncate max-w-[200px] sm:max-w-md" id="overlay-title">{selectedReport.title}</h3>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => handleEditReport(selectedReport)} className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-sm flex items-center gap-2" id="edit-overlay-as-letter-btn">
                                <i className="fa-solid fa-pen-to-square"></i> <span className="hidden sm:inline">تعديل كخطاب</span>
                            </button>
                        </div>
                    </div>
                    {/* UPDATED: FULL WIDTH CONTAINER WITH DYNAMIC TABLE STYLES */}
                    <div className="flex-1 overflow-y-auto bg-white p-0" id="overlay-body">
                        <div className="w-full min-h-full p-0 md:p-4">
                            <style>{`
                                .report-content table { width: 100% !important; display: table !important; table-layout: auto !important; }
                                .report-content td, .report-content th { word-wrap: break-word; white-space: normal !important; overflow-wrap: break-word; max-width: 100%; }
                                .report-content img { max-width: 100% !important; height: auto !important; }
                            `}</style>
                            <div 
                                className="prose prose-sm max-w-none text-slate-800 leading-relaxed w-full report-content px-4 py-6"
                                dangerouslySetInnerHTML={{ __html: selectedReport.content }}
                                id="overlay-report-content"
                            ></div>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation */}
            {reportToDeleteId && (
                <div className="fixed inset-0 z-[1800] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4" id="report-delete-confirm-overlay">
                    <div className="bg-white p-6 rounded-2xl shadow-xl w-full max-w-xs text-center animate-scale-in border border-slate-100">
                        <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-3 text-xl"><i className="fa-solid fa-trash"></i></div>
                        <h4 className="font-bold mb-2 text-slate-800">حذف التقرير؟</h4>
                        <p className="text-xs text-slate-500 mb-4">لا يمكن التراجع عن هذا الإجراء.</p>
                        <div className="flex gap-3">
                            <button onClick={confirmDeleteReport} className="flex-1 bg-red-600 text-white py-2 rounded-xl font-bold hover:bg-red-700 transition" id="confirm-delete-report-btn">حذف</button>
                            <button onClick={() => setReportToDeleteId(null)} className="flex-1 bg-slate-100 text-slate-700 py-2 rounded-xl font-bold hover:bg-slate-200 transition" id="cancel-delete-report-btn">إلغاء</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
