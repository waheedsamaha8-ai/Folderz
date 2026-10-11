
// @ts-nocheck
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import ProjectCard from '../components/ProjectCard';
import FileItemRow from '../components/FileItemRow';
import FileViewer from '../components/FileViewer';
import ProjectMap from '../components/ProjectMap'; 
import ConfirmModal from '../components/ConfirmModal'; 
import { api } from '../services/api';
import { printService } from '../services/printService';
import { Project, ProjectStatus, FileItem, ProjectLog, PortfolioCategory, PortfolioCustomField } from '../types';
import { categoryService } from '../services/categoryService';
import CategoryManagerModal from '../components/CategoryManagerModal';
import LocationPickerModal from '../components/LocationPickerModal';
import { AuthPage } from '../components/AuthPage';
import { auth } from '../services/firebaseConfig';
import { onAuthStateChanged } from 'firebase/auth';
import { ENGINEERING_TIPS_DB, getCategoryLabel, getArchiveSectionForCategory } from '../services/tipsData';
import SettingsModal from '../components/SettingsModal';

const SkeletonCard = () => (
    <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 h-[80px] animate-pulse flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-slate-200"></div>
        <div className="flex-1 space-y-2">
            <div className="h-4 w-1/2 bg-slate-200 rounded"></div>
        </div>
    </div>
);

const getRandomUniqueTip = (availableTips: Record<string, string[]>) => {
    const keys = Object.keys(availableTips);
    if (keys.length === 0) return { tip: "مرحباً بك في تطبيق الحافظة", category: "عام", key: "general" };

    const randomKey = keys[Math.floor(Math.random() * keys.length)];
    const tipsList = availableTips[randomKey];
    const randomTip = tipsList[Math.floor(Math.random() * tipsList.length)];
    
    return { tip: randomTip, category: getCategoryLabel(randomKey), key: randomKey };
};

