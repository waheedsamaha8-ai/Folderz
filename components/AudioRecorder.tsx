import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Trash2, Loader2, FileAudio, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../services/api';

interface AudioRecorderProps {
    projectId: string;
    folderId: string;
    onUploadComplete: () => void;
}

const AudioRecorder: React.FC<AudioRecorderProps> = ({ folderId, onUploadComplete }) => {
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [showOptions, setShowOptions] = useState(false);
    
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, []);

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            chunksRef.current = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data);
            };

            mediaRecorder.onstop = () => {
                const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
                setAudioBlob(blob);
                setShowOptions(true);
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();
            setIsRecording(true);
            setRecordingTime(0);
            timerRef.current = setInterval(() => {
                setRecordingTime(prev => prev + 1);
            }, 1000);
        } catch (err) {
            alert("لا يمكن الوصول للميكروفون. تأكد من منح الصلاحيات.");
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            if (timerRef.current) clearInterval(timerRef.current);
        }
    };

    const handleUploadOnly = async () => {
        if (!audioBlob) return;
        setIsUploading(true);
        try {
            const dateStr = new Date().toLocaleDateString('ar-EG').replace(/\//g, '-');
            const timeStr = new Date().toLocaleTimeString('ar-EG', { hour12: false }).replace(/:/g, '-');
            const fileName = `تسجيل_صوتي_${dateStr}_${timeStr}.webm`;
            const file = new File([audioBlob], fileName, { type: 'audio/webm' });
            await api.uploadFile(folderId, file);
            onUploadComplete();
            reset();
        } catch (e) {
            alert("فشل رفع الملف الصوتي");
        } finally {
            setIsUploading(false);
        }
    };

    const reset = () => {
        setAudioBlob(null);
        setShowOptions(false);
        setRecordingTime(0);
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div className="fixed bottom-6 left-6 z-[100] flex flex-col items-start gap-4">
            <AnimatePresence>
                {showOptions && (
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.8, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.8, y: 20 }}
                        className="bg-white rounded-3xl shadow-2xl border border-slate-200 p-5 w-72 space-y-3"
                    >
                        <div className="flex justify-between items-center mb-1">
                            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                                <FileAudio size={18} className="text-indigo-600" />
                                تم التسجيل ({formatTime(recordingTime)})
                            </h3>
                            <button onClick={reset} className="text-slate-400 hover:text-red-500 transition">
                                <Trash2 size={18} />
                            </button>
                        </div>

                        <div className="grid grid-cols-1 gap-2">
                            <button 
                                onClick={handleUploadOnly}
                                disabled={isUploading}
                                className="flex items-center justify-center gap-2 p-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 transition text-white text-xs font-bold shadow-md disabled:opacity-50"
                            >
                                {isUploading ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                                {isUploading ? 'جاري الحفظ...' : 'حفظ المقطع في المجلد'}
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <button 
                onClick={isRecording ? stopRecording : startRecording}
                className={`w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-all transform active:scale-95 ${
                    isRecording ? "bg-red-500 text-white animate-pulse" : "bg-indigo-600 text-white hover:bg-indigo-700"
                }`}
                title={isRecording ? "إيقاف التسجيل" : "تسجيل مقطع صوتي"}
            >
                {isRecording ? (
                    <div className="flex flex-col items-center">
                        <Square size={20} fill="white" />
                        <span className="text-[9px] font-bold mt-0.5">{formatTime(recordingTime)}</span>
                    </div>
                ) : (
                    <Mic size={24} />
                )}
            </button>
        </div>
    );
};

export default AudioRecorder;
