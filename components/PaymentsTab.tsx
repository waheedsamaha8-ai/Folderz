// @ts-nocheck
import React, { useState, useMemo } from 'react';
import { ProjectPayment, PaymentItem } from '../types';
import { imageUtils } from '../services/imageUtils';

interface PaymentsTabProps {
    projectId: string;
    masterData: {
        payments: ProjectPayment[];
        newPaymentCumulative: string;
        newPaymentNote: string;
        newInvoiceNumber: string;
        boqItems: any[];
    };
    setMasterData: React.Dispatch<React.SetStateAction<any>>;
    triggerAutoSave: (newData: any) => Promise<void>;
    isRecording: boolean;
    voiceTarget: string | null;
    startRecording: (target: 'log' | 'payment') => Promise<void>;
    stopRecording: () => void;
    onUploadClick: () => void;
    paymentFileRef: React.RefObject<HTMLInputElement>;
    paymentCameraRef: React.RefObject<HTMLInputElement>;
}

export default function PaymentsTab({
    projectId,
    masterData,
    setMasterData,
    triggerAutoSave,
    isRecording,
    voiceTarget,
    startRecording,
    stopRecording,
    onUploadClick,
    paymentFileRef,
    paymentCameraRef
}: PaymentsTabProps) {
    // Specific states (completely self-contained)
    const [newPaymentDate, setNewPaymentDate] = useState(new Date().toISOString().split('T')[0]);
    const [newPaymentFile, setNewPaymentFile] = useState<string | null>(null);
    const [newPaymentItems, setNewPaymentItems] = useState<PaymentItem[]>([]);
    const [isAnalyzingPayment, setIsAnalyzingPayment] = useState(false);
    
    const [editingPayId, setEditingPayId] = useState<string | null>(null);
    const [tempEditPayAmount, setTempEditPayAmount] = useState('');
    const [tempEditPayNote, setTempEditPayNote] = useState('');
    const [tempEditPayDate, setTempEditPayDate] = useState('');

    const [expandedPaymentId, setExpandedPaymentId] = useState<string | null>(null);
    const [paymentToDeleteId, setPaymentToDeleteId] = useState<string | null>(null);

    const [editingPaymentItemIndex, setEditingPaymentItemIndex] = useState<{paymentId: string, itemIndex: number} | null>(null);
    const [tempPaymentItem, setTempPaymentItem] = useState<PaymentItem | null>(null);

    // Calculated Previous Payment Total for Cumulative Logic
    const previousTotalPayments = useMemo(() => {
        if (masterData.payments.length === 0) return 0;
        return Math.max(...masterData.payments.map(p => p.cumulativeAmount || 0), 0);
    }, [masterData.payments]);

    // File Selector & Attachment handler
    const handlePaymentFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsAnalyzingPayment(true);
        try {
            let processedFile = file;
            if (file.type.startsWith('image/')) {
                processedFile = await imageUtils.compressImage(file, 0.4, 800);
            }
            const reader = new FileReader();
            reader.readAsDataURL(processedFile);
            reader.onload = async () => {
                const base64 = reader.result as string;
                setNewPaymentFile(base64);
                setMasterData((prev: any) => ({
                    ...prev, 
                    newPaymentNote: prev.newPaymentNote || `مستند مستخلص مرفق (${file.name})`
                }));
                setIsAnalyzingPayment(false);
            };
        } catch (e) { setIsAnalyzingPayment(false); }
        if (paymentFileRef.current) paymentFileRef.current.value = '';
        if (paymentCameraRef.current) paymentCameraRef.current.value = '';
    };

    const addPayment = () => { 
        if (!masterData.newPaymentCumulative) return; 
        
        let cumulativeAmount = parseFloat(masterData.newPaymentCumulative);
        
        let previousCumulative = 0;
        if (masterData.payments.length > 0) {
            previousCumulative = Math.max(...masterData.payments.map(p => p.cumulativeAmount || 0));
        }
        
        let netAmount = cumulativeAmount - previousCumulative;
        
        if (netAmount < 0) {
            if(!confirm(`قيمة المستخلص التراكمي (${cumulativeAmount}) أقل من السابق (${previousCumulative}). الصافي سيكون بالسالب (${netAmount}). هل أنت متأكد؟`)) return;
        }

        const newPay: ProjectPayment = { 
            id: `pay_${Date.now()}`, 
            invoiceNumber: masterData.newInvoiceNumber,
            date: newPaymentDate || new Date().toISOString().split('T')[0], 
            cumulativeAmount: cumulativeAmount,
            netAmount: netAmount, 
            note: masterData.newPaymentNote || `مستخلص رقم ${masterData.newInvoiceNumber || '-'}`,
            items: newPaymentItems.length > 0 ? newPaymentItems : [],
            attachments: newPaymentFile ? [newPaymentFile] : []
        };
        const updatedPayments = [newPay, ...masterData.payments].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const newData = { ...masterData, payments: updatedPayments, newPaymentCumulative: '', newPaymentNote: '', newInvoiceNumber: '' };
        
        setMasterData(newData);
        setNewPaymentFile(null); 
        setNewPaymentItems([]); 
        setNewPaymentDate(new Date().toISOString().split('T')[0]);
        triggerAutoSave(newData);
    };

    const saveEditPayment = (id: string) => { 
        if (!tempEditPayAmount) return; 
        const newData = { ...masterData, payments: masterData.payments.map(p => p.id === id ? { ...p, netAmount: parseFloat(tempEditPayAmount), amount: parseFloat(tempEditPayAmount), note: tempEditPayNote, date: tempEditPayDate } : p).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()) };
        setMasterData(newData); 
        setEditingPayId(null); 
        triggerAutoSave(newData);
    };

    const triggerDeletePayment = (id: string) => {
        setPaymentToDeleteId(id);
    };

    const confirmDeletePayment = () => { 
        if (paymentToDeleteId) { 
            const newData = { ...masterData, payments: masterData.payments.filter(p => p.id !== paymentToDeleteId) };
            setMasterData(newData); 
            setPaymentToDeleteId(null); 
            triggerAutoSave(newData);
        } 
    };

    // ITEM EDITING LOGIC (STRICT MATH)
    const handleStartEditItem = (paymentId: string, item: PaymentItem, index: number) => {
        setEditingPaymentItemIndex({ paymentId, itemIndex: index });
        setTempPaymentItem({...item});
    };

    const handleTempItemChange = (field: keyof PaymentItem, value: any) => {
        setTempPaymentItem(prev => {
            if (!prev) return null;
            const updated = { ...prev, [field]: value };
            
            const prevQ = parseFloat(updated.prevQuantity as any) || 0;
            const currQ = parseFloat(updated.currQuantity as any) || 0;
            const price = parseFloat(updated.unitPrice as any) || 0;
            const ratio = parseFloat(updated.completionRatio as any) || 100;
            
            if (field === 'totalQuantity') {
                const newTotal = parseFloat(value) || 0;
                updated.currQuantity = newTotal - prevQ;
            } else if (field === 'currQuantity' || field === 'prevQuantity') {
                updated.totalQuantity = prevQ + currQ;
            }
            
            updated.totalValue = (updated.totalQuantity || 0) * price * (ratio / 100);
            return updated;
        });
    };

    const saveItemEdit = () => {
        if (!editingPaymentItemIndex || !tempPaymentItem) return;
        
        const { paymentId, itemIndex } = editingPaymentItemIndex;
        
        const targetPaymentIndex = masterData.payments.findIndex(p => p.id === paymentId);
        if (targetPaymentIndex === -1) return;
        
        const updatedPayments = [...masterData.payments];
        const payment = { ...updatedPayments[targetPaymentIndex] };
        
        const newItems = [...(payment.items || [])];
        newItems[itemIndex] = tempPaymentItem;
        payment.items = newItems;
        
        const newCumulative = newItems.reduce((sum, item) => sum + (item.totalValue || 0), 0);
        payment.cumulativeAmount = newCumulative;
        
        const newNet = newItems.reduce((sum, item) => {
            const currVal = (item.currQuantity || 0) * (item.unitPrice || 0) * ((item.completionRatio || 100) / 100);
            return sum + currVal;
        }, 0);
        
        payment.netAmount = newNet;
        updatedPayments[targetPaymentIndex] = payment;
        
        setMasterData(prev => ({ ...prev, payments: updatedPayments }));
        setEditingPaymentItemIndex(null);
        setTempPaymentItem(null);
        triggerAutoSave({ ...masterData, payments: updatedPayments });
    };

    const getQuantityStatusColor = (totalQty: number, contractQty: number) => {
        if (!contractQty || contractQty === 0) return '';
        if (totalQty > contractQty) return 'bg-red-50 text-red-700 border border-red-200';
        if (totalQty === contractQty) return 'bg-green-50 text-green-700 border border-green-200';
        return 'bg-blue-50 text-blue-700 border border-blue-100';
    };

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

    return (
        <div className="flex flex-col gap-2 pb-20 font-sans" id="payments-tab">
            {/* Hidden Input Selectors connected to the trigger buttons */}
            <input 
                type="file" 
                ref={paymentFileRef} 
                onChange={handlePaymentFileSelect} 
                accept="image/*,application/pdf" 
                className="hidden" 
            />
            <input 
                type="file" 
                ref={paymentCameraRef} 
                onChange={handlePaymentFileSelect} 
                accept="image/*" 
                capture="environment" 
                className="hidden" 
            />

            {/* Input Area */}
            <div className="bg-white rounded-xl p-3 border border-green-100 shadow-sm shrink-0 flex flex-col gap-2" id="payment-input-card">
                <div className="flex gap-2 items-center">
                    <input 
                        type="date" 
                        className="bg-white border border-green-200 text-xs rounded-lg px-2 py-2 outline-none text-slate-700 font-bold w-24" 
                        value={newPaymentDate} 
                        onChange={(e) => setNewPaymentDate(e.target.value)} 
                    />
                    <input 
                        type="text" 
                        placeholder="رقم المستخلص" 
                        className="w-24 p-2 text-xs rounded-lg border border-green-200 outline-none text-slate-900 font-bold" 
                        value={masterData.newInvoiceNumber} 
                        onChange={(e) => setMasterData({...masterData, newInvoiceNumber: e.target.value})} 
                    />
                    <button 
                        onClick={isRecording ? stopRecording : () => startRecording('payment')} 
                        className={`w-8 h-8 rounded-lg flex items-center justify-center transition shadow-sm ${isRecording && voiceTarget === 'payment' ? 'bg-red-500 text-white animate-pulse' : 'bg-white border border-green-200 text-green-600'}`}
                        id="voice-payment-btn"
                    >
                        <i className={`fa-solid ${isRecording && voiceTarget === 'payment' ? 'fa-stop' : 'fa-microphone'} text-xs`}></i>
                    </button>
                    <button 
                        onClick={onUploadClick} 
                        disabled={isAnalyzingPayment} 
                        className="flex-1 bg-white border border-green-200 text-green-700 rounded-lg text-[10px] font-bold flex items-center justify-center gap-2 hover:bg-green-50 transition shadow-sm h-8 whitespace-nowrap"
                        id="analyze-payment-btn"
                    >
                        {isAnalyzingPayment ? 'جاري التحليل...' : 'رفع مستخلص'}
                    </button>
                </div>
                
                <div className="flex gap-2 items-stretch">
                    <div className="flex flex-col gap-2 w-1/3">
                        <div className="flex flex-col gap-1">
                            <label className="text-[7px] font-light text-slate-400">إجمالي الأعمال</label>
                            <input 
                                type="number" 
                                className="w-full p-2 text-xs rounded-lg border border-green-200 outline-none text-slate-900 font-bold h-9" 
                                placeholder="0.00" 
                                value={masterData.newPaymentCumulative} 
                                onChange={(e) => setMasterData({...masterData, newPaymentCumulative: e.target.value})} 
                            />
                        </div>
                        
                        <div className="text-[7px] text-green-700 font-light bg-green-50 px-2 py-1 rounded border border-green-100 flex flex-col justify-center h-full min-h-[36px]">
                            <span className="opacity-70">صافي المستخلص:</span>
                            <span className="text-xs font-bold">{Math.max(0, (parseFloat(masterData.newPaymentCumulative) || 0) - previousTotalPayments).toLocaleString()}</span>
                        </div>
                    </div>
                    <div className="flex flex-col gap-1 flex-1">
                        <textarea 
                            className="w-full p-2 text-xs rounded-lg border border-green-200 outline-none text-slate-900 resize-none h-full" 
                            placeholder="البيان..." 
                            value={masterData.newPaymentNote} 
                            onChange={(e) => setMasterData({...masterData, newPaymentNote: e.target.value})} 
                        />
                    </div>
                </div>
                <button 
                    onClick={addPayment} 
                    className="w-full bg-green-600 text-white px-3 h-9 rounded-lg text-sm font-bold hover:bg-green-700 transition flex items-center justify-center shadow-md gap-2"
                    id="submit-payment-btn"
                >
                    <i className="fa-solid fa-plus"></i> حفظ المستخلص
                </button>
            </div>
            
            <div className="space-y-2 pb-10" id="payments-list">
                {masterData.payments.map((pay, idx) => (
                    <div key={pay.id} className="relative group animate-scale-in" id={`payment-container-${pay.id}`}>
                        {editingPayId === pay.id ? (
                            <div className="bg-green-50 p-4 rounded-xl border-2 border-green-300 shadow-md flex flex-col gap-2" id={`payment-edit-form-${pay.id}`}>
                                <div className="flex gap-2">
                                    <input type="date" className="w-1/3 p-2 text-xs rounded-lg border bg-white" value={tempEditPayDate} onChange={(e) => setTempEditPayDate(e.target.value)} />
                                    <input type="number" className="w-2/3 p-2 text-xs rounded-lg border bg-white font-bold" value={tempEditPayAmount} onChange={(e) => setTempEditPayAmount(e.target.value)} />
                                </div>
                                <textarea className="w-full p-2 text-xs rounded-lg border bg-white" value={tempEditPayNote} onChange={(e) => setTempEditPayNote(e.target.value)} />
                                <div className="flex justify-end gap-2">
                                    <button onClick={() => saveEditPayment(pay.id)} className="text-[10px] bg-green-600 text-white px-3 py-1 rounded font-bold">حفظ</button>
                                    <button onClick={() => setEditingPayId(null)} className="text-[10px] bg-white border px-3 py-1 rounded font-bold">إلغاء</button>
                                </div>
                            </div>
                        ) : (
                            <div className={`p-3 rounded-2xl shadow-sm border-4 hover:shadow-md transition relative flex flex-col gap-2 ${getCardColor(idx)}`} id={`payment-card-${pay.id}`}>
                                <div className="flex justify-between items-center border-b border-black/5 pb-2">
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 rounded-full bg-white/50 text-green-700 flex items-center justify-center shadow-sm">
                                            <i className="fa-solid fa-file-invoice text-xs"></i>
                                        </div>
                                        <span className="font-bold text-slate-800 text-sm sm:text-base font-mono bg-white/50 px-3 h-8 flex items-center justify-center rounded border border-black/5 leading-none pt-1">
                                            {pay.date} | #{pay.invoiceNumber || '-'}
                                        </span>
                                    </div>
                                    <div className="flex gap-1">
                                        <button 
                                            onClick={() => { 
                                                setEditingPayId(pay.id); 
                                                setTempEditPayAmount((pay.netAmount || pay.amount || 0).toString()); 
                                                setTempEditPayNote(pay.note); 
                                                setTempEditPayDate(pay.date); 
                                            }} 
                                            className="w-7 h-7 rounded-full bg-white/50 text-slate-500 hover:text-blue-600 transition flex items-center justify-center border border-black/5"
                                            id={`edit-pay-btn-${pay.id}`}
                                        >
                                            <i className="fa-solid fa-pen text-[10px]"></i>
                                        </button>
                                        <button 
                                            onClick={() => triggerDeletePayment(pay.id)} 
                                            className="w-7 h-7 rounded-full bg-white/50 text-slate-500 hover:text-red-600 transition flex items-center justify-center border border-black/5"
                                            id={`delete-pay-btn-${pay.id}`}
                                        >
                                            <i className="fa-solid fa-trash text-[10px]"></i>
                                        </button>
                                    </div>
                                </div>
                                <div className="bg-white/40 p-2.5 rounded-lg border border-black/5 flex flex-col gap-1">
                                    <div className="flex justify-between items-center border-b border-black/5 pb-1 mb-1">
                                        <span className="text-[10px] text-slate-500 font-bold">إجمالي الأعمال</span>
                                        <span className="font-bold text-slate-900 font-mono text-base">{(pay.cumulativeAmount || 0).toLocaleString()} ج.م</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-[10px] text-slate-500 font-bold">صافي المستخلص</span>
                                        <span className="font-black text-green-800 font-mono text-lg">{(pay.netAmount || 0).toLocaleString()} ج.م</span>
                                    </div>
                                    <p className="text-slate-900 text-sm leading-relaxed font-bold whitespace-pre-wrap mt-1 opacity-80">{pay.note}</p>
                                </div>
                                {pay.items && pay.items.length > 0 && (
                                    <button 
                                        onClick={() => setExpandedPaymentId(expandedPaymentId === pay.id ? null : pay.id)} 
                                        className="w-full bg-white/30 hover:bg-white/60 p-1.5 rounded-lg transition flex items-center justify-center gap-1 text-[10px] font-bold text-slate-600 mt-1 border border-black/5"
                                        id={`toggle-items-${pay.id}`}
                                    >
                                        {expandedPaymentId === pay.id ? 'إخفاء التفاصيل' : 'عرض البنود'}
                                    </button>
                                )}
                                {expandedPaymentId === pay.id && pay.items && (
                                    <div className="mt-1 bg-white rounded-lg border border-slate-200 overflow-hidden p-1 space-y-2" id={`items-table-${pay.id}`}>
                                        {pay.items.map((item, i) => {
                                            const isEditingThisItem = editingPaymentItemIndex && editingPaymentItemIndex.paymentId === pay.id && editingPaymentItemIndex.itemIndex === i;
                                            const quantityColorClass = getQuantityStatusColor(item.totalQuantity || 0, item.contractQuantity || 0);
                                            
                                            return (
                                                <div key={i} className={`rounded border p-2 text-[10px] transition ${isEditingThisItem ? 'bg-yellow-50 border-yellow-200 shadow-md' : 'bg-slate-50 border-slate-100'}`} id={`pay-item-${pay.id}-${i}`}>
                                                    {isEditingThisItem ? (
                                                        <div className="flex flex-col gap-2">
                                                            <div className="flex justify-between items-center bg-white p-1 rounded border border-yellow-100">
                                                                <span className="font-bold text-slate-700">تعديل البند</span>
                                                                <input type="text" className="w-20 p-1 border rounded font-mono text-center text-xs" value={tempPaymentItem?.itemCode || ''} onChange={(e) => handleTempItemChange('itemCode', e.target.value)} placeholder="الكود" />
                                                            </div>
                                                            <input type="text" className="w-full p-1.5 border rounded bg-white text-xs" value={tempPaymentItem?.description || ''} onChange={(e) => handleTempItemChange('description', e.target.value)} />
                                                            
                                                            <div className="grid grid-cols-2 gap-2 text-center bg-slate-100 p-1 rounded border border-slate-200 mb-1">
                                                                <div className="flex flex-col"><label className="text-[8px] text-slate-500">التعاقدية</label><input type="number" className="w-full p-1 border rounded text-center font-bold bg-white" value={tempPaymentItem?.contractQuantity || 0} onChange={(e) => handleTempItemChange('contractQuantity', e.target.value)} /></div>
                                                                <div className="flex flex-col"><label className="text-[8px] text-slate-500">السابقة</label><input type="number" className="w-full p-1 border rounded text-center font-bold bg-white" value={tempPaymentItem?.prevQuantity || 0} onChange={(e) => handleTempItemChange('prevQuantity', e.target.value)} /></div>
                                                            </div>

                                                            <div className="grid grid-cols-3 gap-1 text-center">
                                                                <div className="flex flex-col"><label className="text-[8px] text-blue-600 font-bold">الإجمالية (تلقائي)</label><input type="number" className="w-full p-1 border rounded text-center font-black text-blue-700 border-blue-200 bg-blue-50" value={tempPaymentItem?.totalQuantity || 0} onChange={(e) => handleTempItemChange('totalQuantity', e.target.value)} /></div>
                                                                <div className="flex flex-col"><label className="text-[8px] text-slate-400">الفئة</label><input type="number" className="w-full p-1 border rounded text-center font-bold bg-white" value={tempPaymentItem?.unitPrice || 0} onChange={(e) => handleTempItemChange('unitPrice', e.target.value)} /></div>
                                                                <div className="flex flex-col"><label className="text-[8px] text-slate-400">نسبة %</label><input type="number" className="w-full p-1 border rounded text-center font-bold bg-white" value={tempPaymentItem?.completionRatio || 100} onChange={(e) => handleTempItemChange('completionRatio', e.target.value)} /></div>
                                                            </div>
                                                            
                                                            <div className="flex justify-between items-center bg-white p-1 rounded border border-slate-200 mt-1 font-bold">
                                                                <span className="text-[9px] text-slate-400">الحالية (ناتج): {tempPaymentItem?.currQuantity?.toLocaleString()}</span>
                                                                <span className="font-black text-blue-800 font-mono">{(tempPaymentItem?.totalValue || 0).toLocaleString()} ج.م</span>
                                                            </div>

                                                            <div className="flex gap-2 mt-1">
                                                                <button onClick={saveItemEdit} className="flex-1 bg-green-600 text-white py-1.5 rounded font-bold hover:bg-green-700">حفظ</button>
                                                                <button onClick={() => { setEditingPaymentItemIndex(null); setTempPaymentItem(null); }} className="flex-1 bg-slate-200 text-slate-700 py-1.5 rounded font-bold hover:bg-slate-300">إلغاء</button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div onClick={() => handleStartEditItem(pay.id, item, i)} className="cursor-pointer hover:bg-blue-50 transition p-1 rounded">
                                                            {/* Row 1: Code & Desc */}
                                                            <div className="flex gap-2 font-bold text-slate-800 mb-1">
                                                                <span className="bg-white px-1.5 rounded border border-slate-200 font-mono text-xs pt-0.5">{item.itemCode || '-'}</span>
                                                                <span className="truncate text-xs">{item.description}</span>
                                                                <i className="fa-solid fa-pen text-[8px] text-slate-300 mr-auto mt-1"></i>
                                                            </div>
                                                            {/* Row 2: Quantities */}
                                                            <div className="grid grid-cols-4 gap-1 text-center bg-white rounded border border-slate-100 p-1 mb-1">
                                                                <div className="flex flex-col"><span className="text-[8px] text-slate-400">التعاقدية</span><span className="font-mono font-bold text-xs">{item.contractQuantity || 0}</span></div>
                                                                <div className="flex flex-col"><span className="text-[8px] text-slate-400">السابقة</span><span className="font-mono font-bold text-xs">{item.prevQuantity || 0}</span></div>
                                                                <div className="flex flex-col"><span className="text-[8px] text-green-600 font-bold">الحالية</span><span className="font-mono font-black text-green-700 text-xs">{item.currQuantity || 0}</span></div>
                                                                <div className={`flex flex-col rounded ${quantityColorClass}`}><span className="text-[8px] text-slate-600 font-bold">الإجمالية</span><span className="font-mono font-bold text-xs">{item.totalQuantity || 0}</span></div>
                                                            </div>
                                                            {/* Row 3: Financials */}
                                                            <div className="flex justify-between items-center bg-blue-50/50 rounded p-1 px-2 border border-blue-100">
                                                                <div className="flex gap-1 items-center"><span className="text-slate-500 text-[8px]">الفئة:</span><span className="font-mono font-bold text-xs">{item.unitPrice?.toLocaleString()}</span></div>
                                                                <div className="flex gap-1 items-center"><span className="text-slate-500 text-[8px]">النسبة:</span><span className="font-mono font-bold text-xs">{item.completionRatio || 100}%</span></div>
                                                                <div className="flex gap-1 items-center"><span className="text-slate-500 text-[8px]">الإجمالي:</span><span className="font-mono font-black text-blue-800 text-xs">{item.totalValue?.toLocaleString()}</span></div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ))}
                {masterData.payments.length === 0 && (
                    <div className="text-center py-10 text-slate-400 text-xs" id="empty-payments">لا توجد مستخلصات.</div>
                )}
            </div>

            {/* Confirm Delete Payment Modal */}
            {paymentToDeleteId && (
                <div className="fixed inset-0 z-[1800] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4" id="delete-payment-confirm">
                    <div className="bg-white p-6 rounded-2xl shadow-xl w-full max-w-xs text-center animate-scale-in border border-slate-100">
                        <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-3 text-xl"><i className="fa-solid fa-trash"></i></div>
                        <h4 className="font-bold mb-2 text-slate-800">حذف المستخلص؟</h4>
                        <p className="text-xs text-slate-500 mb-4">سيتم حذف هذا المستخلص نهائياً من الحسابات.</p>
                        <div className="flex gap-3">
                            <button onClick={confirmDeletePayment} className="flex-1 bg-red-600 text-white py-2 rounded-xl font-bold hover:bg-red-700 transition" id="confirm-del-pay-btn">حذف</button>
                            <button onClick={() => setPaymentToDeleteId(null)} className="flex-1 bg-slate-100 text-slate-700 py-2 rounded-xl font-bold hover:bg-slate-200 transition" id="cancel-del-pay-btn">إلغاء</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
