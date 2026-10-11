import React, { useState, useEffect } from 'react';
import { PortfolioCategoryMeta } from '../types';
import { categoryService } from '../services/categoryService';

interface CategoryManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const AVAILABLE_ICONS = [
  'fa-folder-closed', 'fa-id-card', 'fa-briefcase', 'fa-house-lock', 'fa-wallet',
  'fa-graduation-cap', 'fa-notes-medical', 'fa-scale-balanced', 'fa-car', 'fa-plane',
  'fa-box-archive', 'fa-passport', 'fa-shield-halved', 'fa-receipt', 'fa-tags',
  'fa-star', 'fa-gem', 'fa-database', 'fa-file-invoice', 'fa-compass-drafting'
];

const COLOR_THEMES = [
  { id: 'blue', bgGradient: 'from-blue-100 via-slate-50 to-blue-200 border-blue-300', badgeBg: 'bg-blue-600' },
  { id: 'indigo', bgGradient: 'from-indigo-100 via-purple-50 to-indigo-200 border-indigo-300', badgeBg: 'bg-indigo-600' },
  { id: 'emerald', bgGradient: 'from-emerald-100 via-green-50 to-emerald-200 border-emerald-300', badgeBg: 'bg-emerald-600' },
  { id: 'amber', bgGradient: 'from-amber-100 via-orange-50 to-amber-200 border-amber-300', badgeBg: 'bg-amber-600' },
  { id: 'rose', bgGradient: 'from-rose-100 via-red-50 to-rose-200 border-rose-300', badgeBg: 'bg-rose-600' },
  { id: 'purple', bgGradient: 'from-purple-100 via-indigo-50 to-purple-200 border-purple-300', badgeBg: 'bg-purple-600' },
  { id: 'teal', bgGradient: 'from-teal-100 via-emerald-50 to-teal-200 border-teal-300', badgeBg: 'bg-teal-600' },
  { id: 'slate', bgGradient: 'from-slate-200 via-gray-100 to-slate-300 border-slate-400', badgeBg: 'bg-slate-700' }
];

