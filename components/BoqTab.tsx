// @ts-nocheck
import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Project, BOQItem, ItemType } from '../types';
import { ReportGenerator } from '../services/reportGenerator';

interface BoqTabProps {
    projectId: string;
    masterData: Project;
    setMasterData: React.Dispatch<React.SetStateAction<Project>>;
    triggerAutoSave: (newData: Project) => void;
    boqImageRef: React.RefObject<HTMLInputElement>;
    boqCameraRef: React.RefObject<HTMLInputElement>;
    onUploadClick: () => void;
}

export default function BoqTab({
    projectId,
    masterData,
    setMasterData,
    triggerAutoSave,
    boqImageRef,
    boqCameraRef,
    onUploadClick
}: BoqTabProps) {
    const navigate = useNavigate();

    // BOQ states
    const [isAnalyzingBOQ, setIsAnalyzingBOQ] = useState(false);
    const [editingBoqItem, setEditingBoqItem] = useState<BOQItem | null>(null);
    const [showBoqDeleteConfirm, setShowBoqDeleteConfirm] = useState(false);
    const [collapsedBatches, setCollapsedBatches] = useState<Set<string>>(new Set());
    const [renamingBatchId, setRenamingBatchId] = useState<string | null>(null);
    const [newBatchName, setNewBatchName] = useState('');
    const [showManualBoqModal, setShowManualBoqModal] = useState(false);
    const [manualBoqName, setManualBoqName] = useState('');
    const [batchToDeleteId, setBatchToDeleteId] = useState<string | null>(null);

    // Color list for visual grouping of items
    const getCardColor = (index: number) => {
        const colors = [
            'bg-blue-50 border-blue-400', 
            'bg-emerald-50 border-emerald-400', 
            'bg-amber-50 border-amber-400', 
            'bg-purple-50 border-purple-400', 
            'bg-rose-50 border-rose-400', 
            'bg-cyan-50 border-cyan-400'
        ]; 
        return colors[index % colors.length]; 
    };

    // Calculate quantity status colors
    const getQuantityStatusColor = (totalQty: number, contractQty: number) => {
        if (!contractQty || contractQty === 0) return 'bg-white';
        const ratio = totalQty / contractQty;
        if (ratio > 1.25) return 'bg-red-100 text-red-900 border-red-200'; // Critical (> 125%)
        if (ratio > 1.0) return 'bg-yellow-100 text-yellow-900 border-yellow-200'; // Warning (> 100% to 125%)
        return 'bg-white';
    };

    // BOQ Grouping and Calculations Memo
    const boqDerivedData = useMemo(() => {
        const groupedItems: { [key: string]: BOQItem[] } = {}; 
        const batchOrder: string[] = []; 
        masterData.boqItems.forEach(item => { 
            const bId = item.batchId || 'default'; 
            if (!groupedItems[bId]) { 
                groupedItems[bId] = []; 
                batchOrder.push(bId); 
            } 
            groupedItems[bId].push(item); 
        }); 
        const grandTotalValue = masterData.boqItems.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0); 
        const grandExecutedValue = masterData.boqItems.reduce((sum, item) => sum + (item.executedQuantity * item.unitPrice), 0);
        return { groupedItems, batchOrder, grandTotalValue, grandExecutedValue };
    }, [masterData.boqItems]);

    // BOQ File Analysis
    const analyzeBoqFile = async (file: File, filename?: string) => { 
        setIsAnalyzingBOQ(true); 
        try { 
            const batchId = `batch_${Date.now()}`; 
            const batchName = filename ? filename.replace(/\.[^/.]+$/, "") : `مقايسة ${new Date().toLocaleDateString('ar-EG')}`; 
            const text = await file.text().catch(() => '');
            const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
            const parsedItems: BOQItem[] = [];
            
            lines.forEach((line, idx) => {
                const parts = line.split(/[,;\t]/).map(p => p.trim());
                if (parts.length >= 2) {
                    const desc = parts[0];
                    const qty = parseFloat(parts[1]) || 1;
                    const unit = parts[2] || 'عدد';
                    const price = parseFloat(parts[3]) || 0;
                    parsedItems.push({
                        id: `boq_${Date.now()}_${idx}`,
                        itemCode: `${idx + 1}`,
                        description: desc,
                        quantity: qty,
                        unit: unit,
                        unitPrice: price,
                        total: qty * price,
                        executedQuantity: 0,
                        batchId,
                        batchName
                    });
                }
            });

            if (parsedItems.length === 0) {
                parsedItems.push({
                    id: `boq_${Date.now()}_1`,
                    itemCode: '1',
                    description: `بند استيراد - ${filename || 'ملف مقايسة'}`,
                    quantity: 1,
                    unit: 'عدد',
                    unitPrice: 0,
                    total: 0,
                    executedQuantity: 0,
                    batchId,
                    batchName
                });
            }

            const newData = { ...masterData, boqItems: [...masterData.boqItems, ...parsedItems] };
            setMasterData(newData); 
            alert(`تم إنشاء حزمة المقايسة بنجاح: ${batchName}`); 
            triggerAutoSave(newData);
        } catch (e) { 
            alert("حدث خطأ أثناء قراءة الملف."); 
        } finally { 
            setIsAnalyzingBOQ(false); 
        } 
    };

    const handleBOQAnalysis = async (e: React.ChangeEvent<HTMLInputElement>) => { 
        const file = e.target.files?.[0]; 
        if (!file) return; 
        await analyzeBoqFile(file, file.name); 
        if (boqImageRef.current) boqImageRef.current.value = ''; 
        if (boqCameraRef.current) boqCameraRef.current.value = '';
    };

    // Manual BOQ Package creation
    const handleCreateManualBOQ = () => { 
        setManualBoqName(''); 
        setShowManualBoqModal(true); 
    };

    const confirmCreateManualBOQ = (e: React.FormEvent) => {
        e.preventDefault(); 
        if (!manualBoqName.trim()) return;
        const newBatchId = `batch_${Date.now()}`;
        const newItem: BOQItem = { 
            id: `boq_${Date.now()}`, 
            batchId: newBatchId, 
            batchName: manualBoqName, 
            itemCode: '1', 
            description: 'بند جديد (اضغط للتعديل)', 
            unit: 'عدد', 
            quantity: 1, 
            unitPrice: 0, 
            total: 0, 
            executedQuantity: 0 
        };
        const newData = { ...masterData, boqItems: [...masterData.boqItems, newItem] };
        setMasterData(newData); 
        setShowManualBoqModal(false); 
        triggerAutoSave(newData);
    };

    // Item-level modification
    const confirmDeleteBOQItem = () => { 
        if (!editingBoqItem) return; 
        const newData = { ...masterData, boqItems: masterData.boqItems.filter(item => item.id !== editingBoqItem.id) }; 
        setMasterData(newData); 
        setEditingBoqItem(null); 
        setShowBoqDeleteConfirm(false); 
        triggerAutoSave(newData); 
    };

    const saveBOQItemEdit = () => { 
        if (!editingBoqItem) return; 
        const newData = { ...masterData, boqItems: masterData.boqItems.map(item => item.id === editingBoqItem.id ? editingBoqItem : item) }; 
        setMasterData(newData); 
        setEditingBoqItem(null); 
        triggerAutoSave(newData); 
    };

    const addItemBelow = () => { 
        if (!editingBoqItem) return; 
        const currentIndex = masterData.boqItems.findIndex(i => i.id === editingBoqItem.id); 
        if (currentIndex === -1) return; 
        
        const newItem: BOQItem = { 
            id: `boq_${Date.now()}_${Math.floor(Math.random() * 1000)}`, 
            itemCode: '', 
            description: '', 
            unit: '', 
            quantity: 0, 
            unitPrice: 0, 
            total: 0, 
            executedQuantity: 0, 
            batchId: editingBoqItem.batchId, 
            batchName: editingBoqItem.batchName 
        }; 
        const newItems = [...masterData.boqItems]; 
        newItems.splice(currentIndex + 1, 0, newItem); 
        setMasterData(prev => ({ ...prev, boqItems: newItems })); 
        setEditingBoqItem(null); 
    };

    // Group rename / delete
    const handleDeleteBatchClick = (batchId: string) => { 
        setBatchToDeleteId(batchId); 
    };

    const confirmDeleteBatch = () => { 
        if (!batchToDeleteId) return; 
        const newData = { ...masterData, boqItems: masterData.boqItems.filter(item => item.batchId !== batchToDeleteId) }; 
        setMasterData(newData); 
        setBatchToDeleteId(null); 
        triggerAutoSave(newData); 
    };

    const saveBatchRename = (batchId: string) => { 
        if (!newBatchName.trim()) return; 
        const newData = { ...masterData, boqItems: masterData.boqItems.map(item => item.batchId === batchId ? { ...item, batchName: newBatchName } : item) }; 
        setMasterData(newData); 
        setRenamingBatchId(null); 
        triggerAutoSave(newData); 
    };

    // Document Generation (Official Letter format)
    const handleEditBatchAsLetter = (batchItems: BOQItem[], batchName: string) => {
        const tableRows = batchItems.map(item => `
            <tr>
                <td>${item.itemCode || '-'}</td>
                <td>${item.description}</td>
                <td>${item.unit}</td>
                <td>${item.quantity}</td>
                <td>${item.unitPrice.toLocaleString()}</td>
                <td>${(item.quantity * item.unitPrice).toLocaleString()}</td>
            </tr>
        `).join('');
        
        const totalValue = batchItems.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
        
        const bodyHtml = `
            <h2>${batchName}</h2>
            <table>
                <thead>
                    <tr>
                        <th>بند</th><th>البيان</th><th>الوحدة</th><th>الكمية</th><th>الفئة</th><th>الإجمالي</th>
                    </tr>
                </thead>
                <tbody>${tableRows}</tbody>
                <tfoot>
                    <tr>
                        <td colspan="5" style="font-weight: bold; text-align: left;">الإجمالي العام</td>
                        <td style="font-weight: bold;">${totalValue.toLocaleString()} ج.م</td>
                    </tr>
                </tfoot>
            </table>
        `;
        
        const fullReport = ReportGenerator.buildReport(batchName, bodyHtml);
        navigate(`/editor/${projectId}/${projectId}`, { state: { initialContent: fullReport, returnToMasterData: true } });
    };

    const { groupedItems, batchOrder, grandTotalValue, grandExecutedValue } = boqDerivedData;

    return (
        <div className="space-y-2 pb-20 p-1">
            {/* Hidden Input Elements */}
            <input type="file" ref={boqImageRef} onChange={handleBOQAnalysis} accept="image/*,application/pdf" className="hidden" />
            <input type="file" ref={boqCameraRef} onChange={handleBOQAnalysis} accept="image/*" capture="environment" className="hidden" />

            {/* Header */}
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-1.5 flex justify-between items-center shrink-0">
                <div><h4 className="font-bold text-indigo-900 text-[10px]">تحليل المقايسة</h4></div>
                <div className="flex gap-1.5">
                    <button onClick={handleCreateManualBOQ} className="bg-white border border-indigo-200 text-indigo-700 px-3 py-1.5 rounded-lg text-[10px] font-bold shadow-sm hover:bg-indigo-50 transition flex items-center gap-1.5"><i className="fa-solid fa-plus"></i> إنشاء يدوية</button>
                    <button onClick={onUploadClick} disabled={isAnalyzingBOQ} className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold shadow-lg hover:bg-indigo-700 transition flex items-center gap-1.5 disabled:opacity-50">
                        {isAnalyzingBOQ ? <i className="fa-solid fa-circle-notch fa-spin"></i> : <i className="fa-solid fa-file-import"></i>} استيراد ملف
                    </button>
                </div>
            </div>

            {/* Table Area */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-right">
                        <tbody className="divide-y divide-slate-100">
                            {batchOrder.map(bId => {
                                const groupItems = groupedItems[bId]; 
                                const groupName = groupItems[0].batchName || 'بنود إضافية'; 
                                const isDefault = bId === 'default'; 
                                const isCollapsed = collapsedBatches.has(bId); 
                                const isRenaming = renamingBatchId === bId; 
                                const batchTotal = groupItems.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0); 
                                const batchExecutedTotal = groupItems.reduce((sum, item) => sum + (item.executedQuantity * item.unitPrice), 0); 
                                
                                return ( 
                                    <React.Fragment key={bId}> 
                                        <tr className="bg-indigo-50 border-b border-indigo-200"> 
                                            <td colSpan={6} className="p-2 text-right"> 
                                                <div className="flex justify-between items-center w-full">
                                                    <div className="flex flex-col items-start gap-1 cursor-pointer flex-1 w-full" onClick={() => { const newSet = new Set(collapsedBatches); if (newSet.has(bId)) newSet.delete(bId); else newSet.add(bId); setCollapsedBatches(newSet); }}> 
                                                        <div className="flex items-center gap-2"> 
                                                            <i className={`fa-solid ${isCollapsed ? 'fa-chevron-left' : 'fa-chevron-down'} text-indigo-500 w-4 text-center transition-transform`}></i> 
                                                            <i className="fa-solid fa-layer-group text-indigo-400"></i> 
                                                            {isRenaming ? ( 
                                                                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}> 
                                                                    <input type="text" value={newBatchName} onChange={(e) => setNewBatchName(e.target.value)} className="text-xs p-1 rounded border border-indigo-300 outline-none" autoFocus /> 
                                                                    <button onClick={() => saveBatchRename(bId)} className="bg-green-500 text-white rounded px-2 py-1 text-[10px]"><i className="fa-solid fa-check"></i></button> 
                                                                </div> 
                                                            ) : ( 
                                                                <span className="font-bold text-indigo-900 text-sm">{groupName} <span className="text-[10px] text-indigo-400 font-normal">({groupItems.length} بند)</span></span> 
                                                            )} 
                                                        </div> 
                                                        <div className="flex items-center gap-1 mr-6"> 
                                                            <div className="text-[9px] bg-white px-2 py-0.5 rounded border border-indigo-100 text-indigo-800 font-bold shadow-sm"> <span className="text-indigo-400 font-normal ml-1">إجمالي:</span> {batchTotal.toLocaleString()} </div> 
                                                            <div className="text-[9px] bg-white px-2 py-0.5 rounded border border-green-100 text-green-800 font-bold shadow-sm"> <span className="text-green-500 font-normal ml-1">منفذ:</span> {batchExecutedTotal.toLocaleString()} </div> 
                                                        </div>
                                                    </div> 
                                                    <div className="flex flex-col items-end gap-1 pl-2"> 
                                                        <div className="flex items-center gap-1">
                                                            <button onClick={(e) => { e.stopPropagation(); handleEditBatchAsLetter(groupItems, groupName); }} className="text-indigo-600 text-[10px] bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 px-2 py-1 rounded transition flex items-center gap-1 font-bold shadow-sm"><i className="fa-solid fa-file-signature"></i></button>
                                                            {!isDefault && !isRenaming && ( <button onClick={(e) => { e.stopPropagation(); setRenamingBatchId(bId); setNewBatchName(groupName); }} className="text-blue-600 text-[10px] bg-blue-50 border border-blue-100 hover:bg-blue-100 px-2 py-1 rounded transition flex items-center gap-1 font-bold"><i className="fa-solid fa-pen"></i></button> )} 
                                                            {!isDefault && ( <button onClick={(e) => { e.stopPropagation(); handleDeleteBatchClick(bId); }} className="text-red-600 text-[10px] bg-red-50 border border-red-100 hover:bg-red-100 px-2 py-1 rounded transition flex items-center gap-1 font-bold"><i className="fa-solid fa-trash"></i></button> )}
                                                        </div>
                                                    </div> 
                                                </div> 
                                            </td> 
                                        </tr> 
                                        {!isCollapsed && groupItems.map((item) => {
                                            const isNote = !item.quantity && !item.unitPrice;
                                            return ( 
                                                <tr key={item.id} className="hover:bg-blue-50/50 transition border-b border-slate-200"> 
                                                    <td colSpan={6} className="p-3"> 
                                                        <div className="flex flex-col gap-2">
                                                            <div className="w-full bg-blue-50 border border-blue-100 text-blue-800 rounded p-2 font-mono font-bold text-lg cursor-pointer hover:bg-blue-100 transition shadow-sm" onClick={() => setEditingBoqItem(item)}>
                                                                رقم البند: {item.itemCode || '-'}
                                                            </div>
                                                            <div className="w-full text-lg font-bold text-slate-900 leading-relaxed whitespace-pre-wrap">
                                                                {item.description}
                                                            </div>
                                                            {!isNote && (
                                                                <div className="grid grid-cols-5 gap-2 text-center bg-slate-50 p-2 rounded-xl border border-slate-200 mt-2"> 
                                                                    <div className="flex flex-col border-l border-slate-200"><span className="text-sm text-slate-500 font-bold">الوحدة</span><span className="text-lg font-bold">{item.unit}</span></div> 
                                                                    <div className="flex flex-col border-l border-slate-200"><span className="text-sm text-slate-500 font-bold">الكمية</span><span className="text-lg font-bold font-mono">{item.quantity}</span></div> 
                                                                    <div className="flex flex-col border-l border-slate-200"><span className="text-sm text-slate-500 font-bold">الفئة</span><span className="text-lg font-bold font-mono">{item.unitPrice}</span></div> 
                                                                    <div className="flex flex-col border-l border-slate-200"><span className="text-sm text-slate-500 font-bold">الإجمالي</span><span className="text-lg font-bold font-mono">{Math.round(item.quantity * item.unitPrice)}</span></div> 
                                                                    <div className="flex flex-col"><span className="text-sm text-green-600 font-bold mb-0.5">المنفذ</span><span className="text-lg font-bold font-mono text-green-700">{isNaN(Number(item.executedQuantity)) ? 0 : item.executedQuantity}</span></div> 
                                                                </div> 
                                                            )}
                                                        </div>
                                                    </td> 
                                                </tr> 
                                            )
                                        })} 
                                    </React.Fragment> 
                                ); 
                            })} 
                            {masterData.boqItems.length > 0 && ( 
                                <tr className="bg-slate-900 !text-white font-bold border-t-4 border-slate-600 shadow-lg relative z-10"> 
                                    <td colSpan={4} className="p-3 text-right text-sm sm:text-base !text-white"> <span className="sm:hidden">الإجمالي: </span> <span className="hidden sm:inline">الإجمالي العام للمشروع</span> </td> 
                                    <td className="p-3 text-center text-sm sm:text-base font-mono !text-yellow-400">{grandTotalValue.toLocaleString()}</td> 
                                    <td className="p-3 text-center text-sm sm:text-base font-mono !text-green-400">{grandExecutedValue.toLocaleString()}</td> 
                                </tr> 
                            )} 
                        </tbody>
                    </table>
                    {masterData.boqItems.length === 0 && <div className="text-center py-12 text-slate-400 text-xs">لا توجد بنود.</div>}
                </div>
            </div>

            {/* Manual BOQ Modal */}
            {showManualBoqModal && (
                <div className="fixed inset-0 z-[1600] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm overflow-hidden animate-scale-in">
                        <div className="bg-indigo-900 text-white p-4 flex justify-between items-center">
                            <h3 className="font-bold text-white text-sm">إنشاء حزمة مقايسة يدوية</h3>
                            <button onClick={() => setShowManualBoqModal(false)} className="w-8 h-8 rounded-full hover:bg-white/20 flex items-center justify-center"><i className="fa-solid fa-times"></i></button>
                        </div>
                        <form onSubmit={confirmCreateManualBOQ} className="p-4 space-y-3">
                            <div>
                                <label className="block text-xs font-bold mb-1 text-slate-600">اسم الحزمة</label>
                                <input type="text" className="w-full p-2 border rounded-lg text-xs" placeholder="مثال: أعمال الحفر والخرسانات" value={manualBoqName} onChange={(e) => setManualBoqName(e.target.value)} required />
                            </div>
                            <div className="flex gap-2 justify-end pt-2">
                                <button type="submit" className="bg-indigo-600 text-white text-xs font-bold px-4 py-2 rounded-lg">حفظ</button>
                                <button type="button" onClick={() => setShowManualBoqModal(false)} className="bg-slate-100 text-slate-700 text-xs font-bold px-4 py-2 rounded-lg">إلغاء</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* BOQ Edit Modal */}
            {editingBoqItem && (
                <div className="fixed inset-0 z-[1600] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-scale-in relative">
                        {showBoqDeleteConfirm && (
                            <div className="absolute inset-0 z-[60] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-6 rounded-2xl">
                                <div className="bg-white p-6 rounded-2xl shadow-xl w-full max-w-xs text-center">
                                    <h4 className="font-bold mb-2">حذف البند؟</h4>
                                    <div className="flex gap-3">
                                        <button onClick={confirmDeleteBOQItem} className="flex-1 bg-red-600 text-white py-2 rounded-xl">حذف</button>
                                        <button onClick={() => setShowBoqDeleteConfirm(false)} className="flex-1 bg-slate-100 text-slate-700 py-2 rounded-xl">إلغاء</button>
                                    </div>
                                </div>
                            </div>
                        )}
                        <div className="bg-slate-900 text-white p-4 flex justify-between items-center"><h3 className="font-bold text-white">تعديل البند</h3><button onClick={() => setEditingBoqItem(null)} className="w-8 h-8 rounded-full hover:bg-white/20 flex items-center justify-center"><i className="fa-solid fa-times"></i></button></div>
                        <div className="p-4 space-y-3">
                            <div className="flex gap-2">
                                <div className="w-24"><label className="block text-xs font-bold mb-1">رقم</label><input type="text" className="w-full p-2 border rounded-lg" value={editingBoqItem.itemCode} onChange={(e) => setEditingBoqItem({...editingBoqItem, itemCode: e.target.value})} /></div>
                                <div className="w-20"><label className="block text-xs font-bold mb-1">الوحدة</label><input type="text" className="w-full p-2 border rounded-lg" value={editingBoqItem.unit} onChange={(e) => setEditingBoqItem({...editingBoqItem, unit: e.target.value})} /></div>
                                <div className="flex-1"><label className="block text-xs font-bold mb-1">الفئة</label><input type="number" className="w-full p-2 border rounded-lg" value={editingBoqItem.unitPrice} onChange={(e) => setEditingBoqItem({...editingBoqItem, unitPrice: Number(e.target.value)})} /></div>
                            </div>
                            <div><label className="block text-xs font-bold mb-1">بيان الأعمال</label><textarea className="w-full p-3 border rounded-lg h-24 resize-none text-sm" value={editingBoqItem.description} onChange={(e) => setEditingBoqItem({...editingBoqItem, description: e.target.value})}></textarea></div>
                            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                                <div className="bg-slate-50 p-2 rounded-lg"><label className="block text-xs font-bold text-center">الكمية التعاقدية</label><input type="number" className="w-full p-2 border rounded-lg text-center" value={editingBoqItem.quantity} onChange={(e) => setEditingBoqItem({...editingBoqItem, quantity: Number(e.target.value)})} /></div>
                                <div className="bg-green-50 p-2 rounded-lg"><label className="block text-xs font-bold text-green-700 text-center">الكمية المنفذة</label><input type="number" className="w-full p-2 border rounded-lg text-center font-bold text-green-800" value={isNaN(Number(editingBoqItem.executedQuantity)) ? 0 : editingBoqItem.executedQuantity} onChange={(e) => setEditingBoqItem({...editingBoqItem, executedQuantity: Number(e.target.value)})} /></div>
                            </div>
                        </div>
                        <div className="p-4 bg-slate-50 border-t flex justify-between gap-2">
                            <button type="button" onClick={() => setShowBoqDeleteConfirm(true)} className="px-4 py-2 bg-red-100 text-red-600 rounded-xl font-bold"><i className="fa-solid fa-trash"></i></button>
                            <button type="button" onClick={addItemBelow} className="px-4 py-2 bg-yellow-100 text-yellow-700 rounded-xl font-bold"><i className="fa-solid fa-plus"></i> إضافة أسفل</button>
                            <button type="button" onClick={saveBOQItemEdit} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-xl font-bold">حفظ التعديلات</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Batch Delete Confirmation */}
            {batchToDeleteId && (
                <div className="fixed inset-0 z-[1600] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white p-6 rounded-2xl shadow-xl w-full max-w-xs text-center border">
                        <h4 className="font-bold mb-2">حذف الحزمة بالكامل؟</h4>
                        <p className="text-xs text-slate-500 mb-4">سيتم حذف كافة بنود هذه المقايسة ولا يمكن التراجع.</p>
                        <div className="flex gap-3">
                            <button onClick={confirmDeleteBatch} className="flex-1 bg-red-600 text-white py-2 rounded-xl text-xs font-bold">حذف الحزمة</button>
                            <button onClick={() => setBatchToDeleteId(null)} className="flex-1 bg-slate-100 text-slate-700 py-2 rounded-xl text-xs font-bold">إلغاء</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