const Dashboard: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(() => api.isAuthenticated());
  const [projects, setProjects] = useState<Project[]>(() => api.getSyncProjects());
  const [categories, setCategories] = useState(() => categoryService.getAllCategories());
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [currentTip, setCurrentTip] = useState(() => getRandomUniqueTip(ENGINEERING_TIPS_DB));
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  
  const [loading, setLoading] = useState(() => {
      const hasData = api.getSyncProjects().length > 0;
      return !hasData;
  });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();
  const [foundFiles, setFoundFiles] = useState<FileItem[]>([]);
  const [isSearchingFiles, setIsSearchingFiles] = useState(false);
  const [previewItem, setPreviewItem] = useState<FileItem | null>(null);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  
  // Delete States
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);

  const [tipOfTheDay, setTipOfTheDay] = useState(currentTip.tip);
  const [tipCategory, setTipCategory] = useState(currentTip.category);
  const [tipKey, setTipKey] = useState(currentTip.key);

  const [isExplainModalOpen, setIsExplainModalOpen] = useState(false);
  const [explainContent, setExplainContent] = useState<string>('');
  const [isExplaining, setIsExplaining] = useState(false);
  
  const [isGeneratingFreshTip, setIsGeneratingFreshTip] = useState(false);
  const [isOpeningArchive, setIsOpeningArchive] = useState(false);
  const [isSavingToArchive, setIsSavingToArchive] = useState(false);
  
  const [viewMode, setViewMode] = useState<'grid' | 'map'>('grid');
  
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  const isIframe = typeof window !== 'undefined' ? window.self !== window.top : false;

  const initialProjectState = {
    name: '',
    category: 'general' as PortfolioCategory,
    location: '',
    lat: undefined as number | undefined,
    lng: undefined as number | undefined,
    status: ProjectStatus.ONGOING,
    fullDescription: '',
    customFields: [] as PortfolioCustomField[]
  };
  const [projectForm, setProjectForm] = useState(initialProjectState);

  // Sync category changes
  useEffect(() => {
    const handleCategoriesChanged = () => {
      setCategories(categoryService.getAllCategories());
    };
    window.addEventListener('app-categories-changed', handleCategoriesChanged);
    return () => window.removeEventListener('app-categories-changed', handleCategoriesChanged);
  }, []);

  // Intercept mobile back button to dismiss open modals first
  useEffect(() => {
    const handleBackButton = (e: Event) => {
      if (showSettingsModal) {
        setShowSettingsModal(false);
        e.preventDefault();
        return;
      }
      if (previewItem) {
        setPreviewItem(null);
        e.preventDefault();
        return;
      }
      if (isModalOpen) {
        setIsModalOpen(false);
        e.preventDefault();
        return;
      }
      if (projectToDelete) {
        setProjectToDelete(null);
        e.preventDefault();
        return;
      }
      if (showCategoryManager) {
        setShowCategoryManager(false);
        e.preventDefault();
        return;
      }
      if (showLocationPicker) {
        setShowLocationPicker(false);
        e.preventDefault();
        return;
      }
      if (isExplainModalOpen) {
        setIsExplainModalOpen(false);
        e.preventDefault();
        return;
      }
      if (isCategoryDropdownOpen) {
        setIsCategoryDropdownOpen(false);
        e.preventDefault();
        return;
      }
    };
    window.addEventListener('app-back-button', handleBackButton);
    return () => window.removeEventListener('app-back-button', handleBackButton);
  }, [showSettingsModal, previewItem, isModalOpen, projectToDelete, showCategoryManager, showLocationPicker, isExplainModalOpen, isCategoryDropdownOpen]);

  useEffect(() => {
      const checkAuth = async () => {
          // Try to init auth immediately
          if (typeof google !== 'undefined') { api.initAuth(); }
          
          let attempts = 0;
          const interval = setInterval(() => {
              attempts++;
              if (typeof google !== 'undefined') {
                  api.initAuth();
                  clearInterval(interval);
              } else if (attempts > 10) {
                  clearInterval(interval);
              }
          }, 500);

          const isAuth = api.isAuthenticated();
          setIsAuthenticated(isAuth);
          
          if (isAuth) { 
              await fetchData(); 
          } else { 
              setLoading(false); 
          }
      };
      checkAuth();

      const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
          if (currentUser || api.isAuthenticated()) {
              setIsAuthenticated(true);
              fetchData();
          } else if (localStorage.getItem('app_user_logged_out') === 'true') {
              setIsAuthenticated(false);
              setLoading(false);
          } else {
              // Ensure loading resolves cleanly
              setLoading(false);
          }
      });

      return () => unsubscribe();
  }, []);

  const handleLogin = () => { api.signIn(); };
  
  const fetchData = async () => {
    try {
        const localData = await api.getLocalProjects();
        setProjects(localData);
    } catch(e) { /* Ignore local fetch error */ }
    setLoading(false); // Instantly unlock UI so mobile & desktop refresh enter immediately

    try {
      const projectsData = await api.getProjects();
      if (projectsData) setProjects(projectsData);
    } catch (error) { 
        console.error("Fetch Error:", error); 
    } finally { 
        setLoading(false); 
    }
  };

  useEffect(() => {
      if (!isAuthenticated) return;
      fetchData();
      const handleDataChanged = () => {
        fetchData();
      };
      window.addEventListener('app-data-changed', handleDataChanged);
      window.addEventListener('online', handleDataChanged);
      return () => {
        window.removeEventListener('app-data-changed', handleDataChanged);
        window.removeEventListener('online', handleDataChanged);
      };
  }, [isAuthenticated]);

  useEffect(() => {
      if (!isAuthenticated) return;
      const doSearch = async () => {
          if (!searchQuery.trim()) { setFoundFiles([]); return; }
          setIsSearchingFiles(true);
          try { const files = await api.searchFiles(searchQuery); setFoundFiles(files); } catch (e) { console.error(e); } finally { setIsSearchingFiles(false); }
      };
      const debounce = setTimeout(doSearch, 300);
      return () => clearTimeout(debounce);
  }, [searchQuery, isAuthenticated]);

  const openCreateModal = () => { 
    setModalMode('create'); 
    setProjectForm(initialProjectState); 
    setIsModalOpen(true); 
  };
  
  const openEditModal = (e: React.MouseEvent, project: Project) => { 
      e.stopPropagation(); 
      setModalMode('edit'); 
      setEditingProjectId(project.id); 
      setProjectForm({ 
          name: project.name, 
          category: project.category || 'general',
          location: project.location || '',
          lat: project.lat,
          lng: project.lng,
          status: project.status, 
          fullDescription: project.fullDescription || '',
          customFields: project.customFields ? [...project.customFields] : []
      }); 
      setIsModalOpen(true); 
  };

  const handleAddCustomField = () => {
    setProjectForm(prev => ({
      ...prev,
      customFields: [...(prev.customFields || []), { id: 'field_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4), key: '', value: '' }]
    }));
  };

  const handleRemoveCustomField = (id: string) => {
    setProjectForm(prev => ({
      ...prev,
      customFields: (prev.customFields || []).filter(f => f.id !== id)
    }));
  };

  const handleCustomFieldChange = (id: string, prop: 'key' | 'value', val: string) => {
    setProjectForm(prev => ({
      ...prev,
      customFields: (prev.customFields || []).map(f => f.id === id ? { ...f, [prop]: val } : f)
    }));
  };

  const handleQuickAddTemplateFields = (keys: string[]) => {
    setProjectForm(prev => {
      const existingKeys = new Set((prev.customFields || []).map(f => f.key));
      const newFields = [...(prev.customFields || [])];
      keys.forEach(k => {
        if (!existingKeys.has(k)) {
          newFields.push({ id: 'field_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4), key: k, value: '' });
        }
      });
      return { ...prev, customFields: newFields };
    });
  };

  const safeEval = (str: string): number => {
      try {
          if (!str) return 0;
          if (/[^0-9+\-*/.() ]/.test(str)) return parseFloat(str) || 0;
          // eslint-disable-next-line no-new-func
          const result = new Function('return ' + str)();
          return Math.round(Number(result));
      } catch {
          return 0;
      }
  };

  const calculateDate = (startStr: string, daysStr: string) => {
      if (!startStr) return '';
      const start = new Date(startStr);
      const days = safeEval(daysStr);
      if (isNaN(days)) return '';
      start.setDate(start.getDate() + days);
      return start.toISOString().split('T')[0];
  };

  const handleHandoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newHandoverDate = e.target.value;
      setProjectForm(prev => {
          const completion = calculateDate(newHandoverDate, prev.durationDays);
          return { ...prev, handoverDate: newHandoverDate, completionDate: completion };
      });
  };

  const handleDurationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setProjectForm(prev => ({ ...prev, durationDays: val }));
      if (!isNaN(Number(val)) && val.trim() !== '') {
           setProjectForm(prev => {
              const completion = calculateDate(prev.handoverDate, val);
              return { ...prev, durationDays: val, completionDate: completion };
           });
      }
  };

  const handleDurationBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      const val = e.target.value;
      const result = safeEval(val);
      if (!isNaN(result) && result > 0) {
          setProjectForm(prev => {
             const completion = calculateDate(prev.handoverDate, result.toString());
             return { ...prev, durationDays: result.toString(), completionDate: completion };
          });
      }
  };

  const handleSaveProject = async (e: React.FormEvent) => { e.preventDefault(); if (!projectForm.name) return; setIsModalOpen(false); if (modalMode === 'create') { try { await api.createProject(projectForm); fetchData(); } catch (err) { alert("حدث خطأ"); } } else if (modalMode === 'edit' && editingProjectId) { try { await api.updateProject(editingProjectId, projectForm); fetchData(); } catch (err) { alert("تعذر تحديث البيانات"); } } };
  
  // Updated Handler to trigger Modal
  const handleDeleteProjectClick = (e: React.MouseEvent, project: Project) => { 
      e.stopPropagation(); 
      setProjectToDelete(project);
  };

  const confirmDeleteProject = async () => {
      if (!projectToDelete) return;
      const id = projectToDelete.id;
      const name = projectToDelete.name;
      const backup = [...projects]; 
      setProjects(prev => prev.filter(p => p.id !== id)); 
      try { 
          await api.deleteProject(id, name); 
      } catch (err) { 
          alert("فشل الحذف"); 
          setProjects(backup); 
      } finally {
          setProjectToDelete(null);
      }
  };

  const handleFileClick = (item: FileItem) => { if (item.mimeType === 'text/html' || item.name.endsWith('.html')) navigate(`/editor/${item.parentId}?fileId=${item.id}`); else setPreviewItem(item); };

  const [isTipSaved, setIsTipSaved] = useState(false);
  const [savedTipFile, setSavedTipFile] = useState<{id: string, parentId: string} | null>(null);

  // Check if tip is saved
  const checkTipStatus = useCallback(async () => {
      if (!tipOfTheDay) return;
      const title = tipOfTheDay.length > 50 ? tipOfTheDay.substring(0, 50) + "..." : tipOfTheDay;
      const fileName = `شرح معلومة: ${title}`;
      const found = await api.findFileByName(fileName);
      if (found) {
          setIsTipSaved(true);
          setSavedTipFile(found);
      } else {
          setIsTipSaved(false);
          setSavedTipFile(null);
      }
  }, [tipOfTheDay]);

  useEffect(() => {
      checkTipStatus();
      const handleDataChanged = () => checkTipStatus();
      window.addEventListener('app-data-changed', handleDataChanged);
      return () => window.removeEventListener('app-data-changed', handleDataChanged);
  }, [checkTipStatus]);

  const handleExplainTip = async () => { 
      if (isTipSaved && savedTipFile) {
          navigate(`/editor/${savedTipFile.parentId}?fileId=${savedTipFile.id}`);
          return;
      }
      setIsExplainModalOpen(true); 
      setIsExplaining(false); 
      const categoryLabel = getCategoryLabel(tipKey);
      setExplainContent(`
          <div style="font-family: 'Tajawal', sans-serif; direction: rtl; line-height: 1.8; color: #1e293b; padding: 16px;">
              <div style="background: #f8fafc; border-right: 4px solid #2563eb; padding: 14px 18px; border-radius: 8px; margin-bottom: 16px; border: 1px solid #e2e8f0;">
                  <h3 style="color: #1e3a8a; margin: 0 0 8px 0; font-size: 1.15rem; font-weight: 700;">📌 معلومة هندسية: ${categoryLabel}</h3>
                  <p style="font-size: 1.05rem; font-weight: 600; margin: 0; color: #0f172a;">${tipOfTheDay}</p>
              </div>
              <h4 style="color: #0f172a; margin-top: 16px; font-weight: 700;">🔍 إرشادات وتوصيات فنية:</h4>
              <ul style="padding-right: 20px; color: #334155;">
                  <li>التحقق من مطابقة المواصفات الفنية المعتمدة للمشروع وأكواد التنفيذ السارية.</li>
                  <li>مراجعة تقرير المهندس المشرف واستلام الأعمال طبقاً للأصول الهندسية المعتمدة.</li>
                  <li>توثيق خطوات التنفيذ في سجل الأعمال واليوميات لضمان جودة الأداء والمطابقة.</li>
              </ul>
          </div>
      `); 
  };
  
  const handleSaveTipToArchive = async () => { 
      if (!explainContent) return; 
      setIsSavingToArchive(true); 
      try { 
          const title = tipOfTheDay.length > 50 ? tipOfTheDay.substring(0, 50) + "..." : tipOfTheDay; 
          const section = getArchiveSectionForCategory(tipKey);
          const fileId = await api.saveToArchive(`شرح معلومة: ${title}`, explainContent, section); 
          alert(`تم حفظ الشرح بنجاح في قسم: ${section}`); 
          checkTipStatus(); // Update status immediately
      } catch(e) { 
          alert("حدث خطأ أثناء الحفظ."); 
      } finally { 
          setIsSavingToArchive(false); 
      } 
  };
  
  const handleGenerateFreshTip = () => { 
      setIsGeneratingFreshTip(true); 
      try { 
          const selected = getRandomUniqueTip(ENGINEERING_TIPS_DB); 
          setTipOfTheDay(selected.tip); 
          setTipCategory(selected.category); 
          setTipKey(selected.key);
      } finally { 
          setIsGeneratingFreshTip(false); 
      } 
  };
  
  const handleOpenArchive = async () => { 
      if (isOpeningArchive) return; 
      setIsOpeningArchive(true); 
      try { 
          const archiveId = await api.getArchiveFolderId(); 
          if (archiveId) { 
              navigate(`/archive/${archiveId}`, { state: { folderName: 'الأرشيف الهندسي' } }); 
          } 
      } catch(e) { console.error(e); } finally { setIsOpeningArchive(false); } 
  };

  const filteredProjects = useMemo(() => { 
    let list = projects;
    if (selectedCategory !== 'all') {
      list = list.filter(p => (p.category || 'general') === selectedCategory);
    }
    if (searchQuery) {
      list = list.filter(p => 
        (p.name || '').includes(searchQuery) || 
        (p.contractor || '').includes(searchQuery) || 
        (p.location || '').includes(searchQuery)
      );
    }
    return list;
  }, [projects, searchQuery, selectedCategory]);

  const handlePrint = (content: string) => { printService.printReport(content, "تقرير مرجع خبير الحافظة", "TIP-REF"); };

  if (!isAuthenticated && !loading) { 
      return ( 
        <AuthPage 
            onAuthSuccess={async () => {
                setIsAuthenticated(true);
                setLoading(true);
                await fetchData();
            }} 
        />
      ); 
  }

  return (
    <Layout navActions={
      <div className="flex gap-2">
        <button 
          onClick={() => setShowSettingsModal(true)} 
          className="bg-white/10 text-white px-3 py-1.5 rounded-lg text-xs hover:bg-white/20 transition flex items-center gap-1.5 font-bold shadow-xs cursor-pointer" 
          title="الإعدادات"
        >
          <i className="fa-solid fa-gear text-sm"></i>
          <span>الإعدادات</span>
        </button>
      </div>
    }>

      {/* Full Screen Map Overlay - Rendered when viewMode is 'map' */}
      {viewMode === 'map' && (
          <div className="fixed inset-0 z-[2000] bg-slate-900 animate-fade-in flex flex-col">
              <div className="flex-1 w-full h-full relative">
                  <ProjectMap 
                    projects={filteredProjects} 
                    onProjectClick={(id) => navigate(`/project/${id}`)} 
                    isFullScreen={true}
                    onClose={() => setViewMode('grid')}
                  />
              </div>
          </div>
      )}

      {/* Search & Action Bar */}
      <div className="mb-4 relative animate-fade-in z-20 mt-1 flex gap-2 items-center">
          <button 
            onClick={() => setViewMode('map')} 
            className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg transition transform hover:-translate-y-1 bg-white text-slate-700 hover:bg-slate-50 shrink-0`}
            title="عرض الخريطة والمواقع"
          >
              <i className={`fa-solid fa-map-location-dot text-lg`}></i>
          </button>

          <div className="relative flex-1">
              <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none"><i className="fa-solid fa-search text-slate-400"></i></div>
              <input type="text" placeholder="بحث شامل في كافة الحافظات والملفات والمستندات..." className="w-full pr-10 pl-4 py-3 rounded-2xl border-none shadow-sm focus:ring-2 focus:ring-blue-500 outline-none transition bg-white text-slate-900 font-bold text-sm" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
              {isSearchingFiles && <div className="absolute inset-y-0 left-0 pl-4 flex items-center"><i className="fa-solid fa-circle-notch fa-spin text-blue-500"></i></div>}
          </div>

          <button 
            onClick={openCreateModal} 
            className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white font-bold h-12 px-4 rounded-2xl shadow-lg hover:brightness-110 transition flex items-center gap-2 shrink-0 text-xs sm:text-sm"
          >
              <i className="fa-solid fa-plus text-sm"></i>
              <span className="hidden sm:inline">حافظة جديدة</span>
          </button>
      </div>

      {/* Categories Horizontal Filter Pills */}
      <div className="flex gap-2 items-center overflow-x-auto pb-3 mb-2 custom-scrollbar text-xs font-bold no-print">
          <button 
            onClick={() => setSelectedCategory('all')} 
            className={`px-4 py-2 rounded-2xl transition whitespace-nowrap shadow-xs flex items-center gap-1.5 ${selectedCategory === 'all' ? 'bg-slate-900 text-white shadow-md' : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'}`}
          >
              <i className="fa-solid fa-layer-group text-yellow-400"></i>
              <span>الكل ({projects.length})</span>
          </button>

          {categories.map(cat => {
            const count = projects.filter(p => (p.category || 'general') === cat.id).length;
            return (
              <button 
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3.5 py-2 rounded-2xl transition whitespace-nowrap shadow-xs flex items-center gap-1.5 ${selectedCategory === cat.id ? 'bg-slate-900 text-white shadow-md' : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'}`}
              >
                <i className={`fa-solid ${cat.icon}`}></i>
                <span>{cat.name}</span>
                {count > 0 && (
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${selectedCategory === cat.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}

          <button
            onClick={() => setShowCategoryManager(true)}
            className="px-3 py-2 rounded-2xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition whitespace-nowrap shadow-xs flex items-center gap-1 shrink-0"
            title="إدارة أنواع وتصنيفات الحافظة"
          >
            <i className="fa-solid fa-sliders text-indigo-600"></i>
            <span>إدارة التصنيفات</span>
          </button>
      </div>

      <div className="grid grid-cols-1 gap-4">
            <div>
                {/* Section Header */}
                <div className="flex justify-between items-center mb-3">
                    <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                        <i className="fa-solid fa-folder-open text-amber-600"></i>
                        {searchQuery ? 'نتائج البحث' : (selectedCategory === 'all' ? 'حافظاتك الحالية' : `حافظة: ${categoryService.getCategoryById(selectedCategory)?.name}`)}
                    </h3>
                    <span className="text-xs text-slate-500 font-bold">
                      {filteredProjects.length} حافظة
                    </span>
                </div>

                <div className="animate-fade-in mb-4">
                    {loading && projects.length === 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"><SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard /></div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {filteredProjects.map(project => (
                              <ProjectCard 
                                key={project.id} 
                                project={project} 
                                onClick={() => {
                                  try {
                                    localStorage.setItem(`project_name_${project.id}`, project.name);
                                    localStorage.setItem(`folder_name_${project.id}`, project.name);
                                  } catch(e) {}
                                  navigate(`/project/${project.id}`, { state: { folderName: project.name, projectName: project.name } });
                                }} 
                                onEdit={(e) => openEditModal(e, project)} 
                                onDelete={(e) => handleDeleteProjectClick(e, project)} 
                              />
                            ))}
                            {filteredProjects.length === 0 && !loading && (
                              <div onClick={openCreateModal} className="col-span-1 sm:col-span-2 lg:col-span-3 border-2 border-dashed border-slate-300 rounded-3xl p-10 flex flex-col items-center justify-center text-slate-400 hover:border-blue-500 hover:text-blue-600 cursor-pointer bg-white/60 transition group">
                                  <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center text-2xl mb-3 shadow-inner group-hover:scale-110 transition-transform">
                                    <i className="fa-solid fa-folder-plus"></i>
                                  </div>
                                  <p className="font-extrabold text-slate-800 text-sm mb-1">لا توجد حافظة بهذا التصنيف حتى الآن</p>
                                  <p className="text-xs text-slate-500">اضغط هنا لإنشاء حافظة جديدة واختيار أو إنشاء التصنيف المناسب</p>
                              </div>
                            )}
                        </div>
                    )}
                </div>
                
                {searchQuery && (
                  <div className="animate-fade-in space-y-2">
                    <h3 className="text-sm font-black text-black mb-2 pt-4 border-t border-slate-200 flex items-center gap-2">
                      المستندات والملفات المتطابقة ({foundFiles.length})
                    </h3>
                    {foundFiles.length > 0 ? foundFiles.map(file => <FileItemRow key={file.id} item={file} onClick={() => handleFileClick(file)} onDelete={() => {}} />) : <div className="p-10 text-center text-slate-400 bg-white rounded-3xl border border-dashed border-slate-200">لا توجد مستندات تطابق بحثك</div>}
                  </div>
                )}
            </div>
        </div>

      {/* Portfolio Create / Edit Modal - Ultra Compact */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 z-[200] flex items-center justify-center backdrop-blur-sm p-3 animate-fade-in">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-scale-in border border-slate-100 flex flex-col max-h-[85vh]">
            <div className="px-4 py-2.5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex justify-between items-center shrink-0">
              <h3 className="font-extrabold text-xs sm:text-sm flex items-center gap-2">
                <i className="fa-solid fa-folder-plus text-yellow-400 text-xs"></i>
                {modalMode === 'create' ? 'إنشاء حافظة جديدة' : 'تعديل بيانات الحافظة'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition text-xs">
                <i className="fa-solid fa-times"></i>
              </button>
            </div>

            <form onSubmit={handleSaveProject} className="p-3.5 space-y-2.5 overflow-y-auto flex-1 text-xs">
              <div>
                <label className="block text-[11px] font-extrabold text-slate-800 mb-1">اسم الحافظة *</label>
                <input 
                  type="text" 
                  required 
                  className="w-full h-8 px-2.5 bg-slate-50 rounded-lg border border-slate-200 outline-none focus:ring-1 focus:ring-indigo-600 transition text-slate-900 font-bold text-xs" 
                  value={projectForm.name} 
                  onChange={e => setProjectForm({...projectForm, name: e.target.value})} 
                  placeholder="مثال: أوراق شخصية / عقود وإيجارات / مشروعات الشركة" 
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-[11px] font-extrabold text-slate-800">نوع وتصنيف الحافظة</label>
                  <button
                    type="button"
                    onClick={() => setShowCategoryManager(true)}
                    className="text-[9.5px] font-bold text-indigo-600 hover:underline flex items-center gap-0.5"
                  >
                    <i className="fa-solid fa-plus-circle"></i>
                    <span>إدارة التصنيفات</span>
                  </button>
                </div>
                <div className="relative">
                  {(() => {
                    const currentSelectedCat = categories.find(c => c.id === (projectForm.category || 'general')) || categories[0] || {
                      id: 'general',
                      name: 'عام ومتنوع',
                      description: 'مستندات وأوراق عامة',
                      icon: 'fa-folder',
                      color: 'blue'
                    };
                    return (
                      <>
                        <button
                          type="button"
                          onClick={() => setIsCategoryDropdownOpen(!isCategoryDropdownOpen)}
                          className="w-full h-8 px-2.5 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 outline-none focus:ring-1 focus:ring-indigo-600 transition flex items-center justify-between text-right cursor-pointer"
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <div className="w-5 h-5 rounded bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0 text-[10px]">
                              <i className={`fa-solid ${currentSelectedCat.icon || 'fa-folder'}`}></i>
                            </div>
                            <div className="flex items-center gap-2 min-w-0 text-right">
                              <span className="text-xs font-bold text-slate-800 truncate">
                                {currentSelectedCat.name}
                              </span>
                              <span className="text-[9.5px] text-slate-400 font-normal truncate">
                                ({currentSelectedCat.description || 'تصنيف مخصص'})
                              </span>
                            </div>
                          </div>
                          <i className={`fa-solid fa-chevron-down text-slate-400 text-[10px] transition-transform duration-200 ${isCategoryDropdownOpen ? 'rotate-180' : ''}`}></i>
                        </button>

                        {isCategoryDropdownOpen && (
                          <>
                            <div 
                              className="fixed inset-0 z-40" 
                              onClick={() => setIsCategoryDropdownOpen(false)}
                            />
                            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl z-50 max-h-44 overflow-y-auto divide-y divide-slate-100 animate-scale-in">
                              {categories.map(cat => {
                                const isSelected = (projectForm.category || 'general') === cat.id;
                                return (
                                  <button
                                    key={cat.id}
                                    type="button"
                                    onClick={() => {
                                      setProjectForm({...projectForm, category: cat.id as PortfolioCategory});
                                      setIsCategoryDropdownOpen(false);
                                    }}
                                    className={`w-full py-1.5 px-2 flex items-center justify-between text-right transition ${isSelected ? 'bg-indigo-50/70' : 'hover:bg-slate-50'}`}
                                  >
                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                      <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 text-[10px] ${isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                                        <i className={`fa-solid ${cat.icon || 'fa-folder'}`}></i>
                                      </div>
                                      <div className="flex items-center gap-1.5 min-w-0 text-right">
                                        <span className={`text-xs font-bold ${isSelected ? 'text-indigo-900 font-extrabold' : 'text-slate-800'}`}>
                                          {cat.name}
                                        </span>
                                        <span className="text-[9px] text-slate-400 font-normal truncate">
                                          - {cat.description || 'تصنيف مخصص'}
                                        </span>
                                      </div>
                                    </div>
                                    {isSelected && (
                                      <i className="fa-solid fa-check text-indigo-600 text-[10px] shrink-0 mr-1"></i>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-extrabold text-slate-800 mb-1">العنوان / الموقع (اختياري)</label>
                <div className="flex gap-1.5">
                  <div className="relative flex-1">
                    <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center pointer-events-none text-slate-400 text-xs">
                      <i className="fa-solid fa-location-dot"></i>
                    </div>
                    <input 
                      type="text" 
                      className="w-full h-8 pr-7 pl-2 bg-slate-50 rounded-lg border border-slate-200 outline-none focus:ring-1 focus:ring-indigo-600 transition text-slate-900 font-bold text-xs" 
                      value={projectForm.location} 
                      onChange={e => setProjectForm({...projectForm, location: e.target.value})} 
                      placeholder="العنوان أو الموقع على الخريطة..." 
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowLocationPicker(true)}
                    className="h-8 px-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-extrabold transition flex items-center gap-1 shrink-0 shadow-xs"
                    title="تحديد العنوان والموقع على الخريطة"
                  >
                    <i className="fa-solid fa-map-location-dot text-indigo-600"></i>
                    <span>الخريطة</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-extrabold text-slate-800 mb-1">ملاحظات / وصف الحافظة (اختياري)</label>
                <textarea 
                  rows={1.5}
                  className="w-full p-2 bg-slate-50 rounded-lg border border-slate-200 outline-none focus:ring-1 focus:ring-indigo-600 transition text-slate-900 text-xs font-bold" 
                  value={projectForm.fullDescription} 
                  onChange={e => setProjectForm({...projectForm, fullDescription: e.target.value})} 
                  placeholder="وصف موجز لهذه الحافظة..." 
                />
              </div>

              {/* Dynamic Custom Fields Section */}
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 space-y-2">
                <div className="flex justify-between items-center">
                  <h4 className="font-extrabold text-[11px] text-slate-800 flex items-center gap-1">
                    <i className="fa-solid fa-list-check text-indigo-600"></i>
                    <span>الخانات الخاصة بالحافظة</span>
                  </h4>
                  <button
                    type="button"
                    onClick={handleAddCustomField}
                    className="w-6 h-6 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-xs transition flex items-center justify-center shrink-0 text-xs"
                    title="إضافة خانة"
                  >
                    <i className="fa-solid fa-plus"></i>
                  </button>
                </div>

                {/* Template Quick Suggestions */}
                <div className="flex items-center gap-1 overflow-x-auto pb-0.5 text-[9.5px] font-bold hide-scrollbar">
                  <span className="text-slate-400 shrink-0">اقتراحات:</span>
                  <button
                    type="button"
                    onClick={() => handleQuickAddTemplateFields(['رقم الهوية / الإقامة', 'تاريخ الانتهاء', 'مكان الاصدار'])}
                    className="bg-white hover:bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded border border-slate-200 shrink-0 transition"
                  >
                    + أوراق شخصية
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickAddTemplateFields(['رقم العقد', 'الجهة المتعاقد معها', 'المبلغ / القيمة'])}
                    className="bg-white hover:bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded border border-slate-200 shrink-0 transition"
                  >
                    + عقود
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickAddTemplateFields(['رقم الصك', 'اسم المالك', 'المساحة / العنوان'])}
                    className="bg-white hover:bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded border border-slate-200 shrink-0 transition"
                  >
                    + عقارات
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickAddTemplateFields(['رقم الحساب / IBAN', 'اسم البنك', 'الفرع'])}
                    className="bg-white hover:bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded border border-slate-200 shrink-0 transition"
                  >
                    + بنوك
                  </button>
                </div>

                {/* List of Dynamic Custom Fields */}
                <div className="space-y-1.5 pt-0.5">
                  {(!projectForm.customFields || projectForm.customFields.length === 0) ? (
                    <div className="p-2 text-center text-slate-400 bg-white rounded-lg border border-dashed border-slate-200 text-[10px] font-bold">
                      لا توجد خانات خاصة مضافة بعد. اضغط (+) للإضافة.
                    </div>
                  ) : (
                    projectForm.customFields.map((field) => (
                      <div key={field.id} className="flex items-center gap-1.5 bg-white p-1.5 rounded-lg border border-slate-200">
                        <input
                          type="text"
                          value={field.key}
                          onChange={e => handleCustomFieldChange(field.id, 'key', e.target.value)}
                          placeholder="اسم الخانة"
                          className="w-1/2 h-7 px-2 bg-slate-50 border border-slate-200 rounded text-xs outline-none focus:border-indigo-600 font-bold"
                        />
                        <input
                          type="text"
                          value={field.value}
                          onChange={e => handleCustomFieldChange(field.id, 'value', e.target.value)}
                          placeholder="قيمة الخانة"
                          className="w-1/2 h-7 px-2 bg-slate-50 border border-slate-200 rounded text-xs outline-none focus:border-indigo-600 font-bold"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveCustomField(field.id)}
                          className="w-7 h-7 rounded bg-red-50 text-red-500 hover:bg-red-100 flex items-center justify-center shrink-0 transition text-xs"
                          title="حذف الخانة"
                        >
                          <i className="fa-solid fa-trash text-[10px]"></i>
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <button type="submit" className="w-full bg-slate-900 hover:bg-slate-800 text-white h-9 rounded-xl font-bold shadow-md transition transform active:scale-95 flex items-center justify-center gap-1.5 text-xs mt-1">
                <i className="fa-solid fa-save"></i> 
                {modalMode === 'create' ? 'حفظ وإنشاء الحافظة' : 'حفظ التعديلات'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Category Manager Modal */}
      <CategoryManagerModal
        isOpen={showCategoryManager}
        onClose={() => setShowCategoryManager(false)}
      />

      {/* Location Picker Modal */}
      <LocationPickerModal
        isOpen={showLocationPicker}
        onClose={() => setShowLocationPicker(false)}
        initialAddress={projectForm.location}
        initialLat={projectForm.lat}
        initialLng={projectForm.lng}
        onConfirm={(address, coords) => {
          setProjectForm(prev => ({
            ...prev,
            location: address,
            lat: coords.lat,
            lng: coords.lng
          }));
        }}
      />

      {/* Confirm Delete Modals */}
      <ConfirmModal 
        isOpen={!!projectToDelete}
        title="حذف الحافظة"
        message={`تحذير هام! هل أنت متأكد من حذف حافظة "${projectToDelete?.name}"؟ سيتم حذف جميع الفولدرات والملفات والمستندات بداخلها نهائياً.`}
        onConfirm={confirmDeleteProject}
        onCancel={() => setProjectToDelete(null)}
        type="danger"
        confirmText="نعم، حذف الحافظة"
      />

      {isExplainModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center backdrop-blur-sm p-0 animate-fade-in">
              {/* Full Width Modal Container without Margins */}
              <div className="bg-white w-full h-full md:w-[98vw] md:h-[98vh] md:rounded-xl shadow-2xl overflow-hidden flex flex-col animate-scale-in border border-slate-200">
                  <div className="bg-gradient-to-r from-indigo-900 to-purple-900 p-4 text-white flex justify-between items-center shrink-0">
                      <div><h3 className="text-lg font-bold flex items-center gap-2"><i className="fa-solid fa-book-open text-yellow-400"></i> خبير المعلومات الهندسية</h3><p className="text-[10px] text-indigo-200 mt-0.5 opacity-90 hidden sm:block">{tipOfTheDay}</p></div><button onClick={() => setIsExplainModalOpen(false)} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition"><i className="fa-solid fa-times"></i></button>
                  </div>
                  {/* Content Area with P-0 to allow full width HTML */}
                  <div className="flex-1 overflow-y-auto p-0 bg-white">
                      {isExplaining ? (
                          <div className="flex flex-col items-center justify-center h-full gap-4">
                              <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                              <div className="text-center">
                                <p className="text-slate-700 font-bold text-lg mb-1">جاري استشارة الخبير الاستشاري...</p>
                                <p className="text-slate-500 text-xs">يتم الآن إعداد تقرير فني شامل يتضمن أسرار الموقع والأخطاء الشائعة.</p>
                              </div>
                          </div>
                      ) : (
                          <>
                            {/* Full Width Wrapper for injected HTML with visible padding */}
                            <div className="prose prose-sm max-w-none text-slate-800 leading-relaxed w-full px-6 py-8 md:px-12 md:py-10" dangerouslySetInnerHTML={{ __html: explainContent }}></div>
                          </>
                      )}
                  </div>
                  <div className="p-3 bg-white border-t border-slate-200 flex justify-end shrink-0 gap-2">
                      {!isExplaining && (
                          <>
                            <button onClick={handleSaveTipToArchive} disabled={isSavingToArchive} className="bg-teal-600 text-white px-4 py-2 rounded-xl font-bold hover:bg-teal-700 transition flex items-center gap-2 shadow-sm disabled:opacity-50 text-[10px] sm:text-xs">
                                {isSavingToArchive ? <i className="fa-solid fa-circle-notch fa-spin"></i> : <i className="fa-solid fa-box-archive"></i>} حفظ
                            </button>
                            <button onClick={async () => { if (!explainContent) return; try { const archiveId = await api.getArchiveFolderId(); const rootId = await api.ensureRootFolder(); if (archiveId && rootId) { navigate(`/editor/${rootId}/${archiveId}`, { state: { initialContent: explainContent } }); } } catch (e) { alert("حدث خطأ."); } }} className="bg-blue-600 text-white px-4 py-2 rounded-xl font-bold hover:bg-blue-700 transition flex items-center gap-2 shadow-sm text-[10px] sm:text-xs">
                                <i className="fa-solid fa-pen-to-square"></i> تعديل
                            </button>
                            <button onClick={() => handlePrint(explainContent)} className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-bold hover:bg-indigo-700 transition flex items-center gap-2 shadow-sm text-[10px] sm:text-xs"><i className="fa-solid fa-print"></i> طباعة</button>
                          </>
                      )}
                      <button onClick={() => setIsExplainModalOpen(false)} className="bg-slate-100 text-slate-700 px-6 py-2 rounded-xl font-bold hover:bg-slate-200 transition text-[10px] sm:text-xs">إغلاق</button>
                  </div>
              </div>
          </div>
      )}

      {previewItem && <FileViewer item={previewItem} siblings={previewItem.mimeType?.startsWith('image/') ? items.filter(i => i.mimeType?.startsWith('image/')) : []} onClose={() => setPreviewItem(null)} />}

      <SettingsModal 
        isOpen={showSettingsModal} 
        onClose={() => setShowSettingsModal(false)} 
      />
    </Layout>
  );
};
export default Dashboard;