export const CategoryManagerModal: React.FC<CategoryManagerModalProps> = ({ isOpen, onClose }) => {
  const [categories, setCategories] = useState<PortfolioCategoryMeta[]>([]);
  const [editingCat, setEditingCat] = useState<PortfolioCategoryMeta | null>(null);
  const [deletingCatId, setDeletingCatId] = useState<string | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);

  // Form State
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formIcon, setFormIcon] = useState('fa-folder-closed');
  const [formTheme, setFormTheme] = useState(COLOR_THEMES[0]);

  const loadCategories = () => {
    setCategories(categoryService.getAllCategories());
  };

  useEffect(() => {
    if (isOpen) {
      loadCategories();
      setIsAddingNew(false);
      setEditingCat(null);
      setDeletingCatId(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleStartAdd = () => {
    setEditingCat(null);
    setDeletingCatId(null);
    setFormName('');
    setFormDesc('');
    setFormIcon('fa-folder-closed');
    setFormTheme(COLOR_THEMES[0]);
    setIsAddingNew(true);
  };

  const handleStartEdit = (cat: PortfolioCategoryMeta) => {
    setEditingCat(cat);
    setDeletingCatId(null);
    setFormName(cat.name);
    setFormDesc(cat.description || '');
    setFormIcon(cat.icon || 'fa-folder-closed');
    const theme = COLOR_THEMES.find(t => t.badgeBg === cat.badgeBg) || COLOR_THEMES[0];
    setFormTheme(theme);
    setIsAddingNew(false);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;

    if (editingCat) {
      categoryService.updateCategory(editingCat.id, {
        name: formName.trim(),
        description: formDesc.trim(),
        icon: formIcon,
        color: formTheme.id,
        bgGradient: formTheme.bgGradient,
        badgeBg: formTheme.badgeBg
      });
    } else {
      categoryService.addCategory({
        name: formName.trim(),
        description: formDesc.trim(),
        icon: formIcon,
        color: formTheme.id,
        bgGradient: formTheme.bgGradient,
        badgeBg: formTheme.badgeBg,
        badgeText: 'text-white'
      });
    }

    loadCategories();
    setIsAddingNew(false);
    setEditingCat(null);
  };

  const confirmDelete = (id: string) => {
    categoryService.deleteCategory(id);
    loadCategories();
    setDeletingCatId(null);
    if (editingCat?.id === id) {
      setEditingCat(null);
    }
  };

  // Reusable Form Component for Add or Inline Edit
  const renderCategoryForm = (isEdit: boolean) => (
    <form onSubmit={handleSave} className="bg-slate-50 p-4 rounded-2xl border border-indigo-200 space-y-4 shadow-sm animate-slide-down">
      <div className="flex justify-between items-center border-b border-slate-200 pb-2">
        <h4 className="font-extrabold text-xs text-slate-800 flex items-center gap-2">
          <i className="fa-solid fa-pen text-indigo-600"></i>
          {isEdit && editingCat ? `تعديل تصنيف: ${editingCat.name}` : 'إضافة تصنيف جديد'}
        </h4>
        <button 
          type="button" 
          onClick={() => { setIsAddingNew(false); setEditingCat(null); }} 
          className="text-xs text-slate-400 font-bold hover:text-slate-600"
        >
          إلغاء
        </button>
      </div>

      <div>
        <label className="block text-[11px] font-extrabold text-slate-700 mb-1">اسم التصنيف *</label>
        <input 
          type="text"
          required
          value={formName}
          onChange={e => setFormName(e.target.value)}
          placeholder="مثال: أوراق السيارات / ثنائيات وسفر / مشروعات جانبية"
          className="w-full p-2.5 bg-white rounded-xl border border-slate-200 text-xs outline-none focus:ring-2 focus:ring-indigo-600 font-bold"
        />
      </div>

      <div>
        <label className="block text-[11px] font-extrabold text-slate-700 mb-1">الوصف / التوضيح</label>
        <input 
          type="text"
          value={formDesc}
          onChange={e => setFormDesc(e.target.value)}
          placeholder="توضيح مختصر لاستخدام هذا التصنيف"
          className="w-full p-2.5 bg-white rounded-xl border border-slate-200 text-xs outline-none focus:ring-2 focus:ring-indigo-600 font-bold"
        />
      </div>

      {/* Icon Picker */}
      <div>
        <label className="block text-[11px] font-extrabold text-slate-700 mb-1.5">أيقونة التصنيف:</label>
        <div className="flex flex-wrap gap-2 max-h-28 overflow-y-auto p-2 bg-white rounded-xl border border-slate-200 custom-scrollbar">
          {AVAILABLE_ICONS.map(icon => (
            <button
              type="button"
              key={icon}
              onClick={() => setFormIcon(icon)}
              className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm transition border ${formIcon === icon ? 'bg-indigo-600 text-white border-indigo-700 scale-105 shadow-md' : 'bg-slate-50 text-slate-700 border-slate-100 hover:bg-slate-100'}`}
            >
              <i className={`fa-solid ${icon}`}></i>
            </button>
          ))}
        </div>
      </div>

      {/* Color Theme Picker */}
      <div>
        <label className="block text-[11px] font-extrabold text-slate-700 mb-1.5">لون التصنيف:</label>
        <div className="flex gap-2">
          {COLOR_THEMES.map(theme => (
            <button
              type="button"
              key={theme.id}
              onClick={() => setFormTheme(theme)}
              className={`w-8 h-8 rounded-full transition border-2 flex items-center justify-center ${theme.badgeBg} ${formTheme.id === theme.id ? 'ring-2 ring-offset-2 ring-slate-900 border-white scale-110' : 'border-transparent opacity-80 hover:opacity-100'}`}
            >
              {formTheme.id === theme.id && <i className="fa-solid fa-check text-white text-xs"></i>}
            </button>
          ))}
        </div>
      </div>

      <button
        type="submit"
        className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md transition"
      >
        {isEdit ? 'حفظ التعديلات' : 'إنشاء التصنيف'}
      </button>
    </form>
  );

  return (
    <div className="fixed inset-0 z-[1100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden border border-slate-100 flex flex-col max-h-[85vh] animate-scale-in">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-5 text-white flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-yellow-500 text-slate-900 flex items-center justify-center text-lg font-black shadow-lg">
              <i className="fa-solid fa-tags"></i>
            </div>
            <div>
              <h3 className="font-extrabold text-base">إدارة أنواع وتصنيفات الحافظة</h3>
              <p className="text-[10px] text-slate-300">إضافة، تعديل أو حذف تصنيفات الحافظة الخاصة بك</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition">
            <i className="fa-solid fa-times"></i>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-6">

          {/* Form for Add New at top */}
          {isAddingNew && renderCategoryForm(false)}

          {/* Add Category Trigger */}
          {!isAddingNew && (
            <button
              onClick={handleStartAdd}
              className="w-full py-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-extrabold text-xs rounded-2xl border border-indigo-200 transition flex items-center justify-center gap-2 shadow-xs"
            >
              <i className="fa-solid fa-plus-circle text-base"></i>
              <span>إضافة نوع / تصنيف جديد للحافظة</span>
            </button>
          )}

          {/* Categories List */}
          <div className="space-y-2">
            <h4 className="text-xs font-black text-slate-800 flex items-center gap-1.5">
              <i className="fa-solid fa-list text-slate-500"></i>
              <span>التصنيفات الحالية ({categories.length})</span>
            </h4>

            <div className="space-y-2">
              {categories.map(cat => (
                <div key={cat.id} className="flex flex-col gap-2">
                  <div className={`p-3.5 rounded-2xl border shadow-xs flex items-center justify-between gap-3 transition ${editingCat?.id === cat.id ? 'bg-indigo-50/50 border-indigo-300 ring-2 ring-indigo-200' : 'bg-white border-slate-100 hover:border-slate-200'}`}>
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white text-base shadow-sm shrink-0 ${cat.badgeBg}`}>
                        <i className={`fa-solid ${cat.icon}`}></i>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h5 className="font-extrabold text-slate-800 text-xs truncate">{cat.name}</h5>
                          {cat.isCustom && (
                            <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
                              مخصص
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-400 truncate">{cat.description || 'تصنيف مخصص'}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          if (editingCat?.id === cat.id) {
                            setEditingCat(null);
                          } else {
                            handleStartEdit(cat);
                          }
                        }}
                        className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs transition ${editingCat?.id === cat.id ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-50 hover:bg-slate-100 text-slate-600'}`}
                        title="تعديل التصنيف مباشرة تحته"
                      >
                        <i className="fa-solid fa-pen"></i>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingCatId(cat.id)}
                        className="w-8 h-8 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 flex items-center justify-center text-xs transition"
                        title="حذف التصنيف"
                      >
                        <i className="fa-solid fa-trash"></i>
                      </button>
                    </div>
                  </div>

                  {/* Inline Delete Confirmation directly under the card */}
                  {deletingCatId === cat.id && (
                    <div className="bg-red-50 p-3.5 rounded-2xl border border-red-200 flex flex-col sm:flex-row items-center justify-between gap-3 animate-slide-down shadow-xs">
                      <div className="flex items-center gap-2 text-xs text-red-800 font-bold">
                        <i className="fa-solid fa-triangle-exclamation text-red-600 text-sm"></i>
                        <span>هل أنت متأكد من حذف تصنيف "{cat.name}"؟</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
                        <button
                          type="button"
                          onClick={() => confirmDelete(cat.id)}
                          className="flex-1 sm:flex-initial px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition shadow-sm"
                        >
                          نعم، حذف
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingCatId(null)}
                          className="flex-1 sm:flex-initial px-4 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold transition"
                        >
                          إلغاء
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Inline Edit Form directly under this specific card */}
                  {editingCat?.id === cat.id && renderCategoryForm(true)}
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end shrink-0">
          <button onClick={onClose} className="px-6 py-2 bg-slate-200 text-slate-700 font-bold text-xs rounded-xl hover:bg-slate-300 transition">
            إغلاق
          </button>
        </div>

      </div>
    </div>
  );
};

export default CategoryManagerModal;
