
import React, { useState } from 'react';
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

  // Category Meta Lookup
  const categoryMeta = categoryService.getCategoryById(project.category);

  const getStatusStyle = (status: ProjectStatus) => {
    switch (status) {
      case ProjectStatus.ONGOING: 
        return { 
            cardBg: 'bg-gradient-to-br from-amber-100 via-orange-50 to-amber-200 border-amber-300', 
            badge: 'bg-amber-600 text-white shadow-sm', 
            iconColor: 'text-amber-700 bg-white/70',
            progressColor: 'bg-amber-600',
            textColor: 'text-amber-950',
            subTextColor: 'text-amber-800'
        };
      case ProjectStatus.COMPLETED: 
        return { 
            cardBg: 'bg-gradient-to-br from-emerald-100 via-green-50 to-emerald-200 border-emerald-300', 
            badge: 'bg-emerald-600 text-white shadow-sm', 
            iconColor: 'text-emerald-700 bg-white/70',
            progressColor: 'bg-emerald-600',
            textColor: 'text-emerald-950',
            subTextColor: 'text-emerald-800'
        };
      case ProjectStatus.DESIGN: 
        return { 
            cardBg: 'bg-gradient-to-br from-violet-100 via-purple-50 to-indigo-200 border-violet-300', 
            badge: 'bg-violet-600 text-white shadow-sm', 
            iconColor: 'text-violet-700 bg-white/70',
            progressColor: 'bg-violet-600',
            textColor: 'text-violet-950',
            subTextColor: 'text-violet-800'
        };
      case ProjectStatus.PAUSED: 
        return { 
            cardBg: 'bg-gradient-to-br from-rose-100 via-red-50 to-rose-200 border-rose-300', 
            badge: 'bg-rose-600 text-white shadow-sm', 
            iconColor: 'text-rose-700 bg-white/70',
            progressColor: 'bg-rose-600',
            textColor: 'text-rose-950',
            subTextColor: 'text-rose-800'
        };
      default: 
        return { 
            cardBg: 'bg-gradient-to-br from-slate-100 via-gray-50 to-blue-100 border-slate-300', 
            badge: 'bg-slate-700 text-white shadow-sm', 
            iconColor: 'text-slate-700 bg-white/70',
            progressColor: 'bg-slate-600',
            textColor: 'text-slate-900',
            subTextColor: 'text-slate-700'
        };
    }
  };

  const style = getStatusStyle(project.status);
  const progress = project.calculatedProgress || 0;

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
      className={`rounded-3xl shadow-md border-2 cursor-pointer group relative overflow-visible transition-all duration-300 ${style.cardBg} ${isExpanded ? 'p-5 ring-2 ring-black/10 shadow-xl scale-[1.02]' : 'p-4 hover:shadow-lg hover:-translate-y-1'} ${showMenu ? 'z-50' : ''}`}
    >
      {/* Header Row (Always Visible) */}
      <div className="flex justify-between items-start">
        <div className="flex items-start gap-3 overflow-hidden">
             {/* Category Icon */}
            <div className={`rounded-2xl flex items-center justify-center shadow-inner transition-all shrink-0 ${style.iconColor} ${isExpanded ? 'w-14 h-14 text-2xl' : 'w-12 h-12 text-xl'}`}>
                <i className={`fa-solid ${categoryMeta.icon}`}></i>
            </div>
            
            <div className="min-w-0 pt-0.5">
                 <h3 className={`font-black ${style.textColor} leading-tight truncate transition-all ${isExpanded ? 'text-lg mb-1' : 'text-base'}`}>
                    {project.name}
                 </h3>
                 {/* Show category badge */}
                 {!isExpanded && (
                     <div className="flex flex-col gap-1.5 mt-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full whitespace-nowrap bg-white/80 text-slate-800 border border-black/10 shadow-xs flex items-center gap-1`}>
                                <i className={`fa-solid ${categoryMeta.icon} text-slate-600`}></i>
                                {categoryMeta.name}
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
                      <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-[9px] font-bold whitespace-nowrap bg-white/90 text-slate-900 border border-black/10`}>
                          <i className={`fa-solid ${categoryMeta.icon}`}></i> {categoryMeta.name}
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
                    onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
                    className="w-8 h-8 rounded-full hover:bg-white/40 flex items-center justify-center text-slate-500 hover:text-slate-800 transition"
                >
                    <i className="fa-solid fa-ellipsis-vertical text-sm"></i>
                </button>
                {showMenu && (
                    <>
                    <div 
                        className="fixed inset-0 z-10" 
                        onClick={(e) => { e.stopPropagation(); setShowMenu(false); }}
                    ></div>
                    <div className="absolute left-0 top-full mt-1 w-36 bg-white rounded-xl shadow-2xl border border-slate-100 z-20 py-1 overflow-hidden animate-scale-in ring-1 ring-black/5">
                        <button 
                            onClick={(e) => handleAction(e, onEdit)}
                            className="w-full text-right px-4 py-3 text-xs font-bold text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-3 border-b border-slate-50"
                        >
                            <i className="fa-solid fa-pen text-blue-500"></i> تعديل
                        </button>
                        <button 
                            onClick={(e) => handleAction(e, onDelete)}
                            className="w-full text-right px-4 py-3 text-xs font-bold text-red-600 hover:bg-red-50 flex items-center gap-3"
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
              <div className={`flex items-center gap-2 text-xs ${style.subTextColor} font-bold`}>
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
