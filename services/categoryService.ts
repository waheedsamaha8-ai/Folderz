import { PORTFOLIO_CATEGORIES, PortfolioCategoryMeta } from '../types';

const STORAGE_KEY = 'custom_portfolio_categories_v1';

export const categoryService = {
  // Get all active categories (built-in + user-added custom)
  getAllCategories: (): PortfolioCategoryMeta[] => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const customCategories: PortfolioCategoryMeta[] = stored ? JSON.parse(stored) : [];
      const customMap = new Map(customCategories.map(c => [c.id, c]));
      
      // Check deleted categories list
      const deletedIds: string[] = JSON.parse(localStorage.getItem('deleted_portfolio_categories_v1') || '[]');
      
      const merged: PortfolioCategoryMeta[] = [];
      PORTFOLIO_CATEGORIES.forEach(c => {
        if (!deletedIds.includes(c.id)) {
          merged.push(customMap.get(c.id) || c);
          customMap.delete(c.id);
        }
      });
      
      // Add remaining user custom categories
      customMap.forEach(c => {
        if (!deletedIds.includes(c.id)) {
          merged.push(c);
        }
      });
      
      return merged;
    } catch (e) {
      console.error("Error loading categories", e);
      return PORTFOLIO_CATEGORIES;
    }
  },

  // Get a single category by ID
  getCategoryById: (id?: string): PortfolioCategoryMeta => {
    if (!id) return PORTFOLIO_CATEGORIES[0];
    const all = categoryService.getAllCategories();
    return all.find(c => c.id === id) || {
      id: id,
      name: id,
      icon: 'fa-folder-closed',
      color: 'slate',
      bgGradient: 'from-slate-100 via-gray-50 to-slate-200 border-slate-300',
      badgeBg: 'bg-slate-700',
      badgeText: 'text-white',
      description: 'تصنيف مخصص'
    };
  },

  // Add new custom category
  addCategory: (newCategory: Omit<PortfolioCategoryMeta, 'id' | 'isCustom'>): PortfolioCategoryMeta => {
    const id = 'custom_cat_' + Date.now();
    const created: PortfolioCategoryMeta = {
      ...newCategory,
      id,
      isCustom: true,
      bgGradient: newCategory.bgGradient || 'from-indigo-100 via-slate-50 to-indigo-200 border-indigo-300',
      badgeBg: newCategory.badgeBg || 'bg-indigo-600',
      badgeText: 'text-white'
    };

    const currentCustom = categoryService.getCustomCategories();
    currentCustom.push(created);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(currentCustom));
    window.dispatchEvent(new Event('app-categories-changed'));
    return created;
  },

  // Update an existing category
  updateCategory: (id: string, updatedData: Partial<PortfolioCategoryMeta>) => {
    const categories = categoryService.getAllCategories();
    const targetIdx = categories.findIndex(c => c.id === id);
    if (targetIdx !== -1) {
      const updated = { ...categories[targetIdx], ...updatedData };
      
      const customOnly = categoryService.getCustomCategories();
      const customIdx = customOnly.findIndex(c => c.id === id);
      if (customIdx !== -1) {
        customOnly[customIdx] = updated;
      } else {
        customOnly.push({ ...updated, isCustom: true });
      }
      
      localStorage.setItem(STORAGE_KEY, JSON.stringify(customOnly));
      window.dispatchEvent(new Event('app-categories-changed'));
    }
  },

  // Delete a category
  deleteCategory: (id: string) => {
    const customOnly = categoryService.getCustomCategories().filter(c => c.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(customOnly));

    // 2. Add to deleted list so neither built-in nor custom ever resurface
    const deletedIds: string[] = JSON.parse(localStorage.getItem('deleted_portfolio_categories_v1') || '[]');
    if (!deletedIds.includes(id)) {
      deletedIds.push(id);
      localStorage.setItem('deleted_portfolio_categories_v1', JSON.stringify(deletedIds));
    }

    window.dispatchEvent(new Event('app-categories-changed'));
    window.dispatchEvent(new CustomEvent('app-data-changed', { detail: { type: 'category_deleted', id } }));
  },

  // Get raw custom list
  getCustomCategories: (): PortfolioCategoryMeta[] => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch {
      return [];
    }
  }
};
