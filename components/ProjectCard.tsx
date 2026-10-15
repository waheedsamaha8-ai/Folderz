
import React, { useState, useRef } from 'react';
import { Project, ProjectStatus } from '../types';
import { categoryService } from '../services/categoryService';

interface ProjectCardProps {
  project: Project;
  onClick: () => void;
  onEdit: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
}

const ProjectCard: React.FC<ProjectCardProps> = ({ project, onClick, onEdit, onDelete }) => {
  const [showMenu, setShowMenu] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [menuPos, setMenuPos] = useState<'bottom' | 'top'>('bottom');
  const btnRef = useRef<HTMLButtonElement>(null);

  // Category Meta Lookup
  const categoryMeta = categoryService.getCategoryById(project.category);

  // Vibrant category color palette matching UI design pictures
  const getCategoryPalette = (cat: typeof categoryMeta) => {
    switch (cat.color) {
      case 'amber':
        return {
          iconBox: 'bg-amber-500 text-white shadow-md shadow-amber-500/30',
          titleColor: 'text-amber-950',
          subTextColor: 'text-amber-900',
          badgeClass: 'bg-amber-600 text-white shadow-xs',
          cardBorder: 'border-amber-300/80',
          gradientBg: 'from-amber-100 via-orange-50 to-amber-200'
        };
      case 'teal':
        return {
          iconBox: 'bg-teal-600 text-white shadow-md shadow-teal-600/30',
          titleColor: 'text-teal-950',
          subTextColor: 'text-teal-900',
          badgeClass: 'bg-teal-600 text-white shadow-xs',
          cardBorder: 'border-teal-300/80',
          gradientBg: 'from-teal-100 via-emerald-50 to-teal-200'
        };
      case 'purple':
        return {
          iconBox: 'bg-purple-600 text-white shadow-md shadow-purple-600/30',
          titleColor: 'text-purple-950',
          subTextColor: 'text-purple-900',
          badgeClass: 'bg-purple-600 text-white shadow-xs',
          cardBorder: 'border-purple-300/80',
          gradientBg: 'from-purple-100 via-indigo-50 to-purple-200'
        };
      case 'emerald':
        return {
          iconBox: 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30',
          titleColor: 'text-emerald-950',
          subTextColor: 'text-emerald-900',
          badgeClass: 'bg-emerald-600 text-white shadow-xs',
          cardBorder: 'border-emerald-300/80',
          gradientBg: 'from-emerald-100 via-green-50 to-emerald-200'
        };
      case 'indigo':
        return {
          iconBox: 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30',
          titleColor: 'text-indigo-950',
          subTextColor: 'text-indigo-900',
          badgeClass: 'bg-indigo-600 text-white shadow-xs',
          cardBorder: 'border-indigo-300/80',
          gradientBg: 'from-indigo-100 via-slate-50 to-indigo-200'
        };
      case 'rose':
        return {
          iconBox: 'bg-rose-500 text-white shadow-md shadow-rose-500/30',
          titleColor: 'text-rose-950',
          subTextColor: 'text-rose-900',
          badgeClass: 'bg-rose-600 text-white shadow-xs',
          cardBorder: 'border-rose-300/80',
          gradientBg: 'from-rose-100 via-red-50 to-rose-200'
        };
      case 'sky':
        return {
          iconBox: 'bg-sky-500 text-white shadow-md shadow-sky-500/30',
          titleColor: 'text-sky-950',
          subTextColor: 'text-sky-900',
          badgeClass: 'bg-sky-600 text-white shadow-xs',
          cardBorder: 'border-sky-300/80',
          gradientBg: 'from-sky-100 via-blue-50 to-sky-200'
        };
      case 'blue':
      default:
        return {
          iconBox: 'bg-blue-600 text-white shadow-md shadow-blue-600/30',
          titleColor: 'text-blue-950',
          subTextColor: 'text-blue-900',
          badgeClass: 'bg-blue-600 text-white shadow-xs',
          cardBorder: 'border-blue-300/80',
          gradientBg: 'from-blue-100 via-slate-50 to-blue-200'
        };
    }
  };

  const palette = getCategoryPalette(categoryMeta);
  const cardBgClass = categoryMeta.bgGradient 
    ? `bg-gradient-to-br ${categoryMeta.bgGradient}`
    : `bg-gradient-to-br ${palette.gradientBg} ${palette.cardBorder}`;

  const toggleExpand = (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsExpanded(!isExpanded);
  };

  const handleAction = (e: React.MouseEvent, action: (e: React.MouseEvent) => void) => {
      e.stopPropagation(); 
      setShowMenu(false); 
      setTimeout(() => { action(e); }, 50); 
  };

  return (
    <div 
      onClick={onClick}
      className={`rounded-3xl shadow-md border-2 cursor-pointer group relative overflow-visible transition-all duration-300 ${cardBgClass} ${isExpanded ? 'p-5 ring-2 ring-black/10 shadow-xl scale-[1.02]' : 'p-4 hover:shadow-lg hover:-translate-y-1'} ${showMenu ? 'z-50' : ''}`}
    >
      {/* Header Row (Always Visible) */}
      <div className="flex justify-between items-start">
        <div className="flex items-start gap-3 overflow-hidden">
             {/* Category Icon with Vivid Palette */}
            <div className={`rounded-2xl flex items-center justify-center transition-all shrink-0 ${palette.iconBox} ${isExpanded ? 'w-14 h-14 text-2xl' : 'w-12 h-12 text-xl'}`}>
                <i className={`fa-solid ${categoryMeta.icon}`}></i>
            </div>
            
            <div className="min-w-0 pt-0.5">
                 <h3 className={`font-black ${palette.titleColor} leading-tight truncate transition-all ${isExpanded ? 'text-lg mb-1' : 'text-base'}`}>
                    {project.name}
                 </h3>
                 {/* Show category and status badges */}
                 {!isExpanded && (
                     <div className="flex flex-col gap-1.5 mt-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`text-[9px] font-extrabold px-2.5 py-0.5 rounded-full whitespace-nowrap ${palette.badgeClass} flex items-center gap-1`}>
                                <i className={`fa-solid ${categoryMeta.icon}`}></i>
                                {categoryMeta.name}
                            </span>
                            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-white/80 text-slate-700 border border-black/5 shadow-2xs flex items-center gap-1">
                                <span className={`w-1.5 h-1.5 rounded-full ${project.status === ProjectStatus.COMPLETED ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
                                {project.status === ProjectStatus.COMPLETED ? 'مكتمل' : 'قيد التنفيذ'}
                            </span>
                        </div>

                        {/* Collapsed Custom Fields Preview */}
                        {project.customFields && project.customFields.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {project.customFields.slice(0, 2).map(f => (
                              <span key={f.id} className="text-[9px] font-bold text-slate-700 bg-white/70 px-1.5 py-0.5 rounded border border-black/5 truncate max-w-[140px]">
                                {f.key}: {f.value}
                              </span>
                            ))}
                            {project.customFields.length > 2 && (
                              <span className="text-[8px] font-bold text-slate-500 bg-white/50 px-1 py-0.5 rounded">
                                +{project.customFields.length - 2}
                              </span>
                            )}
                          </div>
                        )}
                     </div>
                 )}
                 {isExpanded && (
                    <div className="flex gap-2 mt-1 flex-wrap">
                      <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-[9px] font-extrabold whitespace-nowrap ${palette.badgeClass}`}>
                          <i className={`fa-solid ${categoryMeta.icon}`}></i> {categoryMeta.name}
                      </span>
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[9px] font-bold whitespace-nowrap bg-white/90 text-slate-800 border border-black/10">
                          <span className={`w-1.5 h-1.5 rounded-full ${project.status === ProjectStatus.COMPLETED ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
                          {project.status === ProjectStatus.COMPLETED ? 'مكتمل' : 'قيد التنفيذ'}
                      </span>
                    </div>
                 )}
            </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1 shrink-0 -mt-1 -ml-1">
             {/* Toggle Arrow */}
            <button 
                onClick={toggleExpand}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${isExpanded ? 'bg-black/10 text-slate-800 rotate-180' : 'hover:bg-white/40 text-slate-500 hover:text-slate-800'}`}
                title={isExpanded ? "إخفاء التفاصيل" : "عرض التفاصيل"}
            >
                <i className="fa-solid fa-chevron-down text-xs"></i>
            </button>

             {/* Menu Button */}
            <div className="relative z-10">
                <button 
                    ref={btnRef}
                    onClick={(e) => { 
                        e.stopPropagation(); 
                        if (!showMenu && btnRef.current) {
                            const rect = btnRef.current.getBoundingClientRect();
                            const spaceBelow = window.innerHeight - rect.bottom;
                            const spaceAbove = rect.top;
                            setMenuPos((spaceBelow < 180 && spaceAbove > spaceBelow) ? 'top' : 'bottom');
                        }
                        setShowMenu(!showMenu); 
                    }}
                    className="w-8 h-8 rounded-full hover:bg-white/40 flex items-center justify-center text-slate-500 hover:text-slate-800 transition"
                >
                    <i className="fa-solid fa-ellipsis-vertical text-sm"></i>
                </button>
                {showMenu && (
                    <>
                    <div 
                        className="fixed inset-0 z-40" 
                        onClick={(e) => { e.stopPropagation(); setShowMenu(false); }}
                    ></div>
                    <div className={`absolute left-0 ${menuPos === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'} w-36 bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 py-1.5 animate-scale-in ring-1 ring-black/5`}>
                        <button 
                            onClick={(e) => handleAction(e, onEdit)}
                            className="w-full text-right px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2.5 border-b border-slate-100 transition"
                        >
                            <i className="fa-solid fa-pen text-blue-500"></i> تعديل
                        </button>
                        <button 
                            onClick={(e) => handleAction(e, onDelete)}
                            className="w-full text-right px-4 py-2.5 text-xs font-bold text-red-600 hover:bg-red-50 flex items-center gap-2.5 transition"
                        >
                            <i className="fa-solid fa-trash text-red-500"></i> حذف
                        </button>
                    </div>
                    </>
                )}
            </div>
        </div>
      </div>
      
      {/* Expanded Content */}
      {isExpanded && (
        <div className="mt-4 animate-fade-in border-t border-black/10 pt-4 space-y-3">
            {project.location && (
              <div className={`flex items-center gap-2 text-xs ${palette.subTextColor} font-bold`}>
                  <div className="w-6 h-6 rounded-full bg-white/50 flex items-center justify-center shrink-0"><i className="fa-solid fa-location-dot"></i></div>
                  <span className="truncate">{project.location}</span>
              </div>
            )}

            {project.fullDescription && (
              <p className="text-xs text-slate-800 bg-white/80 p-3 rounded-2xl border border-black/5 leading-relaxed font-bold">
                {project.fullDescription}
              </p>
            )}

            {/* Render Custom Fields in Expanded Card */}
            {project.customFields && project.customFields.length > 0 && (
              <div className="space-y-1.5 bg-white/60 p-3 rounded-2xl border border-black/5">
                <div className="text-[11px] font-extrabold text-slate-800 mb-2 flex items-center gap-1.5">
                  <i className="fa-solid fa-list-check text-indigo-600"></i>
                  <span>الخانات والبيانات الخاصة بالحافظة:</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {project.customFields.map(f => (
                    <div key={f.id} className="bg-white p-2.5 rounded-xl border border-slate-200/80 shadow-xs flex justify-between items-center gap-2">
                      <span className="text-[11px] font-extrabold text-slate-500 truncate">{f.key}:</span>
                      <span className="font-bold text-slate-900 text-xs truncate dir-ltr">{f.value || '-'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Optional Dates if specified */}
            {(project.handoverDate || project.completionDate) && (
              <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                {project.handoverDate && (
                  <div className="bg-white/60 p-2.5 rounded-xl border border-black/5 shadow-xs">
                      <div className="text-[10px] text-slate-500 mb-0.5 font-bold">تاريخ الإنشاء / الإضافة</div>
                      <div className="font-bold text-slate-800 font-mono text-xs">{project.handoverDate}</div>
                  </div>
                )}
                {project.completionDate && (
                  <div className="bg-white/60 p-2.5 rounded-xl border border-black/5 shadow-xs">
                      <div className="text-[10px] text-slate-500 mb-0.5 font-bold">تاريخ الانتهاء / الصلاحية</div>
                      <div className="font-bold text-slate-800 font-mono text-xs">{project.completionDate}</div>
                  </div>
                )}
              </div>
            )}
        </div>
      )}
    </div>
  );
};

export default ProjectCard;
