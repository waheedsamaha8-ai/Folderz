// @ts-nocheck
import { Project, FileItem, ItemType, Task, ProjectStatus, SyncQueueItem, SyncActionType, ProjectLog, ProjectPayment, MarketItem } from '../types';
import { triggerLoadingStart, triggerLoadingStop, triggerLoadingProgress } from '../components/GlobalLoadingBar';
import { dbService } from './db'; 
import { autoSync } from './backgroundSync'; 
import { googleSheetsService } from './googleSheets';
import { signOut as fbSignOut } from 'firebase/auth';
import { auth } from './firebaseConfig';
import { firestoreSyncService } from './firestoreService';
import appletConfig from '../firebase-applet-config.json';

declare const google: any;

const CLIENT_ID = appletConfig.oAuthClientId || '431585344846-sl2nbjv6np9hu63p1c0cjhfi710h0cq8.apps.googleusercontent.com';
const API_KEY = process.env.API_KEY || '';
export const APP_ROOT_FOLDER_NAME = 'الحافظة';
export const ARCHIVE_FOLDER_NAME = 'أرشيف تطبيق الحافظة'; 
export const HIDDEN_LOGS_FOLDER = '.System_Log_Assets';
export const SPREADSHEET_NAME = 'قاعدة بيانات تطبيق الحافظة';

export const normalizeArabic = (text: string): string => {
    if (!text) return '';
    return text
        .trim()
        .toLowerCase()
        .replace(/[\u064B-\u065F\u0670]/g, '')
        .replace(/[إأآا]/g, 'ا')
        .replace(/ة/g, 'ه')
        .replace(/ى/g, 'ي')
        .replace(/\s+/g, ' ');
};

export const isHiddenSystemItem = (name?: string, mimeType?: string): boolean => {
    if (!name && !mimeType) return false;

    // Spreadsheets / project database files must never appear in the app explorer
    if (
        mimeType === 'application/vnd.google-apps.spreadsheet' ||
        mimeType?.includes('spreadsheet') ||
        mimeType?.includes('vnd.ms-excel') ||
        mimeType?.includes('openxmlformats-officedocument.spreadsheetml')
    ) {
        return true;
    }

    if (!name) return false;
    const raw = name.trim();
    const norm = normalizeArabic(raw);

    // Hide folder "صور سجل الحافظة" and any variations from the app view
    if (
        norm.includes('صور سجل') ||
        raw.includes('صور سجل') ||
        norm === 'صور سجل الحافظه' ||
        raw === 'صور سجل الحافظة' ||
        norm.includes('صور اليوميات المحذوفه') ||
        raw.includes('صور اليوميات المحذوفة') ||
        norm.includes('محذوفات صور السجل')
    ) {
        return true;
    }

    // Hide project database files ("قاعدة بيانات - ...", "قاعدة بيانات الحافظة", etc.)
    if (
        norm.includes('قاعده بيانات') ||
        raw.includes('قاعدة بيانات') ||
        norm.includes('قاعده البيانات') ||
        raw.includes('قاعدة البيانات') ||
        norm.includes('al hafez app db') ||
        raw.includes('Al Hafez App DB') ||
        raw.includes(SPREADSHEET_NAME) ||
        raw.endsWith('.gsheet') ||
        raw.endsWith('.xlsx')
    ) {
        return true;
    }

    // Hide internal system metadata, folders, and archives
    if (
        raw === '.System_Log_Assets' ||
        raw === 'metadata.json' ||
        raw === 'المشروعات' ||
        norm.includes('ارشيف تطبيق الحافظه') ||
        raw.includes('أرشيف تطبيق الحافظة') ||
        raw.includes('ارشيف تطبيق الحافظة') ||
        raw === ARCHIVE_FOLDER_NAME
    ) {
        return true;
    }

    return false;
};

export const ARCHIVE_SECTIONS = [
    { name: 'الأوراق الرسمية والشخصية', icon: 'fa-id-card', color: 'amber', desc: 'جوازات، هويات، شهادات، ومستندات رسمية' },
    { name: 'العقود والملكية', icon: 'fa-file-signature', color: 'purple', desc: 'عقود بيع، إيجار، صكوك ملكية، واتفاقيات' },
    { name: 'المالية والفواتير', icon: 'fa-wallet', color: 'emerald', desc: 'إيصالات، فواتير، حسابات، وإقرارات مالية' },
    { name: 'المخططات والمشروعات', icon: 'fa-compass-drafting', color: 'teal', desc: 'رسومات هندسية، صور موقع، ومقايسات' },
    { name: 'الأكواد والمراجع', icon: 'fa-book-atlas', color: 'blue', desc: 'أدلة الفحص، الأكواد، والقوانين' },
    { name: 'استشارات الخبير الذكي', icon: 'fa-user-graduate', color: 'indigo', desc: 'شروحات ونصائح الخبير لكافة المستندات' },
    { name: 'تقارير ومستندات عامة', icon: 'fa-file-contract', color: 'slate', desc: 'ملاحظات، تقارير، وملفات متنوعة' }
];

let detectedRootFolderId = localStorage.getItem('google_drive_tatbiq_alhafeza_root_id') || localStorage.getItem('google_drive_root_id') || '';
const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets';

let tokenClient: any = null;
let accessToken: string | null = localStorage.getItem('google_access_token');

export let GOOGLE_DRIVE_TARGET_ID = detectedRootFolderId || 'Connecting...';

const CACHE_TTL = 1000 * 60 * 60; 
const contentCache = new Map<string, { timestamp: number, data: any }>();

const LOCAL_STORAGE_PROJECTS_KEY = 'construction_pro_projects_sync';
const LOCAL_STORAGE_RECENT_FILES_KEY = 'construction_pro_recent_files_sync';
const LOCAL_STORAGE_MARKET_PRICES_KEY = 'construction_pro_market_prices'; 

const updateCache = (key: string, data: any) => {
    contentCache.set(key, { timestamp: Date.now(), data });
};

const saveToSyncCache = (key: string, data: any) => {
    try { localStorage.setItem(key, JSON.stringify(data)); } catch (e) {}
};

// --- AUTH SERVICE DEFINITION (Google Drive & Google Sheets Integration) ---
const authService = {
  init: () => {
     if (typeof google === 'undefined') {
         setTimeout(authService.init, 500);
         return;
     }
     try {
         tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: SCOPES,
            callback: async (response: any) => {
                if (response.error !== undefined) {
                    console.warn("Google GIS Response Error:", response);
                    return;
                }
                accessToken = response.access_token;
                localStorage.setItem('google_access_token', accessToken);
                
                // Clear any cached root folder IDs from previous account
                localStorage.removeItem('google_drive_root_id');
                localStorage.removeItem('google_drive_tatbiq_alhafeza_root_id');
                localStorage.removeItem('google_sheets_db_id');
                localStorage.removeItem('google_sheets_tatbiq_alhafeza_db_id');
                detectedRootFolderId = '';

                // Fetch current Google User Profile
                try {
                    const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                        headers: { 'Authorization': `Bearer ${accessToken}` }
                    });
                    if (userRes.ok) {
                        const profile = await userRes.json();
                        if (profile.email) {
                            localStorage.setItem('user_email', profile.email.toLowerCase());
                        }
                        if (profile.name) {
                            localStorage.setItem('user_display_name', profile.name);
                        }
                        if (profile.picture) {
                            localStorage.setItem('user_photo', profile.picture);
                        }
                    }
                } catch (e) {
                    console.warn("Could not fetch user profile from Google:", e);
                }

                localStorage.setItem('app_user_logged_in', 'true');
                localStorage.removeItem('app_user_logged_out');

                // Instantly ensure main Wallet/Portfolio folder inside this Gmail user's Google Drive
                try {
                    await api.ensureRootFolder();
                } catch (e) {
                    console.warn("Background root folder init on login", e);
                }

                // Save user profile to Firestore
                try {
                    const savedEmail = localStorage.getItem('user_email') || 'google_user';
                    const uId = auth.currentUser?.uid || 'user_' + btoa(savedEmail.toLowerCase()).replace(/[^a-zA-Z0-9]/g, '_').slice(0, 32);
                    await firestoreSyncService.saveUserProfile({
                        uid: uId,
                        email: savedEmail,
                        displayName: localStorage.getItem('user_display_name') || 'مستخدم Google',
                        photoURL: localStorage.getItem('user_photo') || ''
                    });
                } catch (e) {}

                window.location.reload(); 
            },
        });
     } catch (e) {
         console.error("Auth Init Error", e);
     }
  },
  isAuthenticated: () => {
      // If user explicitly signed out, they need to log in again
      if (localStorage.getItem('app_user_logged_out') === 'true') {
          return false;
      }
      return (typeof auth !== 'undefined' && auth?.currentUser != null) || localStorage.getItem('app_user_logged_in') === 'true' || !!localStorage.getItem('google_access_token');
  },
  connectGoogleDrive: async (emailHint?: string) => {
      if (tokenClient) {
          try {
              tokenClient.requestAccessToken(emailHint ? { hint: emailHint } : undefined);
              return;
          } catch (e) {}
      }
      try {
          authService.init();
          setTimeout(() => {
              if (tokenClient) {
                  tokenClient.requestAccessToken(emailHint ? { hint: emailHint } : undefined);
              }
          }, 500);
      } catch (e) {}
  },
  isGuest: () => {
      return !accessToken && !localStorage.getItem('google_access_token');
  },
  
  signIn: async () => {
      localStorage.removeItem('app_user_logged_out');
      localStorage.setItem('app_user_logged_in', 'true');
      
      // Use Google Identity Services Token Client directly (Prevents COOP cross-origin opener errors and Firebase popup-blocked issues)
      if (tokenClient) {
          try {
              tokenClient.requestAccessToken();
              return;
          } catch (e) {
              console.warn("GIS requestAccessToken error, reinitializing:", e);
          }
      }
      authService.init();
      setTimeout(() => {
          if (tokenClient) {
              tokenClient.requestAccessToken();
          }
      }, 500);
  },
  signInGuest: () => {
      localStorage.removeItem('app_user_logged_out');
      localStorage.setItem('guest_mode', 'true');
      localStorage.setItem('app_user_logged_in', 'true');
      window.location.reload();
  },
  signOut: async () => {
      if (accessToken && typeof google !== 'undefined' && google.accounts?.oauth2) {
          try {
             google.accounts.oauth2.revoke(accessToken, () => { console.log('Token revoked'); });
          } catch(e) {}
      }
      try {
          await fbSignOut(auth);
      } catch (e) {}
      localStorage.setItem('app_user_logged_out', 'true');
      localStorage.removeItem('google_access_token');
      localStorage.removeItem('google_drive_root_id');
      localStorage.removeItem('google_drive_tatbiq_alhafeza_root_id');
      localStorage.removeItem('google_sheets_db_id');
      localStorage.removeItem('google_sheets_tatbiq_alhafeza_db_id');
      localStorage.removeItem('guest_mode');
      localStorage.removeItem('app_user_logged_in');
      accessToken = null;
      detectedRootFolderId = '';
      dbService.clearStore('file_blobs'); 
      window.location.reload();
  }
};

const fetchDrive = async (endpoint: string, options: any = {}) => {
    if (authService.isGuest()) return { files: [], id: 'guest_root' };
    
    if (!accessToken) {
        accessToken = localStorage.getItem('google_access_token');
    }
    
    if (!accessToken) {
        throw new Error("NO_ACCESS_TOKEN");
    }
    
    const url = `https://www.googleapis.com/drive/v3/${endpoint}`;
    const headers = {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...options.headers
    };

    const res = await fetch(url, { ...options, headers });
    
    if (res.status === 401) {
        console.warn("Google Drive Access Token expired.");
        localStorage.removeItem('google_access_token');
        accessToken = null;
        throw new Error("TOKEN_EXPIRED");
    }

    if (!res.ok) {
        const text = await res.text().catch(() => '');
        let errMessage = res.statusText;
        try {
            const err = JSON.parse(text);
            errMessage = err.error?.message || errMessage;
        } catch {
            // response was text or HTML
        }
        throw new Error(errMessage || 'Request failed');
    }

    if (res.status === 204) return null;
    const text = await res.text();
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
};

const getMimeType = (file: File) => file.type || 'application/octet-stream';

const resolveSafeParentFolderId = async (parentId?: string): Promise<string> => {
    if (!parentId || parentId === 'archive_root' || parentId === 'archive' || parentId === 'root' || parentId === 'undefined') {
        const rootId = await api.ensureRootFolder();
        return rootId || detectedRootFolderId || 'root';
    }
    if (parentId.startsWith('proj_') || parentId.startsWith('folder_') || parentId.startsWith('temp_') || parentId.startsWith('local_')) {
        const rootId = await api.ensureRootFolder();
        return rootId || detectedRootFolderId || 'root';
    }
    return parentId;
};

const uploadFileDirect = async (parentId: string, file: File, onProgress?: (p:number)=>void): Promise<any> => {
    const safeParent = await resolveSafeParentFolderId(parentId);
    const metadata: any = {
        name: file.name,
        mimeType: getMimeType(file)
    };
    if (safeParent && safeParent !== 'root') {
        metadata.parents = [safeParent];
    }

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', file);

    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink,webContentLink,thumbnailLink,size,createdTime');
        xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
        
        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable && onProgress) {
                onProgress(Math.round((e.loaded / e.total) * 100));
            }
        };

        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve(JSON.parse(xhr.response));
            } else if (xhr.status === 401) {
                authService.signOut();
                reject(new Error('Token Expired'));
            } else {
                const errorMsg = `Upload failed with status ${xhr.status}`;
                console.error(errorMsg, xhr.response);
                reject(new Error(errorMsg));
            }
        };

        xhr.onerror = () => reject(new Error('Network error'));
        xhr.send(form);
    });
};

const uploadFileResumable = async (parentId: string, file: File, onProgress?: (p:number)=>void): Promise<any> => {
    const safeParent = await resolveSafeParentFolderId(parentId);
    const metadata: any = {
        name: file.name,
        mimeType: getMimeType(file)
    };
    if (safeParent && safeParent !== 'root') {
        metadata.parents = [safeParent];
    }
    
    const initRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,mimeType,webViewLink,webContentLink,thumbnailLink,size,createdTime', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(metadata)
    });

    if (!initRes.ok) throw new Error("Failed to initiate resumable upload");
    const uploadUrl = initRes.headers.get('Location');
    if (!uploadUrl) throw new Error("No upload URL returned");

    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', uploadUrl);
        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable && onProgress) {
                onProgress(Math.round((e.loaded / e.total) * 100));
            }
        };
        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve(JSON.parse(xhr.response));
            } else if (xhr.status === 401) {
                authService.signOut();
                reject(new Error('Token Expired'));
            } else {
                const errorMsg = `Resumable upload failed with status ${xhr.status}`;
                console.error(errorMsg, xhr.response);
                reject(new Error(errorMsg));
            }
        };
        xhr.onerror = () => reject(new Error('Network error'));
        xhr.send(file);
    });
};

const notifyDataChanged = (type: string, detail?: any) => {
    window.dispatchEvent(new CustomEvent('app-data-changed', { detail: { type, detail, timestamp: Date.now() } }));
};

// --- SYNC SERVICE ---
let isProcessingQueue = false;

const syncService = {
    addToQueue: async (action: SyncActionType, payload: any) => {
        const item: SyncQueueItem = {
            id: `sync_${Date.now()}_${Math.random()}`,
            action,
            payload,
            createdAt: Date.now(),
            retryCount: 0,
            status: 'pending'
        };
        await dbService.addToQueue(item);
        notifyDataChanged('queue_added', item);
        
        // Immediate instant sync trigger
        setTimeout(() => syncService.processQueue(), 20);
    },
    getPendingCount: async () => {
        return await dbService.count('sync_queue');
    },
    clearQueue: async () => {
        await dbService.clearQueue();
        notifyDataChanged('queue_cleared');
    },
    processQueue: async () => {
        if (isProcessingQueue || !navigator.onLine || !accessToken || authService.isGuest()) return;
        isProcessingQueue = true;
        try {
            const queue = await dbService.getQueue();
            if (queue && queue.length > 0) {
                for (const item of queue) {
                    try {
                        if (item.action === SyncActionType.UPLOAD_FILE) {
                            const { parentId, tempId, name, mimeType } = item.payload;
                            const blob = await dbService.getBlob(tempId);
                            if (blob) {
                                const file = new File([blob], name, { type: mimeType });
                                let result;
                                if (file.size > 4 * 1024 * 1024) {
                                    result = await uploadFileResumable(parentId, file);
                                } else {
                                    result = await uploadFileDirect(parentId, file);
                                }
                                if (result && result.id) {
                                    const realItem: FileItem = {
                                        id: result.id,
                                        parentId,
                                        name,
                                        type: ItemType.FILE,
                                        mimeType,
                                        createdTime: new Date().toISOString(),
                                        webViewLink: result.webViewLink,
                                        webContentLink: result.webContentLink,
                                        previewUrl: result.thumbnailLink,
                                        size: file.size
                                    };
                                    await dbService.putItem('files', realItem);
                                    await dbService.putBlob(result.id, blob);
                                    await dbService.deleteItem('files', tempId);
                                    await dbService.deleteItem('file_blobs', tempId);
                                }
                            }
                        } else if (item.action === SyncActionType.CREATE_PROJECT || item.action === SyncActionType.UPDATE_PROJECT) {
                            await googleSheetsService.saveProject(item.payload, accessToken);
                        } else if (item.action === SyncActionType.DELETE_PROJECT) {
                            const { id, name } = item.payload;
                            await googleSheetsService.deleteProject(id, accessToken, name);
                            await fetchDrive(`files/${id}`, { method: 'DELETE' }).catch(() => {});
                        } else if (item.action === SyncActionType.DELETE_FILE) {
                            await fetchDrive(`files/${item.payload.id}`, { method: 'DELETE' }).catch(() => {});
                        }

                        await dbService.removeFromQueue(item.id);
                    } catch (err) {
                        console.warn(`Sync queue processing error for item ${item.id}:`, err);
                        item.retryCount = (item.retryCount || 0) + 1;
                        if (item.retryCount > 5) {
                            // Drop permanently failing items after 5 retries to keep queue healthy
                            await dbService.removeFromQueue(item.id);
                        }
                    }
                }
            }

            notifyDataChanged('queue_synced');
        } catch (e) {
            console.error("Error in syncService.processQueue:", e);
        } finally {
            isProcessingQueue = false;
        }
    }
};

if (typeof window !== 'undefined') {
    window.addEventListener('online', () => syncService.processQueue());
    // Auto sync poll every 3 seconds for fast, instant synchronization
    setInterval(() => {
        if (navigator.onLine && !authService.isGuest() && accessToken) {
            syncService.processQueue();
        }
    }, 3000);
}

const enrichProjectWithAI = (project: Project): Project => {
    let calculatedProgress = 0;
    let totalProjectValue = parseFloat(project.value) || 0;
    
    // Fallback to BOQ Total if project value is 0
    if (totalProjectValue === 0 && project.boqItems && project.boqItems.length > 0) {
        totalProjectValue = project.boqItems.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
    }

    if (project.payments && project.payments.length > 0) {
        const latestPayment = project.payments.reduce((prev, current) => {
            return (new Date(current.date).getTime() > new Date(prev.date).getTime()) ? current : prev;
        });
        
        const executedValue = latestPayment.cumulativeAmount || 0;
        calculatedProgress = totalProjectValue > 0 
            ? Math.min(Math.round((executedValue / totalProjectValue) * 100), 100) 
            : 0;
    }

    let smartStatus = ProjectStatus.DESIGN;
    let statusReason = "لم يتم تسجيل محضر استلام موقع";

    const sortedLogs = (project.executionLogs || []).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    let hasSiteHandover = false; 
    let isPaused = false;        
    let isCompleted = false;     

    for (const log of sortedLogs) {
        const text = (log.content || '').toLowerCase();
        
        if (text.includes('استلام موقع') || text.includes('استلام ارض') || text.includes('استلام أرض') || text.includes('تسليم موقع')) {
            hasSiteHandover = true;
            isPaused = false;
        }
        if (text.includes('ايقاف اعمال') || text.includes('إيقاف أعمال') || text.includes('وقف تنفيذ') || text.includes('تعليق الأعمال')) {
            isPaused = true;
        }
        if (text.includes('استئناف') || text.includes('عودة للعمل') || text.includes('محضر استئناف')) {
            isPaused = false;
        }
        if (text.includes('استلام ابتدائي') || text.includes('تسليم ابتدائي') || text.includes('نهو الأعمال')) {
            isCompleted = true;
        }
    }

    if (isCompleted) {
        smartStatus = ProjectStatus.COMPLETED;
        statusReason = "تم تسجيل محضر الاستلام الابتدائي";
    } else if (hasSiteHandover) {
        if (isPaused) {
            smartStatus = ProjectStatus.PAUSED;
            statusReason = "تم تسجيل محضر إيقاف أعمال ولم يتم الاستئناف";
        } else {
            smartStatus = ProjectStatus.ONGOING;
            statusReason = `جاري التنفيذ (إنجاز مالي: ${calculatedProgress}%)`;
        }
    } else {
        smartStatus = ProjectStatus.DESIGN;
        statusReason = "لم يتم تسجيل محضر استلام أرض/موقع في اليوميات";
    }

    return { ...project, calculatedProgress, status: smartStatus, autoStatusReason: statusReason };
};

const createCardHtml = (title: string, content: string) => `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>${title}</title><style>@import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap'); body { font-family: 'Tajawal', sans-serif; padding: 20px; line-height: 1.6; color: #1e293b; direction: rtl; background-color: white; } .archive-content { font-size: 1.1em; } table { width: 100%; border-collapse: collapse; margin: 15px 0; font-size: 0.9em; } th, td { border: 1px solid #cbd5e1; padding: 10px; text-align: right; } th { background: #f8fafc; color: #334155; } h1, h2, h3 { color: #1e3a8a; margin-top: 0; } strong { color: #0f172a; } .highlight-box, blockquote { background-color: #f0fdfa; border-right: 4px solid #0d9488; padding: 12px; margin: 15px 0; border-radius: 4px; color: #115e59; } .warning-box { background-color: #fef2f2; border-right: 4px solid #ef4444; padding: 12px; margin: 15px 0; color: #991b1b; }</style></head><body><div class="archive-content">${content}</div></body></html>`;

const DELETED_PROJECTS_KEY = 'app_deleted_projects_tombstones';
const DELETED_FILES_KEY = 'app_deleted_files_tombstones';

function getDeletedFileTombstones(): string[] {
    try {
        const raw = localStorage.getItem(DELETED_FILES_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch (e) {
        return [];
    }
}

function addDeletedFileTombstone(id: string) {
    if (!id) return;
    const current = getDeletedFileTombstones();
    if (!current.includes(id)) {
        current.push(id);
        try {
            localStorage.setItem(DELETED_FILES_KEY, JSON.stringify(current));
        } catch (e) {}
    }
}

export function isFileDeleted(id?: string): boolean {
    if (!id) return false;
    const tombstones = getDeletedFileTombstones();
    return tombstones.includes(id);
}

function getDeletedTombstones(): { ids: string[]; names: string[] } {
    try {
        const raw = localStorage.getItem(DELETED_PROJECTS_KEY);
        if (!raw) return { ids: [], names: [] };
        const parsed = JSON.parse(raw);
        return {
            ids: Array.isArray(parsed.ids) ? parsed.ids : [],
            names: Array.isArray(parsed.names) ? parsed.names : []
        };
    } catch (e) {
        return { ids: [], names: [] };
    }
}

function addDeletedTombstone(id: string, name?: string) {
    const current = getDeletedTombstones();
    if (id && !current.ids.includes(id)) current.ids.push(id);
    if (name && name.trim()) {
        const norm = name.trim().toLowerCase();
        if (!current.names.includes(norm)) current.names.push(norm);
    }
    try {
        localStorage.setItem(DELETED_PROJECTS_KEY, JSON.stringify(current));
    } catch (e) {}
}

function removeDeletedTombstone(name?: string, id?: string) {
    const current = getDeletedTombstones();
    let changed = false;
    if (id && current.ids.includes(id)) {
        current.ids = current.ids.filter(i => i !== id);
        changed = true;
    }
    if (name && name.trim()) {
        const norm = name.trim().toLowerCase();
        if (current.names.includes(norm)) {
            current.names = current.names.filter(n => n !== norm);
            changed = true;
        }
    }
    if (changed) {
        try {
            localStorage.setItem(DELETED_PROJECTS_KEY, JSON.stringify(current));
        } catch(e) {}
    }
}

export function isProjectDeleted(id: string, name?: string): boolean {
    const tombstones = getDeletedTombstones();
    if (id && tombstones.ids.includes(id)) return true;
    if (name && tombstones.names.includes(name.trim().toLowerCase())) return true;
    return false;
}

export const api = {
  initAuth: authService.init,
  isAuthenticated: authService.isAuthenticated,
  isGuest: authService.isGuest,
  isProjectDeleted,
  signIn: authService.signIn,
  signInGuest: authService.signInGuest,
  connectGoogleDrive: authService.connectGoogleDrive,
  signOut: authService.signOut,
  sync: syncService, 
  getSyncProjects(): Project[] { try { const stored = localStorage.getItem(LOCAL_STORAGE_PROJECTS_KEY); if (stored) return JSON.parse(stored); } catch(e) {} return []; },
  getSyncRecentFiles(): FileItem[] { try { const stored = localStorage.getItem(LOCAL_STORAGE_RECENT_FILES_KEY); if (stored) return JSON.parse(stored); } catch(e) {} return []; },
  getSyncTasks(): Task[] { return [...localTasks]; },

  async getSpreadsheetUrl(projectId?: string): Promise<string | null> {
      if (!projectId || !accessToken) return null;
      try {
          const project = await this.getProjectById(projectId);
          const folderId = project?.driveFolderId || projectId;
          const sheetId = await googleSheetsService.findProjectSpreadsheetId(folderId, accessToken);
          if (sheetId) {
              return `https://docs.google.com/spreadsheets/d/${sheetId}/edit`;
          }
      } catch (e) {}
      return null;
  },

  async getRootFolderUrl(): Promise<string | null> {
      try {
          const rootId = await this.ensureRootFolder();
          if (rootId) return `https://drive.google.com/drive/folders/${rootId}`;
      } catch (e) {}
      return null;
  },
  
  // --- OFFLINE-READY DOWNLOAD FUNCTION ---
  async downloadFileBlob(fileId: string, onProgress?: (percent: number) => void): Promise<Blob> { 
      try {
          const cachedBlob = await dbService.getBlob(fileId);
          if (cachedBlob) {
              if (onProgress) onProgress(100);
              return cachedBlob;
          }
      } catch (e) {}

      if (!navigator.onLine) {
          throw new Error("OFFLINE_NO_CACHE");
      }

      if (!authService.isAuthenticated()) throw new Error("AUTH_REQUIRED");
      
      triggerLoadingStart(); 
      return new Promise((resolve, reject) => { 
          const xhr = new XMLHttpRequest(); 
          xhr.open('GET', `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`); 
          xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`); 
          xhr.responseType = 'blob'; 
          xhr.onprogress = (event) => { 
              if (event.lengthComputable && onProgress) { 
                  const percent = Math.round((event.loaded / event.total) * 100); 
                  onProgress(percent); 
                  triggerLoadingProgress(percent); 
              } 
          }; 
          xhr.onload = async () => { 
              triggerLoadingStop(); 
              if (xhr.status >= 200 && xhr.status < 300) { 
                  const blob = xhr.response; 
                  try { await dbService.putBlob(fileId, blob); } catch (e) {}
                  resolve(blob); 
              } else { 
                  if (xhr.status === 401) {
                      localStorage.removeItem('google_access_token');
                      accessToken = null;
                      reject(new Error('Token Expired'));
                      return;
                  }
                  if (xhr.status === 403 || xhr.status === 400 || xhr.status === 500) { 
                      try { 
                          const exportRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=application/pdf`, { headers: { 'Authorization': `Bearer ${accessToken}` } }); 
                          if (exportRes.ok) { 
                              const blob = await exportRes.blob(); 
                              try { await dbService.putBlob(fileId, blob); } catch(e){}
                              if (onProgress) onProgress(100); 
                              resolve(blob); 
                              return; 
                          } 
                      } catch(e) {} 
                  } 
                  reject(new Error(`Download Failed: ${xhr.status}`)); 
              } 
          }; 
          xhr.onerror = () => { 
              triggerLoadingStop(); 
              reject(new Error('Network error during download')); 
          }; 
          xhr.send(); 
      }); 
  },

   async ensureRootFolder(): Promise<string> { 
       if (detectedRootFolderId) {
           try {
               const check = await fetchDrive(`files/${detectedRootFolderId}?fields=id,name,trashed`);
               if (check && check.id && !check.trashed) {
                   GOOGLE_DRIVE_TARGET_ID = detectedRootFolderId;
                   return detectedRootFolderId;
               }
           } catch (e) {
               console.warn("Cached root folder ID invalid or forbidden for current account, resetting...", e);
               detectedRootFolderId = '';
               localStorage.removeItem('google_drive_root_id');
               localStorage.removeItem('google_drive_tatbiq_alhafeza_root_id');
           }
       } 
       try { 
           const query = `(name = 'الحافظة' or name = 'المحفظه' or name = 'تطبيق الحافظة' or name = 'محفظة الأعمال - الحافظة') and mimeType = 'application/vnd.google-apps.folder' and trashed = false`; 
           const result = await fetchDrive(`files?q=${encodeURIComponent(query)}&fields=files(id,name)`); 
           let rootId = ''; 
           if (result.files && result.files.length > 0) {
               rootId = result.files[0].id;
           } else { 
               const createRes = await fetchDrive('files', { 
                   method: 'POST', 
                   body: JSON.stringify({ 
                       name: APP_ROOT_FOLDER_NAME, 
                       mimeType: 'application/vnd.google-apps.folder' 
                   }) 
               }); 
               rootId = createRes.id; 
           } 
           detectedRootFolderId = rootId; 
           GOOGLE_DRIVE_TARGET_ID = detectedRootFolderId; 
           localStorage.setItem('google_drive_root_id', detectedRootFolderId); 
           localStorage.setItem('google_drive_tatbiq_alhafeza_root_id', detectedRootFolderId); 
           
           // Ensure root folder, delete any archive folder, & Google Sheets DB in root folder
           await this.deleteArchiveFolder(rootId); 
           if (accessToken) {
               googleSheetsService.ensureSpreadsheet(accessToken, rootId).catch(console.warn);
           }
           return rootId; 
       } catch (e) { 
           return ''; 
       } 
   },

   async ensureProjectsContainerFolder(rootId: string): Promise<string> {
       let folderId = '';
       try {
           const query = `name = 'المشروعات' and '${rootId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
           const result = await fetchDrive(`files?q=${encodeURIComponent(query)}&fields=files(id)`);
           if (result.files && result.files.length > 0) {
               folderId = result.files[0].id;
           } else {
               const createRes = await fetchDrive('files', { 
                   method: 'POST', 
                   body: JSON.stringify({ name: 'المشروعات', mimeType: 'application/vnd.google-apps.folder', parents: [rootId] }) 
               });
               folderId = createRes.id;
           }
       } catch(e) { 
           return rootId; 
       }
       return folderId;
   },

  async deleteArchiveFolder(rootId: string): Promise<void> {
      try {
          const query = `(name = '${ARCHIVE_FOLDER_NAME}' or name = 'ارشيف تطبيق الحافظة') and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
          const result = await fetchDrive(`files?q=${encodeURIComponent(query)}&fields=files(id,name)`);
          if (result.files && result.files.length > 0) {
              for (const folder of result.files) {
                  try {
                      await fetchDrive(`files/${folder.id}`, { method: 'DELETE' });
                      console.log(`[GoogleDrive] Deleted archive folder: ${folder.name} (${folder.id})`);
                  } catch(err) {
                      console.warn("Failed to delete archive folder on Drive", err);
                  }
              }
          }

          try {
              const allFiles = await dbService.getAllItems<FileItem>('files');
              for (const f of allFiles) {
                  if (f.name === ARCHIVE_FOLDER_NAME || f.name === 'ارشيف تطبيق الحافظة' || ARCHIVE_SECTIONS.some(s => s.name === f.name)) {
                      await dbService.deleteItem('files', f.id);
                  }
              }
          } catch(e) {}
      } catch(e) {
          console.warn("deleteArchiveFolder error", e);
      }
  },

  async ensureArchiveFolder(rootId: string): Promise<string> { 
      await this.deleteArchiveFolder(rootId);
      return rootId; 
  },

  async ensureHiddenFolder(parentId: string, folderName: string): Promise<string> {
      let folderId = '';
      try {
          const query = `name = '${folderName}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
          const result = await fetchDrive(`files?q=${encodeURIComponent(query)}&fields=files(id)`);
          if (result.files && result.files.length > 0) folderId = result.files[0].id;
          else {
              const createRes = await fetchDrive('files', { method: 'POST', body: JSON.stringify({ name: folderName, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }) });
              folderId = createRes.id;
          }
      } catch(e) { return parentId; }
      return folderId;
  },

  async ensureSubfolder(parentId: string, folderName: string): Promise<string> {
      let folderId = '';
      try {
          const query = `name = '${folderName}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
          const result = await fetchDrive(`files?q=${encodeURIComponent(query)}&fields=files(id)`);
          if (result.files && result.files.length > 0) folderId = result.files[0].id;
          else {
              const createRes = await fetchDrive('files', { method: 'POST', body: JSON.stringify({ name: folderName, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }) });
              folderId = createRes.id;
          }
      } catch(e) { return parentId; }
      return folderId;
  },

  async findFileByName(name: string): Promise<{id: string, parentId: string} | null> {
      try {
          const query = `name = '${name}' and trashed = false`;
          const result = await fetchDrive(`files?q=${encodeURIComponent(query)}&fields=files(id, parents)`);
          if (result.files && result.files.length > 0) {
              const file = result.files[0];
              return { id: file.id, parentId: file.parents ? file.parents[0] : '' };
          }
      } catch(e) {}
      return null;
  },

  async getArchiveFolderId(): Promise<string> { 
      return await this.ensureRootFolder(); 
  },

  async saveToArchive(title: string, content: string, sectionName?: string): Promise<string> { 
      triggerLoadingStart(); 
      try { 
          const rootId = await this.ensureRootFolder(); 
          if (!rootId) { throw new Error("Could not find root folder"); } 
          const htmlDoc = createCardHtml(title, content); 
          const file = await this.saveLetter(rootId, title, htmlDoc); 
          return file.id; 
      } finally { 
          triggerLoadingStop(); 
      } 
  },

  getCachedContents(folderId: string): FileItem[] | null { 
      const cached = contentCache.get(folderId); 
      if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) { 
          return cached.data.filter(f => !isFileDeleted(f.id)); 
      } 
      return null; 
  },

  async primeCachesFromLocalDB(): Promise<void> {
      try {
          const allFiles = await dbService.getAllItems<FileItem>('files');
          if (allFiles && allFiles.length > 0) {
              const byParent = new Map<string, FileItem[]>();
              for (const f of allFiles) {
                  if (!f.parentId || isHiddenSystemItem(f.name, f.mimeType) || isFileDeleted(f.id)) continue;
                  if (!byParent.has(f.parentId)) byParent.set(f.parentId, []);
                  byParent.get(f.parentId)!.push(f);
              }
              for (const [pId, items] of byParent.entries()) {
                  updateCache(pId, items.filter(f => !isFileDeleted(f.id)).sort((a, b) => new Date(a.createdTime).getTime() - new Date(b.createdTime).getTime()));
              }
          }
      } catch (e) {}
  },

  getCachedProjects(): Project[] | null { 
      const cached = contentCache.get('projects_list'); 
      if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) { 
          return cached.data.filter((p: Project) => !isProjectDeleted(p.id, p.name)); 
      } 
      return null; 
  },

  async getLocalProjects(): Promise<Project[]> { 
      const localProjects = await dbService.getAllItems<Project>('projects'); 
      const processed = localProjects.filter(p => p.name !== ARCHIVE_FOLDER_NAME && !isProjectDeleted(p.id, p.name)).map(enrichProjectWithAI); 
      saveToSyncCache(LOCAL_STORAGE_PROJECTS_KEY, processed); 
      return processed; 
  },
  
  async getProjectById(id: string, forceRefresh = false): Promise<Project | undefined> { 
      if (id && isProjectDeleted(id)) return undefined;
      const cachedList = this.getCachedProjects(); 
      const cached = cachedList?.find(p => p.id === id); 
      if (!forceRefresh && cached) {
          if (isProjectDeleted(cached.id, cached.name)) return undefined;
          return cached;
      }

      const local = await dbService.getItem<Project>('projects', id); 
      if (!forceRefresh && local) {
          if (isProjectDeleted(local.id, local.name)) return undefined;
          return enrichProjectWithAI(local);
      }

      if (navigator.onLine && accessToken && !authService.isGuest()) {
          try {
              const fullData = await googleSheetsService.fetchAllData(accessToken);
              const found = fullData.projects.find(p => p.id === id);
              if (found) {
                  const enriched = enrichProjectWithAI(found);
                  await dbService.putItem('projects', enriched);
                  return enriched;
              }
          } catch(e) {
              console.warn("Could not fetch project from Google Sheets:", e);
          }
      }
      
      return local ? enrichProjectWithAI(local) : undefined; 
  },
  
  // --- CORE GET PROJECTS: READS FROM GOOGLE SHEETS WITH INSTANT LOCAL CACHE ---
  async getProjects(): Promise<Project[]> { 
      if (!authService.isAuthenticated()) return []; 
      
      const tombstones = getDeletedTombstones();

      // FAST PATH 1: Return memory cached projects immediately for 0ms UI load
      const memoryCached = this.getCachedProjects();
      if (memoryCached && memoryCached.length > 0) {
          const filteredMemory = memoryCached.filter(p => !isProjectDeleted(p.id, p.name));
          // Refresh background data from Sheets asynchronously
          if (navigator.onLine && !authService.isGuest() && accessToken) {
              setTimeout(() => this.syncProjectsFromSheets().catch(console.warn), 100);
          }
          return filteredMemory;
      }

      const localProjects = await dbService.getAllItems<Project>('projects'); 

      const processedLocal = localProjects
          .filter(p => p.name !== ARCHIVE_FOLDER_NAME && !isProjectDeleted(p.id, p.name))
          .map(enrichProjectWithAI); 
      
      if (processedLocal.length > 0) {
          updateCache('projects_list', processedLocal);
          saveToSyncCache(LOCAL_STORAGE_PROJECTS_KEY, processedLocal);
      }
      
      // If offline or guest, return local cache
      if (!navigator.onLine || authService.isGuest() || !accessToken) return processedLocal; 
      
      return this.syncProjectsFromSheets(processedLocal);
  },

  async syncProjectsFromSheets(baseLocal?: Project[]): Promise<Project[]> {
      if (!accessToken || !navigator.onLine || authService.isGuest()) return baseLocal || [];
      const localProjects = baseLocal || (await dbService.getAllItems<Project>('projects'))
          .filter(p => p.name !== ARCHIVE_FOLDER_NAME && !isProjectDeleted(p.id, p.name))
          .map(enrichProjectWithAI);

      try { 
          const rootId = await this.ensureRootFolder();
          const driveProjects = await googleSheetsService.discoverAllProjectsFromDrive(rootId, accessToken);
          
          let sheetsProjects = driveProjects
              .filter(p => !isProjectDeleted(p.id, p.name))
              .map(enrichProjectWithAI); 

          const projectMap = new Map<string, Project>();
          const nameMap = new Map<string, Project>();

          sheetsProjects.forEach(p => {
              projectMap.set(p.id, p);
              if (p.name) nameMap.set(p.name.trim().toLowerCase(), p);
          });

          // Merge local projects, strictly reconciling by name to avoid duplicates
          for (const p of localProjects) { 
              if (isProjectDeleted(p.id, p.name)) continue;
              const normName = p.name ? p.name.trim().toLowerCase() : '';

              if (projectMap.has(p.id)) {
                  const fromSheets = projectMap.get(p.id)!;
                  if (p.executionLogs && p.executionLogs.length > (fromSheets.executionLogs?.length || 0)) {
                      fromSheets.executionLogs = p.executionLogs;
                  }
                  continue;
              }
              if (normName && nameMap.has(normName)) {
                  const canonical = nameMap.get(normName)!;
                  if (p.executionLogs && p.executionLogs.length > (canonical.executionLogs?.length || 0)) {
                      canonical.executionLogs = p.executionLogs;
                  }
                  dbService.deleteItem('projects', p.id).catch(() => {});
                  dbService.putItem('projects', canonical).catch(() => {});
                  continue;
              }

              // True new project not in Drive yet
              projectMap.set(p.id, p);
              if (normName) nameMap.set(normName, p);
          }
          
          const mergedProjects = Array.from(projectMap.values());
          for (const p of mergedProjects) await dbService.putItem('projects', p); 
          updateCache('projects_list', mergedProjects); 
          saveToSyncCache(LOCAL_STORAGE_PROJECTS_KEY, mergedProjects); 
          notifyDataChanged('projects_synced', mergedProjects);
          return mergedProjects; 
      } catch (e: any) { 
          console.warn("Drive/Sheets fetch paused. Serving local data.", e);
          return localProjects; 
      } 
  },

  async refreshProjects(): Promise<Project[]> {
      if (!authService.isAuthenticated()) return [];
      contentCache.delete('projects_list');
      if (!navigator.onLine || authService.isGuest() || !accessToken) {
          return this.getProjects();
      }
      return this.syncProjectsFromSheets();
  },

  subscribeToProject(projectId: string, onUpdate: (data: Project) => void): () => void { 
      let isMounted = true;
      let intervalId: any = null;

      const fetchAndEmit = async () => {
          if (!isMounted || !navigator.onLine || !accessToken || authService.isGuest()) return;
          try {
              const currentProject = await dbService.getItem<Project>('projects', projectId);
              const folderId = currentProject?.driveFolderId || projectId;
              const remoteData = await googleSheetsService.fetchProjectSpreadsheetData(projectId, folderId, accessToken);
              if (remoteData && isMounted) {
                  const merged: Project = {
                      ...currentProject,
                      ...remoteData,
                      id: projectId,
                      executionLogs: remoteData.executionLogs && remoteData.executionLogs.length > 0 ? remoteData.executionLogs : (currentProject?.executionLogs || [])
                  } as Project;
                  const enriched = enrichProjectWithAI(merged);
                  await dbService.putItem('projects', enriched);
                  saveToSyncCache(LOCAL_STORAGE_PROJECTS_KEY, [enriched]);
                  onUpdate(enriched);
              }
          } catch(e) {}
      };

      // Periodic check every 12 seconds for collaborative multi-user updates via Sheets
      intervalId = setInterval(fetchAndEmit, 12000);

      return () => { 
          isMounted = false; 
          if (intervalId) clearInterval(intervalId); 
      };
  },

  async createProject(projectData: any, isSyncProcess = false): Promise<Project> { 
      if (!authService.isAuthenticated()) throw new Error("AUTH_REQUIRED"); 
      contentCache.delete('projects_list'); 
      if (!isSyncProcess) triggerLoadingStart(); 
      const projectId = projectData.id || `proj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`; 
      removeDeletedTombstone(projectData.name, projectId); 
      const newProject: Project = { 
          ...projectData, 
          id: projectId, 
          driveFolderId: projectId, 
          createdAt: new Date().toISOString(), 
          boqFolderId: '', 
          boqItems: [], 
          status: ProjectStatus.DESIGN, 
          executionLogs: [] 
      }; 
      
      try {
          await dbService.putItem('projects', newProject); 
          const currentSync = this.getSyncProjects(); 
          saveToSyncCache(LOCAL_STORAGE_PROJECTS_KEY, [enrichProjectWithAI(newProject), ...currentSync]); 
          
          for (let idx = 0; idx < DEFAULT_SUBFOLDERS.length; idx++) { 
              const sub = DEFAULT_SUBFOLDERS[idx]; 
              if (isHiddenSystemItem(sub)) continue; 
              const folderId = `${projectId}_sub_${idx}`; 
              const folderItem = { 
                  id: folderId, 
                  parentId: projectId, 
                  name: sub, 
                  type: ItemType.FOLDER, 
                  createdTime: new Date().toISOString(),
                  mimeType: 'application/vnd.google-apps.folder',
                  fileCount: 0,
                  folderCount: 0
              }; 
              await dbService.putItem('files', folderItem); 
          } 
      } catch (e) { console.error("Local creation failed", e); }

      if ((!navigator.onLine || authService.isGuest()) && !isSyncProcess) { 
          await syncService.addToQueue(SyncActionType.CREATE_PROJECT, newProject); 
          triggerLoadingStop(); 
          notifyDataChanged('project_created', newProject);
          return newProject; 
      } 
      
      try { 
          let driveFolderId = projectId; 
          const rootId = await this.ensureRootFolder(); 
          const driveFolder = await fetchDrive('files', { 
              method: 'POST', 
              body: JSON.stringify({ 
                name: projectData.name, 
                mimeType: 'application/vnd.google-apps.folder', 
                parents: [rootId] 
            }) 
          }); 
          driveFolderId = driveFolder.id; 
          
          const realSubFolders: FileItem[] = [];
          for (let idx = 0; idx < DEFAULT_SUBFOLDERS.length; idx++) {
              const sub = DEFAULT_SUBFOLDERS[idx];
              try {
                  const subRes = await fetchDrive('files', { 
                      method: 'POST', 
                      body: JSON.stringify({ 
                          name: sub, 
                          mimeType: 'application/vnd.google-apps.folder', 
                          parents: [driveFolderId] 
                      }) 
                  });
                  if (subRes && subRes.id && !isHiddenSystemItem(sub)) {
                      const realSubFolder: FileItem = {
                          id: subRes.id,
                          parentId: driveFolderId,
                          name: sub,
                          type: ItemType.FOLDER,
                          mimeType: 'application/vnd.google-apps.folder',
                          createdTime: new Date().toISOString(),
                          fileCount: 0,
                          folderCount: 0
                      };
                      await dbService.putItem('files', realSubFolder);
                      realSubFolders.push(realSubFolder);
                  }
              } catch(e) {}
              await dbService.deleteItem('files', `${projectId}_sub_${idx}`).catch(() => {});
          }

          // Prime cache immediately so folders appear without reload/delays
          updateCache(driveFolderId, realSubFolders);
          saveToSyncCache(driveFolderId, realSubFolders);

          const completeProject = { 
              ...projectData, 
              id: driveFolderId, 
              driveFolderId: driveFolderId, 
              createdAt: new Date().toISOString(), 
              boqItems: [], 
              status: ProjectStatus.DESIGN 
          }; 
          
          if (driveFolderId !== projectId) { 
              await dbService.deleteItem('projects', projectId); 
              await dbService.putItem('projects', completeProject); 
          }

          const currentSync = this.getSyncProjects().filter(p => p.id !== projectId && p.id !== driveFolderId);
          saveToSyncCache(LOCAL_STORAGE_PROJECTS_KEY, [enrichProjectWithAI(completeProject), ...currentSync]);

          if (accessToken) {
              await googleSheetsService.ensureProjectSpreadsheet(completeProject, accessToken);
          }
          
          // Instantly sync to Firestore database for real-time sub-50ms live updates
          try { await firestoreSyncService.saveProject(completeProject); } catch(e) {}

          if (!isSyncProcess) triggerLoadingStop(); 
          notifyDataChanged('project_created', completeProject);
          return { ...completeProject, id: driveFolderId } as Project; 
      } catch (e: any) { 
          console.warn("Cloud save failed, project preserved locally in IndexedDB.", e);
          try { await firestoreSyncService.saveProject(newProject); } catch(err) {}
          if (!isSyncProcess) { 
              await syncService.addToQueue(SyncActionType.CREATE_PROJECT, newProject); 
              triggerLoadingStop(); 
              notifyDataChanged('project_created', newProject);
          } else throw e; 
      } 
      return newProject; 
  },

  async updateProject(id: string, updates: Partial<Project>, isSyncProcess = false): Promise<Project | null> { 
      if (!authService.isAuthenticated()) return null; 
      contentCache.delete('projects_list'); 
      if (!isSyncProcess) triggerLoadingStart(); 
      let project = null;
      try { project = await dbService.getItem<Project>('projects', id); } catch(e) {}
      
      const updatedProject = project ? { ...project, ...updates } : { id, ...updates } as Project;
      try { await dbService.putItem('projects', updatedProject); } catch(e) {}

      // Instantly sync project update to Firestore
      try { await firestoreSyncService.saveProject(updatedProject); } catch(e) {}

      if (navigator.onLine && !authService.isGuest() && accessToken) {
          try {
              await googleSheetsService.syncProjectDataToSpreadsheet(updatedProject, accessToken);
              if (!isSyncProcess) triggerLoadingStop();
              notifyDataChanged('project_updated', updatedProject);
              return updatedProject;
          } catch (e: any) {
              console.warn("Google Sheets update fallback to queue", e);
              if (!isSyncProcess) { 
                  await syncService.addToQueue(SyncActionType.UPDATE_PROJECT, { id, updates }); 
                  triggerLoadingStop(); 
              } else throw e;
          }
      } else {
          if (!isSyncProcess) { await syncService.addToQueue(SyncActionType.UPDATE_PROJECT, { id, updates }); }
          if (!isSyncProcess) triggerLoadingStop();
          notifyDataChanged('project_updated', updatedProject);
          return updatedProject;
      }
      if (!isSyncProcess) triggerLoadingStop();
      notifyDataChanged('project_updated', updatedProject);
      return project;
  },

  async syncProjectFromGoogleSheets(projectId: string): Promise<Project | null> {
      if (!navigator.onLine || !accessToken || authService.isGuest()) return null;
      try {
          const currentProject = await this.getProjectById(projectId);
          const folderId = currentProject?.driveFolderId || projectId;
          const remoteData = await googleSheetsService.fetchProjectSpreadsheetData(projectId, folderId, accessToken);
          if (remoteData) {
              const merged: Project = {
                  ...currentProject,
                  ...remoteData,
                  id: projectId,
                  executionLogs: remoteData.executionLogs || currentProject?.executionLogs || []
              } as Project;
              await dbService.putItem('projects', merged);
              const memProjects = this.getCachedProjects();
              if (memProjects && memProjects.length > 0) {
                  const updatedList = memProjects.map(p => p.id === projectId ? merged : p);
                  updateCache('projects_list', updatedList);
                  saveToSyncCache(LOCAL_STORAGE_PROJECTS_KEY, updatedList);
              }
              notifyDataChanged('project_updated', merged);
              return merged;
          }
      } catch(e) {
          console.warn("Failed to sync project from Google Sheets", e);
      }
      return null;
  },

  async uploadLogImagesToDrive(projectId: string, images: string[], existingDriveImages?: string[]): Promise<string[]> {
      if (!navigator.onLine || authService.isGuest() || !accessToken || !images || images.length === 0) return images || [];
      try {
          const project = await this.getProjectById(projectId);
          const parentFolderId = project?.driveFolderId || projectId;
          const logFolderId = await this.ensureSubfolder(parentFolderId, 'صور سجل الحافظة');

          // Collect known existing Drive URLs to never duplicate
          const knownDriveUrls: string[] = (existingDriveImages || []).filter(u => u && !u.startsWith('data:image/'));

          const finalUrls: string[] = [];
          for (let i = 0; i < images.length; i++) {
              const img = images[i];
              // 1. If it's ALREADY a Drive URL or HTTP link or does NOT start with data:image/, keep as is without re-uploading!
              if (!img || !img.startsWith('data:image/')) {
                  finalUrls.push(img);
                  continue;
              }

              // 2. If this slot already corresponds to an existing Drive URL from the previous save, reuse it!
              if (knownDriveUrls[i] && (knownDriveUrls[i].startsWith('http') || !knownDriveUrls[i].startsWith('data:'))) {
                  finalUrls.push(knownDriveUrls[i]);
                  continue;
              }

              // 3. Only upload genuinely NEW data:image base64 images!
              try {
                  const arr = img.split(',');
                  const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
                  const bstr = atob(arr[1]);
                  let n = bstr.length;
                  const u8arr = new Uint8Array(n);
                  while (n--) {
                      u8arr[n] = bstr.charCodeAt(n);
                  }
                  const blob = new Blob([u8arr], { type: mime });
                  const fileName = `Log_Image_${Date.now()}_${i + 1}.jpg`;
                  const res = await uploadFileDirect(logFolderId, new File([blob], fileName, { type: mime }));
                  if (res && res.id) {
                      try {
                          await fetch(`https://www.googleapis.com/drive/v3/files/${res.id}/permissions`, {
                              method: 'POST',
                              headers: {
                                  Authorization: `Bearer ${accessToken}`,
                                  'Content-Type': 'application/json'
                              },
                              body: JSON.stringify({ role: 'reader', type: 'anyone' })
                          });
                      } catch(err) {}

                      const webUrl = `https://lh3.googleusercontent.com/d/${res.id}`;
                      finalUrls.push(webUrl);
                      await dbService.putBlob(res.id, blob).catch(() => {});
                  } else {
                      finalUrls.push(img);
                  }
              } catch(e) {
                  finalUrls.push(img);
              }
          }
          return finalUrls;
      } catch(e) {
          return images;
      }
  },

  async addProjectLog(projectId: string, log: ProjectLog): Promise<ProjectLog> {
      if (!authService.isAuthenticated()) return log;

      let processedLog = { ...log };
      let driveUrls: string[] = [];
      if (navigator.onLine && !authService.isGuest() && accessToken && log.images && log.images.length > 0) {
          try {
              driveUrls = await this.uploadLogImagesToDrive(projectId, log.images);
              if (driveUrls.length > 0) {
                  processedLog.images = driveUrls;
              }
          } catch(e) {}
      }

      let project: Project | undefined;
      try {
          project = await this.getProjectById(projectId);
          if (project) {
              const existingLogs = (project.executionLogs || []).filter(l => l.id !== processedLog.id);
              const newLogs = [processedLog, ...existingLogs];
              const updatedProj = { ...project, executionLogs: newLogs };
              await dbService.putItem('projects', updatedProj);

              const memProjects = this.getCachedProjects();
              if (memProjects && memProjects.length > 0) {
                  const updatedList = memProjects.map(p => p.id === projectId ? updatedProj : p);
                  updateCache('projects_list', updatedList);
                  saveToSyncCache(LOCAL_STORAGE_PROJECTS_KEY, updatedList);
              }
          }
      } catch(e) {}

      if (navigator.onLine && !authService.isGuest() && accessToken) {
          try {
              const sheetLog = {
                  ...processedLog,
                  images: driveUrls.length > 0 ? driveUrls : (processedLog.images || [])
              };
              await googleSheetsService.addExecutionLog(projectId, sheetLog, accessToken, project);
          } catch (e: any) { 
              console.warn("Google Sheets log save queued locally", e);
          }
      }
      notifyDataChanged('log_added', { projectId, log: processedLog });
      return processedLog;
  },

  async updateProjectLog(projectId: string, log: ProjectLog): Promise<ProjectLog> {
      if (!authService.isAuthenticated()) return log;

      let processedLog = { ...log };
      let driveUrls: string[] = [];

      // Find existing log in cached/stored project to reuse already-uploaded Drive images
      let existingImages: string[] = [];
      try {
          const currentProject = await this.getProjectById(projectId);
          const existingLog = currentProject?.executionLogs?.find(l => l.id === log.id);
          if (existingLog && existingLog.images) {
              existingImages = existingLog.images;
          }
      } catch(e) {}

      if (navigator.onLine && !authService.isGuest() && accessToken && log.images && log.images.length > 0) {
          try {
              driveUrls = await this.uploadLogImagesToDrive(projectId, log.images, existingImages);
              if (driveUrls.length > 0) {
                  processedLog.images = driveUrls;
              }
          } catch(e) {}
      }

      try {
          const project = await this.getProjectById(projectId);
          if (project && project.executionLogs) {
              const newLogs = project.executionLogs.map(l => l.id === processedLog.id ? processedLog : l);
              const updatedProj = { ...project, executionLogs: newLogs };
              await dbService.putItem('projects', updatedProj);

              const memProjects = this.getCachedProjects();
              if (memProjects && memProjects.length > 0) {
                  const updatedList = memProjects.map(p => p.id === projectId ? updatedProj : p);
                  updateCache('projects_list', updatedList);
                  saveToSyncCache(LOCAL_STORAGE_PROJECTS_KEY, updatedList);
              }
          }
      } catch(e) {}

      if (navigator.onLine && accessToken && !authService.isGuest()) {
          try {
              const sheetLog = {
                  ...processedLog,
                  images: driveUrls.length > 0 ? driveUrls : (processedLog.images || [])
              };
              await googleSheetsService.updateExecutionLog(projectId, sheetLog, accessToken);
          } catch (e: any) { 
              console.warn("Google Sheets log update queued locally", e); 
          }
      }
      notifyDataChanged('log_updated', { projectId, log: processedLog });
      return processedLog;
  },

  extractDriveFileId(urlOrId: string): string | null {
      if (!urlOrId || typeof urlOrId !== 'string') return null;
      const trimmed = urlOrId.trim();
      if (trimmed.startsWith('data:')) return null;
      const m0 = trimmed.match(/googleusercontent\.com\/d\/([a-zA-Z0-9_-]+)/);
      if (m0 && m0[1]) return m0[1];
      const m1 = trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/);
      if (m1 && m1[1]) return m1[1];
      const m2 = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
      if (m2 && m2[1]) return m2[1];
      const m3 = trimmed.match(/files\/([a-zA-Z0-9_-]+)/);
      if (m3 && m3[1]) return m3[1];
      if (/^[a-zA-Z0-9_-]{20,60}$/.test(trimmed)) {
          return trimmed;
      }
      return null;
  },

  async moveDeletedLogImages(projectId: string, images: string[]): Promise<void> {
      if (!navigator.onLine || !accessToken || authService.isGuest() || !images || images.length === 0) return;
      try {
          const project = await this.getProjectById(projectId);
          const parentFolderId = project?.driveFolderId || projectId;
          const logFolderId = await this.ensureSubfolder(parentFolderId, 'صور سجل الحافظة');
          if (!logFolderId) return;

          const deletedFolderId = await this.ensureSubfolder(logFolderId, 'صور اليوميات المحذوفة');
          if (!deletedFolderId) return;

          for (const imgUrl of images) {
              const fileId = this.extractDriveFileId(imgUrl);
              if (fileId) {
                  try {
                      // Fetch current parents of the file to remove them cleanly
                      const meta = await fetchDrive(`files/${fileId}?fields=id,parents`);
                      const parents = meta?.parents || [];
                      const oldParents = parents.length > 0 ? parents.join(',') : logFolderId;

                      await fetchDrive(`files/${fileId}?addParents=${deletedFolderId}&removeParents=${oldParents}&fields=id,parents`, {
                          method: 'PATCH'
                      });
                      console.log(`[Drive] Moved file ${fileId} into صور اليوميات المحذوفة`);
                  } catch (e1) {
                      try {
                          await fetchDrive(`files/${fileId}?addParents=${deletedFolderId}&removeParents=${logFolderId}&fields=id,parents`, {
                              method: 'PATCH'
                          });
                      } catch (e2) {
                          console.warn(`Could not move deleted log image ${fileId}:`, e2);
                      }
                  }
              }
          }
      } catch (err) {
          console.warn("Error in moveDeletedLogImages:", err);
      }
  },

  async restoreLogImages(projectId: string, images: string[]): Promise<void> {
      if (!navigator.onLine || !accessToken || authService.isGuest() || !images || images.length === 0) return;
      try {
          const project = await this.getProjectById(projectId);
          const parentFolderId = project?.driveFolderId || projectId;
          const logFolderId = await this.ensureSubfolder(parentFolderId, 'صور سجل الحافظة');
          if (!logFolderId) return;

          const deletedFolderId = await this.ensureSubfolder(logFolderId, 'صور اليوميات المحذوفة');
          if (!deletedFolderId) return;

          for (const imgUrl of images) {
              const fileId = this.extractDriveFileId(imgUrl);
              if (fileId) {
                  try {
                      await fetchDrive(`files/${fileId}?addParents=${logFolderId}&removeParents=${deletedFolderId}&fields=id,parents`, {
                          method: 'PATCH'
                      });
                  } catch (e) {}
              }
          }
      } catch (err) {}
  },

  async deleteProjectLog(projectId: string, logId: string, logItem?: ProjectLog): Promise<void> {
      if (!authService.isAuthenticated()) return;
      let logToDelete: ProjectLog | undefined = logItem;
      try {
          const project = await this.getProjectById(projectId);
          if (project && project.executionLogs) {
              if (!logToDelete) {
                  logToDelete = project.executionLogs.find(l => l.id === logId);
              }
              // Mark as deleted in project execution logs
              const newLogs = project.executionLogs.map(l => l.id === logId ? { ...l, isDeleted: true, status: 'محذوف', deletedAt: new Date().toISOString() } : l);
              const updatedProj = { ...project, executionLogs: newLogs };
              await dbService.putItem('projects', updatedProj);

              const memProjects = this.getCachedProjects();
              if (memProjects && memProjects.length > 0) {
                  const updatedList = memProjects.map(p => p.id === projectId ? updatedProj : p);
                  updateCache('projects_list', updatedList);
                  saveToSyncCache(LOCAL_STORAGE_PROJECTS_KEY, updatedList);
              }
          }
      } catch(e) {}

      // Collect all images to move to 'صور اليوميات المحذوفة'
      let imagesToMove: string[] = logToDelete?.images || [];

      // Also check Google Sheets to make sure we don't miss any Drive URLs
      if (navigator.onLine && accessToken && !authService.isGuest()) {
          try {
              const sheetImages = await googleSheetsService.getLogImages(projectId, logId, accessToken);
              if (sheetImages && sheetImages.length > 0) {
                  imagesToMove = Array.from(new Set([...imagesToMove, ...sheetImages]));
              }
          } catch(e) {}
      }

      // Automatically move images of deleted log into 'صور اليوميات المحذوفة' inside 'صور سجل الحافظة'
      if (imagesToMove.length > 0 && navigator.onLine && accessToken && !authService.isGuest()) {
          try {
              await this.moveDeletedLogImages(projectId, imagesToMove);
          } catch(e) {
              console.warn("Google Drive move deleted log images failed:", e);
          }
      }

      if (navigator.onLine && accessToken && !authService.isGuest()) {
          try {
              await googleSheetsService.deleteExecutionLog(projectId, logId, accessToken);
          } catch (e: any) { 
              console.warn("Google Sheets log deletion queued locally", e);
          }
      }
      notifyDataChanged('log_deleted', { projectId, logId });
  },

  async restoreProjectLog(projectId: string, logId: string, logItem?: ProjectLog): Promise<void> {
      if (!authService.isAuthenticated()) return;
      let logToRestore: ProjectLog | undefined = logItem;
      try {
          const project = await dbService.getItem<Project>('projects', projectId);
          if (project && project.executionLogs) {
              if (!logToRestore) {
                  logToRestore = project.executionLogs.find(l => l.id === logId);
              }
              const newLogs = project.executionLogs.map(l => l.id === logId ? { ...l, isDeleted: false, status: 'نشط', deletedAt: undefined } : l);
              const updatedProj = { ...project, executionLogs: newLogs };
              await dbService.putItem('projects', updatedProj);

              const memProjects = this.getCachedProjects();
              if (memProjects && memProjects.length > 0) {
                  const updatedList = memProjects.map(p => p.id === projectId ? updatedProj : p);
                  updateCache('projects_list', updatedList);
                  saveToSyncCache(LOCAL_STORAGE_PROJECTS_KEY, updatedList);
              }
          }
      } catch(e) {}

      if (logToRestore && logToRestore.images && logToRestore.images.length > 0 && navigator.onLine && accessToken && !authService.isGuest()) {
          try {
              await this.restoreLogImages(projectId, logToRestore.images);
          } catch(e) {}
      }

      if (navigator.onLine && accessToken && !authService.isGuest()) {
          try {
              await googleSheetsService.restoreExecutionLog(projectId, logId, accessToken);
          } catch (e: any) {}
      }
      notifyDataChanged('log_updated', { projectId, logId });
  },

  async updateProjectMasterData(id: string, data: any): Promise<any> { 
      const project = await dbService.getItem<Project>('projects', id);
      const updatedProject = project ? { ...project, ...data } : { id, ...data };
      await dbService.putItem('projects', updatedProject);

      if (navigator.onLine && accessToken && !authService.isGuest()) {
          try {
              await googleSheetsService.syncProjectDataToSpreadsheet(updatedProject, accessToken);
          } catch(e) {
              console.warn("Master data saved locally, will sync to Sheets later", e);
          }
      }
      notifyDataChanged('master_data_updated', { id, data });
      return updatedProject;
  },

  async deleteProject(id: string, projectName?: string): Promise<void> { 
      if (!authService.isAuthenticated()) return; 
      triggerLoadingStart(); 
      contentCache.delete('projects_list'); 

      let name = projectName;
      if (!name) {
          try {
              const localP = await dbService.getItem<Project>('projects', id);
              if (localP) name = localP.name;
          } catch(e) {}
      }

      addDeletedTombstone(id, name);

      try { await dbService.deleteItem('projects', id); } catch(e) {} 
      try { await firestoreSyncService.deleteProject(id); } catch(e) {} 
      
      if (name) {
          try {
              const allLocal = await dbService.getAllItems<Project>('projects');
              for (const p of allLocal) {
                  if (p.name && p.name.trim().toLowerCase() === name.trim().toLowerCase()) {
                      await dbService.deleteItem('projects', p.id);
                  }
              }
          } catch(e) {}
      }

      localStorage.removeItem(LOCAL_STORAGE_PROJECTS_KEY); 
      try {
          localStorage.removeItem(`project_name_${id}`);
          localStorage.removeItem(`folder_name_${id}`);
          const activeRoute = localStorage.getItem('app_last_active_route');
          if (activeRoute && activeRoute.includes(id)) {
              localStorage.removeItem('app_last_active_route');
          }
      } catch(e) {}
      
      if (!authService.isGuest() && accessToken) {
          try { 
              await fetchDrive(`files/${id}`, { method: 'DELETE' }).catch(() => {}); 
          } catch (e) {
              console.warn("Delete project Google Drive call error:", e);
          } 
      }
      triggerLoadingStop(); 
      notifyDataChanged('project_deleted', { id, name });
  },

  async ensureProjectDriveSubfolders(projectId: string): Promise<FileItem[]> {
      if (!navigator.onLine || !accessToken || authService.isGuest()) return [];
      
      const project = await dbService.getItem<Project>('projects', projectId);
      const targetDriveFolderId = project?.driveFolderId || projectId;
      if (!targetDriveFolderId) return [];

      if (inFlightProjectSubfolders.has(targetDriveFolderId)) {
          return inFlightProjectSubfolders.get(targetDriveFolderId)!;
      }

      const task = (async (): Promise<FileItem[]> => {
          try {
              const query = `'${targetDriveFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
              const driveRes = await fetchDrive(`files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,createdTime)&orderBy=createdTime asc`);
              const existingFolders: any[] = driveRes.files || [];

              // Ensure default folders exist if missing, without deleting user-created custom folders
              const subItems: FileItem[] = [];

              for (let idx = 0; idx < DEFAULT_SUBFOLDERS.length; idx++) {
                  const subName = DEFAULT_SUBFOLDERS[idx];
                  const normSub = normalizeArabic(subName);
                  
                  const matches = existingFolders.filter(f => {
                      const fNorm = normalizeArabic(f.name || '');
                      return fNorm === normSub || f.name === subName;
                  });

                  let matched = matches[0];

                  // Deduplicate extra duplicate folders in Google Drive
                  if (matches.length > 1) {
                      for (let i = 1; i < matches.length; i++) {
                          fetchDrive(`files/${matches[i].id}`, { method: 'DELETE' }).catch(() => {});
                      }
                  }

                  if (!matched) {
                      try {
                          const createRes = await fetchDrive('files', {
                              method: 'POST',
                              body: JSON.stringify({
                                  name: subName,
                                  mimeType: 'application/vnd.google-apps.folder',
                                  parents: [targetDriveFolderId]
                              })
                          });
                          if (createRes && createRes.id) {
                              matched = { id: createRes.id, name: subName };
                          }
                      } catch(e) {}
                  }

                  if (matched) {
                      if (!isHiddenSystemItem(subName)) {
                          const subItem: FileItem = {
                              id: matched.id,
                              parentId: targetDriveFolderId,
                              name: subName,
                              type: ItemType.FOLDER,
                              mimeType: 'application/vnd.google-apps.folder',
                              createdTime: matched.createdTime || new Date().toISOString(),
                              fileCount: 0,
                              folderCount: 0
                          };
                          await dbService.putItem('files', subItem);
                          subItems.push(subItem);
                      } else {
                          await dbService.deleteItem('files', matched.id).catch(() => {});
                      }

                      const tempSubId = `${projectId}_sub_${idx}`;
                      const allLocalFiles = await dbService.getAllItems<FileItem>('files');
                      const orphanFiles = allLocalFiles.filter(f => f.parentId === tempSubId);

                      for (const orphan of orphanFiles) {
                          const updatedOrphan = { ...orphan, parentId: matched.id };
                          await dbService.putItem('files', updatedOrphan);

                          const blob = await dbService.getBlob(orphan.id);
                          if (blob) {
                              try {
                                  const fileObj = new File([blob], orphan.name, { type: orphan.mimeType || blob.type });
                                  let res;
                                  if (fileObj.size > 4 * 1024 * 1024) res = await uploadFileResumable(matched.id, fileObj);
                                  else res = await uploadFileDirect(matched.id, fileObj);

                                  if (res && res.id) {
                                      const realFile: FileItem = {
                                          id: res.id,
                                          parentId: matched.id,
                                          name: orphan.name,
                                          type: ItemType.FILE,
                                          mimeType: orphan.mimeType || blob.type,
                                          createdTime: new Date().toISOString(),
                                          webViewLink: res.webViewLink,
                                          webContentLink: res.webContentLink,
                                          previewUrl: res.thumbnailLink,
                                          size: orphan.size
                                      };
                                      await dbService.putItem('files', realFile);
                                      await dbService.putBlob(res.id, blob);
                                      if (orphan.id !== res.id) {
                                          await dbService.deleteItem('files', orphan.id);
                                          await dbService.deleteItem('file_blobs', orphan.id);
                                      }
                                  }
                              } catch(e) {
                                  console.warn("Error uploading orphan file to Drive:", e);
                              }
                          }
                      }

                      await dbService.deleteItem('files', tempSubId).catch(()=>{});
                  }
              }

              if (subItems.length > 0) {
                  updateCache(targetDriveFolderId, subItems);
                  saveToSyncCache(targetDriveFolderId, subItems);
              }

              return subItems;
          } catch (e) {
              return [];
          }
      })();

      inFlightProjectSubfolders.set(targetDriveFolderId, task);
      try {
          const res = await task;
          return res;
      } finally {
          inFlightProjectSubfolders.delete(targetDriveFolderId);
      }
  },

  async getContents(folderId: string, includeSystemFolders: boolean = false): Promise<FileItem[]> { 
      if (!authService.isAuthenticated()) return []; 
      const rootId = await this.ensureRootFolder(); 
      let targetId = (folderId && folderId !== 'undefined') ? folderId : rootId; 
      if (!targetId || targetId === 'archive_root' || targetId === 'archive' || targetId === 'root') {
          targetId = rootId;
      }
      
      const allFiles = await dbService.getAllItems<FileItem>('files'); 
      const allProjects = await dbService.getAllItems<Project>('projects');
      const matchingProj = allProjects.find(p => p.id === targetId || p.driveFolderId === targetId);
      const effectiveDriveFolderId = matchingProj?.driveFolderId || (targetId === rootId ? rootId : targetId);

      const calculateFolderCounts = (fId: string) => {
          const children = allFiles.filter(f => f.parentId === fId && !isHiddenSystemItem(f.name, f.mimeType));
          const filesCount = children.filter(f => f.type === ItemType.FILE).length;
          const foldersCount = children.filter(f => f.type === ItemType.FOLDER).length;
          return { fileCount: filesCount, folderCount: foldersCount };
      };

      let localChildren = allFiles.filter(f => !isFileDeleted(f.id) && (f.parentId === targetId || (matchingProj && f.parentId === matchingProj.id) || (matchingProj && f.parentId === matchingProj.driveFolderId))); 
      if (!includeSystemFolders) { 
          localChildren = localChildren.filter(f => !isHiddenSystemItem(f.name, f.mimeType)); 
      } 

      // Pre-seed contentCache for all parent folders found in IndexedDB to ensure instant navigation
      const byParent = new Map<string, FileItem[]>();
      for (const f of allFiles) {
          if (!f.parentId || isFileDeleted(f.id) || isHiddenSystemItem(f.name, f.mimeType)) continue;
          if (!byParent.has(f.parentId)) byParent.set(f.parentId, []);
          byParent.get(f.parentId)!.push(f);
      }
      for (const [pId, items] of byParent.entries()) {
          if (!contentCache.has(pId) && items.length > 0) {
              updateCache(pId, items.sort((a, b) => new Date(a.createdTime).getTime() - new Date(b.createdTime).getTime()));
          }
      }

      localChildren = localChildren.map(item => {
          if (item.type === ItemType.FOLDER) {
              const counts = calculateFolderCounts(item.id);
              return {
                  ...item,
                  fileCount: Math.max(item.fileCount || 0, counts.fileCount),
                  folderCount: Math.max(item.folderCount || 0, counts.folderCount)
              };
          }
          return item;
      });

      localChildren = localChildren.sort((a, b) => new Date(a.createdTime).getTime() - new Date(b.createdTime).getTime()); 
      
      updateCache(targetId, localChildren);

      if (!navigator.onLine || authService.isGuest() || !accessToken) {
          return localChildren; 
      }
      
      autoSync.prioritizeFolder(localChildren); 

      if (!contentCache.has(targetId)) triggerLoadingStart(); 
      
      try { 
          let query = `'${effectiveDriveFolderId}' in parents and trashed = false and name != 'metadata.json'`; 
          if (!includeSystemFolders) { 
              query += ` and name != '${ARCHIVE_FOLDER_NAME}' and name != '${HIDDEN_LOGS_FOLDER}' and name != 'المشروعات' and not name contains 'صور سجل' and not name contains 'قاعدة بيانات' and not name contains 'قاعده بيانات' and mimeType != 'application/vnd.google-apps.spreadsheet'`; 
          } 
          const fields = 'files(id, name, mimeType, createdTime, webViewLink, webContentLink, thumbnailLink, size)'; 
          const result = await fetchDrive(`files?q=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}&orderBy=createdTime asc`); 
          
          let data = (result.files || [])
              .filter((f: any) => !isFileDeleted(f.id) && (includeSystemFolders || !isHiddenSystemItem(f.name, f.mimeType)))
              .map((f: any) => {
              const isFolder = f.mimeType === 'application/vnd.google-apps.folder';
              const localCounts = isFolder ? calculateFolderCounts(f.id) : { fileCount: 0, folderCount: 0 };
              const existingLocal = allFiles.find(e => e.id === f.id);
              const initialFileCount = Math.max(existingLocal?.fileCount || 0, localCounts.fileCount);
              const initialFolderCount = Math.max(existingLocal?.folderCount || 0, localCounts.folderCount);

              return { 
                  id: f.id, 
                  parentId: targetId, 
                  name: f.name, 
                  type: isFolder ? ItemType.FOLDER : ItemType.FILE, 
                  mimeType: f.mimeType, 
                  createdTime: f.createdTime, 
                  webViewLink: f.webViewLink, 
                  previewUrl: f.thumbnailLink || (!isFolder ? `https://lh3.googleusercontent.com/d/${f.id}=s220` : undefined), 
                  webContentLink: f.webContentLink, 
                  fileCount: initialFileCount, 
                  folderCount: initialFolderCount, 
                  size: f.size ? parseInt(f.size) : 0 
              };
          }); 

          // Check if targetId is a project folder and has 0 subfolders in Drive -> Auto-repair Drive subfolders
          const isProjectFolder = !!matchingProj;
          const hasDriveSubfolders = data.some(item => item.type === ItemType.FOLDER);

          if (isProjectFolder && !hasDriveSubfolders) {
              const repairedSubfolders = await this.ensureProjectDriveSubfolders(matchingProj ? matchingProj.id : targetId);
              if (repairedSubfolders.length > 0) {
                  data = [...repairedSubfolders, ...data];
              }
          }

          data = data.filter(item => !isFileDeleted(item.id) && (includeSystemFolders || !isHiddenSystemItem(item.name, item.mimeType)));
          
          for (const item of data) {
              if (!isFileDeleted(item.id) && !isHiddenSystemItem(item.name, item.mimeType)) {
                  await dbService.putItem('files', item);
              }
          } 
          // Purge stale local hidden or tombstoned representations for this folder
          for (const local of allFiles) {
              if (isFileDeleted(local.id) || ((local.parentId === targetId || local.parentId === effectiveDriveFolderId) && isHiddenSystemItem(local.name, local.mimeType))) {
                  await dbService.deleteItem('files', local.id).catch(() => {});
              }
          }

          updateCache(targetId, data); 
          if (effectiveDriveFolderId !== targetId) {
              updateCache(effectiveDriveFolderId, data);
          }
          autoSync.prioritizeFolder(data);

          triggerLoadingStop(); 
          return data; 
      } catch (e) { 
          triggerLoadingStop(); 
          return localChildren; 
      } 
  },

  async enrichItemCounts(items: FileItem[]): Promise<FileItem[]> { 
      if (!navigator.onLine || !accessToken) return items;
      const folders = items.filter(i => i.type === ItemType.FOLDER); 
      if (folders.length === 0) return items; 
      const updatedItems = [...items]; 
      const promises = folders.map(async (folder) => { 
          try { 
              const query = `'${folder.id}' in parents and trashed = false`; 
              const res = await fetchDrive(`files?q=${encodeURIComponent(query)}&fields=files(mimeType,id,name)`); 
              if (res && res.files) { 
                  const validFiles = res.files.filter((f: any) => !isHiddenSystemItem(f.name, f.mimeType));
                  const filesCount = validFiles.filter((f: any) => f.mimeType !== 'application/vnd.google-apps.folder').length; 
                  const foldersCount = validFiles.filter((f: any) => f.mimeType === 'application/vnd.google-apps.folder').length; 
                  const idx = updatedItems.findIndex(i => i.id === folder.id); 
                  if (idx !== -1) { 
                      const updatedFolder = { ...updatedItems[idx], fileCount: filesCount, folderCount: foldersCount };
                      updatedItems[idx] = updatedFolder;
                      await dbService.putItem('files', updatedFolder);
                  } 
              } 
          } catch(e) {} 
      }); 
      await Promise.all(promises); 
      if (items.length > 0 && items[0].parentId) {
          updateCache(items[0].parentId, updatedItems);
      }
      return updatedItems; 
  },

  async getFileMetadata(id: string): Promise<FileItem | null> { 
      if (!authService.isAuthenticated()) return null; 
      const localFile = await dbService.getItem<FileItem>('files', id);
      if (localFile) return localFile;
      if (!navigator.onLine || !accessToken) { return localFile || null; }
      try { 
          const res = await fetchDrive(`files/${id}?fields=id,name,mimeType,parents,createdTime,size`); 
          const item: FileItem = { 
              id: res.id, 
              name: res.name, 
              type: res.mimeType === 'application/vnd.google-apps.folder' ? ItemType.FOLDER : ItemType.FILE, 
              parentId: res.parents?.[0] || '', 
              createdTime: res.createdTime, 
              size: res.size ? parseInt(res.size) : 0 
          };
          dbService.putItem('files', item).catch(() => {});
          return item;
      } catch (e) { return localFile || null; } 
  },

  async createFolder(parentId: string, name: string): Promise<FileItem> { 
      if (!authService.isAuthenticated()) throw new Error("AUTH_REQUIRED"); 
      contentCache.delete(parentId); 
      triggerLoadingStart(); 

      try {
          const parentFolder = await dbService.getItem<FileItem>('files', parentId);
          if (parentFolder && parentFolder.type === ItemType.FOLDER) {
              await dbService.putItem('files', {
                  ...parentFolder,
                  folderCount: (parentFolder.folderCount || 0) + 1
              });
          }
      } catch(e) {}

      const tempId = `folder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const localFolder: FileItem = { 
          id: tempId, 
          parentId, 
          name, 
          type: ItemType.FOLDER, 
          createdTime: new Date().toISOString(), 
          mimeType: 'application/vnd.google-apps.folder', 
          fileCount: 0, 
          folderCount: 0 
      };
      try { await dbService.putItem('files', localFolder); } catch(e) {}
      if (!navigator.onLine || !accessToken) { 
          triggerLoadingStop(); 
          notifyDataChanged('folder_created', { parentId, id: tempId });
          return localFolder; 
      }
      try { 
          const folder = await fetchDrive('files', { 
              method: 'POST', 
              body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }) 
          }); 
          await dbService.deleteItem('files', tempId);
          const realFolder: FileItem = { id: folder.id, parentId, name, type: ItemType.FOLDER, createdTime: new Date().toISOString(), fileCount: 0, folderCount: 0 };
          await dbService.putItem('files', realFolder);
          triggerLoadingStop(); 
          notifyDataChanged('folder_created', { parentId, id: folder.id });
          return realFolder;
      } catch(e) { triggerLoadingStop(); throw e; } 
  },

  async renameItem(id: string, newName: string): Promise<void> { 
      if (!authService.isAuthenticated()) return; 
      const item = await dbService.getItem<FileItem>('files', id);
      if (item) { 
          await dbService.putItem('files', { ...item, name: newName }); 
          contentCache.delete(item.parentId);
      }
      if (!navigator.onLine || !accessToken) {
          notifyDataChanged('item_renamed', { id, newName });
          return;
      }
      triggerLoadingStart(); 
      await fetchDrive(`files/${id}`, { method: 'PATCH', body: JSON.stringify({ name: newName }) }); 
      triggerLoadingStop(); 
      notifyDataChanged('item_renamed', { id, newName });
  },

  async moveItem(fileId: string, currentParentId: string, newParentId: string): Promise<void> { 
      if (!authService.isAuthenticated()) return; 
      const item = await dbService.getItem<FileItem>('files', fileId);
      if (item) { await dbService.putItem('files', { ...item, parentId: newParentId }); }
      contentCache.delete(currentParentId); 
      contentCache.delete(newParentId); 
      if (!navigator.onLine || !accessToken) {
          notifyDataChanged('item_moved', { fileId, currentParentId, newParentId });
          return;
      }
      triggerLoadingStart(); 
      await fetchDrive(`files/${fileId}?addParents=${newParentId}&removeParents=${currentParentId}`, { method: 'PATCH' }); 
      triggerLoadingStop(); 
      notifyDataChanged('item_moved', { fileId, currentParentId, newParentId });
  },

  async shareItem(fileId: string): Promise<string> { 
      if (!authService.isAuthenticated()) throw new Error("AUTH_REQUIRED"); 
      try { 
          await fetchDrive(`files/${fileId}/permissions`, { 
              method: 'POST', 
              body: JSON.stringify({ role: 'reader', type: 'anyone' }) 
          }); 
      } catch (e) {} 
      const res = await fetchDrive(`files/${fileId}?fields=webViewLink`); 
      return res.webViewLink; 
  },

  async shareSmart(item: FileItem, fileObj?: File): Promise<void> { 
      try { 
          if (!navigator.share) { 
              return; 
          } 
          if (item.type === ItemType.FOLDER || !fileObj) { 
              const url = item.webViewLink || (window.location.origin + '/#/project/' + item.parentId + '/' + item.id); 
              await navigator.share({ title: item.name, text: `مشاركة ملف: ${item.name}`, url: url }); 
              return; 
          } 
          if (navigator.canShare && navigator.canShare({ files: [fileObj] })) { 
              await navigator.share({ files: [fileObj], title: item.name, text: item.name }); 
          } else { 
              const url = URL.createObjectURL(fileObj); 
              const a = document.createElement('a'); 
              a.href = url; 
              a.download = fileObj.name; 
              document.body.appendChild(a); 
              a.click(); 
              document.body.removeChild(a); 
              URL.revokeObjectURL(url); 
          } 
      } catch (error: any) { } 
  },

  async deleteItem(id: string, parentId: string): Promise<void> { 
      if (!authService.isAuthenticated()) return; 
      addDeletedFileTombstone(id);
      contentCache.delete(parentId); 
      try { await dbService.deleteItem('file_blobs', id); } catch(e){}
      contentCache.forEach((value, key) => { 
          if (Array.isArray(value.data)) { 
              value.data = value.data.filter((f: any) => f.id !== id && !isFileDeleted(f.id)); 
          } 
      }); 
      try { 
          const recentRaw = localStorage.getItem(LOCAL_STORAGE_RECENT_FILES_KEY); 
          if (recentRaw) { 
              const recent = JSON.parse(recentRaw); 
              const updatedRecent = recent.filter((f: any) => f.id !== id && !isFileDeleted(f.id)); 
              localStorage.setItem(LOCAL_STORAGE_RECENT_FILES_KEY, JSON.stringify(updatedRecent)); 
          } 
      } catch (e) {} 

      try {
          const targetItem = await dbService.getItem<FileItem>('files', id);
          const parentFolder = await dbService.getItem<FileItem>('files', parentId);
          if (parentFolder && parentFolder.type === ItemType.FOLDER && targetItem) {
              if (targetItem.type === ItemType.FILE) {
                  await dbService.putItem('files', {
                      ...parentFolder,
                      fileCount: Math.max(0, (parentFolder.fileCount || 1) - 1)
                  });
              } else if (targetItem.type === ItemType.FOLDER) {
                  await dbService.putItem('files', {
                      ...parentFolder,
                      folderCount: Math.max(0, (parentFolder.folderCount || 1) - 1)
                  });
              }
          }
      } catch(e) {}

      try { await dbService.deleteItem('files', id); } catch(e) {} 
      try { await firestoreSyncService.deleteFileItem(id); } catch(e) {} 
      if (!navigator.onLine || !accessToken) {
          notifyDataChanged('file_deleted', { parentId, id });
          return;
      }
      triggerLoadingStart(); 
      try { 
          await fetchDrive(`files/${id}`, { method: 'DELETE' }); 
      } catch(e: any) { 
          if (e.message && (e.message.includes('403') || e.message.includes('Forbidden'))) throw new Error("ليس لديك صلاحية لحذف هذا الملف."); 
          if (!e.message || !e.message.includes('404')) throw e; 
      } finally { 
          triggerLoadingStop(); 
          notifyDataChanged('file_deleted', { parentId, id });
      } 
  },

  async uploadFile(parentId: string, file: File, onProgress?: (percent: number) => void, options?: { suppressGlobalLoader?: boolean }): Promise<any> { 
      if (!authService.isAuthenticated()) throw new Error("AUTH_REQUIRED"); 
      const uploadStatusText = `جاري رفع الملف: ${file.name}`;
      if (!options?.suppressGlobalLoader) {
          triggerLoadingStart(uploadStatusText);
      } 
      contentCache.delete(parentId);

      const handleProgress = (p: number) => {
          if (!options?.suppressGlobalLoader) {
              triggerLoadingProgress(p, uploadStatusText);
          }
          if (onProgress) onProgress(p);
      };

      try {
          const parentFolder = await dbService.getItem<FileItem>('files', parentId);
          if (parentFolder && parentFolder.type === ItemType.FOLDER) {
              await dbService.putItem('files', {
                  ...parentFolder,
                  fileCount: (parentFolder.fileCount || 0) + 1
              });
          }
      } catch(e) {}

      // Instant Optimistic Insertion into local store so UI updates immediately (0ms)
      const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const isImage = file.type.startsWith('image/');
      let localContent: string | undefined = undefined;
      
      // Read data URL if small image for instant thumbnail rendering
      if (isImage && file.size < 8 * 1024 * 1024) {
          try {
              localContent = await new Promise<string>((resolve) => {
                  const reader = new FileReader();
                  reader.onloadend = () => resolve(reader.result as string);
                  reader.readAsDataURL(file);
              });
          } catch(e) {}
      }

      const optimisticItem: FileItem = {
          id: tempId,
          parentId,
          name: file.name,
          mimeType: file.type,
          type: ItemType.FILE,
          createdTime: new Date().toISOString(),
          size: file.size,
          content: localContent,
          previewUrl: localContent
      };
      await dbService.putItem('files', optimisticItem);
      try { await dbService.putBlob(tempId, file); } catch(e){}
      notifyDataChanged('file_uploaded', { parentId, id: tempId });

      // Resolve target Google Drive folder ID for portfolio root or subfolders
      let targetDriveFolderId = parentId;
      try {
          const rootId = await this.ensureRootFolder();
          
          if (!parentId || parentId === 'archive_root' || parentId === 'archive' || parentId === 'root' || parentId === rootId || parentId === 'undefined') {
              targetDriveFolderId = rootId;
          } else {
              const allProjects = await dbService.getAllItems<Project>('projects');
              const matchingProj = allProjects.find(p => p.id === parentId || p.driveFolderId === parentId);
              if (matchingProj) {
                  if (matchingProj.driveFolderId && !matchingProj.driveFolderId.startsWith('proj_') && !matchingProj.driveFolderId.startsWith('local_')) {
                      targetDriveFolderId = matchingProj.driveFolderId;
                  } else {
                      const driveFolder = await fetchDrive('files', {
                          method: 'POST',
                          body: JSON.stringify({
                              name: matchingProj.name,
                              mimeType: 'application/vnd.google-apps.folder',
                              parents: [rootId]
                          })
                      });
                      if (driveFolder && driveFolder.id) {
                          targetDriveFolderId = driveFolder.id;
                          matchingProj.driveFolderId = driveFolder.id;
                          await dbService.putItem('projects', matchingProj);
                      }
                  }
              } else {
                  const parentFolderItem = await dbService.getItem<FileItem>('files', parentId);
                  if (parentFolderItem && parentFolderItem.parentId) {
                      const pProj = allProjects.find(p => p.id === parentFolderItem.parentId || p.driveFolderId === parentFolderItem.parentId);
                      if (pProj) {
                          const subs = await this.ensureProjectDriveSubfolders(pProj.id);
                          const matched = subs.find(s => s.name === parentFolderItem.name);
                          if (matched && matched.id) {
                              targetDriveFolderId = matched.id;
                          }
                      }
                  } else if (parentId.startsWith('proj_') || parentId.startsWith('folder_') || parentId.startsWith('temp_') || parentId.startsWith('local_')) {
                      targetDriveFolderId = rootId;
                  }
              }
          }
      } catch (err) {
          console.warn("Could not resolve target Drive folder ID for upload:", err);
          if (detectedRootFolderId) targetDriveFolderId = detectedRootFolderId;
      }

      if (!navigator.onLine || authService.isGuest() || !accessToken) {
          if (!authService.isGuest()) {
              await syncService.addToQueue(SyncActionType.UPLOAD_FILE, { parentId, tempId, name: file.name, mimeType: file.type });
              syncService.processQueue();
          }
          if (!options?.suppressGlobalLoader) {
              triggerLoadingStop();
          }
          if (onProgress) onProgress(100);
          return optimisticItem;
      }

      let result;
      try {
          if (file.size > 4 * 1024 * 1024) result = await uploadFileResumable(targetDriveFolderId, file, handleProgress);
          else result = await uploadFileDirect(targetDriveFolderId, file, handleProgress);
      } finally {
          if (!options?.suppressGlobalLoader) {
              triggerLoadingStop();
          }
      }

      // Replace temp item with real Drive item
      await dbService.deleteItem('files', tempId);
      await dbService.deleteItem('file_blobs', tempId);

      const newItem: FileItem = {
          id: result.id,
          parentId,
          name: file.name,
          mimeType: file.type,
          type: ItemType.FILE,
          createdTime: result.createdTime || new Date().toISOString(),
          webViewLink: result.webViewLink,
          webContentLink: result.webContentLink,
          previewUrl: result.thumbnailLink || localContent || `https://lh3.googleusercontent.com/d/${result.id}=s220`,
          size: file.size,
          content: localContent
      };

      await dbService.putItem('files', newItem);
      try { await firestoreSyncService.saveFileItem(newItem); } catch(e) {}
      if (targetDriveFolderId !== parentId) {
          await dbService.putItem('files', { ...newItem, parentId: targetDriveFolderId });
          contentCache.delete(targetDriveFolderId);
      }
      contentCache.delete(parentId);
      try { await dbService.putBlob(result.id, file); } catch(e){}
      notifyDataChanged('file_uploaded', { parentId, id: result.id, targetDriveFolderId });
      return newItem;
  },

  async saveLetter(parentId: string, name: string, content: string, fileId?: string, projectId?: string): Promise<FileItem> { 
      if (!authService.isAuthenticated()) throw new Error("AUTH_REQUIRED"); 
      
      let targetParentId = parentId;
      let projectDriveFolderId = '';
      let effectiveProjectId = projectId || '';

      // 1. Resolve effective project and project's Drive folder ID
      if (effectiveProjectId) {
          try {
              const p = await this.getProjectById(effectiveProjectId);
              if (p) {
                  projectDriveFolderId = p.driveFolderId || p.id;
              }
          } catch(e) {}
      }

      if (!projectDriveFolderId && parentId) {
          try {
              const directProj = await this.getProjectById(parentId);
              if (directProj) {
                  effectiveProjectId = directProj.id;
                  projectDriveFolderId = directProj.driveFolderId || directProj.id;
              } else {
                  // Check if parentId is formatted as projectId_sub_...
                  const subMatch = parentId.match(/^(.*?)_sub_\d+$/);
                  if (subMatch) {
                      const possibleProjId = subMatch[1];
                      const p = await this.getProjectById(possibleProjId);
                      if (p) {
                          effectiveProjectId = p.id;
                          projectDriveFolderId = p.driveFolderId || p.id;
                      }
                  }
              }
          } catch(e) {}
      }

      // If still not resolved, traverse parent hierarchy in files
      if (!projectDriveFolderId && parentId) {
          try {
              let currId: string | null = parentId;
              let depth = 0;
              while (currId && depth < 5) {
                  depth++;
                  const parentItem: FileItem | null = await dbService.getItem<FileItem>('files', currId);
                  if (parentItem && parentItem.parentId) {
                      const p = await this.getProjectById(parentItem.parentId);
                      if (p) {
                          effectiveProjectId = p.id;
                          projectDriveFolderId = p.driveFolderId || p.id;
                          break;
                      }
                      currId = parentItem.parentId;
                  } else {
                      break;
                  }
              }
          } catch(e) {}
      }

      // If still not found, check all projects
      if (!projectDriveFolderId) {
          try {
              const allProjects = await this.getProjects();
              const found = allProjects.find(p => p.id === parentId || p.driveFolderId === parentId || (parentId && parentId.startsWith(p.id)));
              if (found) {
                  effectiveProjectId = found.id;
                  projectDriveFolderId = found.driveFolderId || found.id;
              }
          } catch(e) {}
      }

      // 2. ALWAYS save letters into the 'الخطابات' folder
      if (projectDriveFolderId) {
          if (navigator.onLine && accessToken && !authService.isGuest()) {
              try {
                  targetParentId = await this.ensureSubfolder(projectDriveFolderId, 'الخطابات');
              } catch(e) {
                  targetParentId = projectDriveFolderId;
              }
          } else {
              // Offline fallback: locate or create local folder item for 'الخطابات'
              try {
                  const allFiles = await dbService.getAllItems<FileItem>('files');
                  const existingLettersFolder = allFiles.find(f => 
                      f.type === ItemType.FOLDER && 
                      (f.parentId === projectDriveFolderId || f.parentId === effectiveProjectId) && 
                      f.name === 'الخطابات'
                  );
                  if (existingLettersFolder) {
                      targetParentId = existingLettersFolder.id;
                  } else {
                      targetParentId = `${effectiveProjectId || projectDriveFolderId}_letters`;
                      const folderItem: FileItem = {
                          id: targetParentId,
                          parentId: projectDriveFolderId || effectiveProjectId,
                          name: 'الخطابات',
                          type: ItemType.FOLDER,
                          mimeType: 'application/vnd.google-apps.folder',
                          createdTime: new Date().toISOString(),
                          fileCount: 0,
                          folderCount: 0
                      };
                      await dbService.putItem('files', folderItem);
                  }
              } catch(e) {}
          }
      }

      contentCache.delete(targetParentId); 
      contentCache.delete(parentId);
      if (effectiveProjectId) contentCache.delete(effectiveProjectId);

      const fileName = name.endsWith('.html') ? name : `${name}.html`; 
      const blob = new Blob([content], { type: 'text/html' }); 
      let targetFileId = fileId;
      if (!targetFileId) { targetFileId = `doc_${Date.now()}_${Math.random()}`; }
      if (fileId) try{ await dbService.deleteItem('file_blobs', fileId); } catch(e){}
      await dbService.putBlob(targetFileId, blob);
      const fileItem: FileItem = { id: targetFileId, parentId: targetParentId, name: fileName, type: ItemType.FILE, createdTime: new Date().toISOString(), mimeType: 'text/html' };
      await dbService.putItem('files', fileItem);
      if (!navigator.onLine || !accessToken || authService.isGuest()) { return fileItem; }
      triggerLoadingStart(); 
      try { 
          if (fileId) { 
              await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, { 
                  method: 'PATCH', 
                  headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'text/html' }, 
                  body: blob 
              }); 
              try { 
                  // Ensure file is in targetParentId (الخطابات)
                  const metaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=parents`, {
                      headers: { Authorization: `Bearer ${accessToken}` }
                  });
                  let prevParents = '';
                  if (metaRes.ok) {
                      const meta = await metaRes.json();
                      if (meta.parents && !meta.parents.includes(targetParentId)) {
                          prevParents = meta.parents.join(',');
                      }
                  }
                  const patchUrl = prevParents
                      ? `https://www.googleapis.com/drive/v3/files/${fileId}?addParents=${targetParentId}&removeParents=${prevParents}`
                      : `https://www.googleapis.com/drive/v3/files/${fileId}`;

                  await fetch(patchUrl, { 
                      method: 'PATCH', 
                      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, 
                      body: JSON.stringify({ name: fileName }) 
                  }); 
              } catch(e) {} 
              return fileItem; 
          } else { 
              const res = await uploadFileDirect(targetParentId, new File([blob], fileName, { type: 'text/html' })); 
              await dbService.putBlob(res.id, blob); 
              await dbService.deleteItem('files', targetFileId);
              await dbService.deleteItem('file_blobs', targetFileId);
              const realItem: FileItem = { id: res.id, parentId: targetParentId, name: fileName, type: ItemType.FILE, createdTime: new Date().toISOString(), mimeType: 'text/html', webViewLink: res.webViewLink };
              await dbService.putItem('files', realItem);
              notifyDataChanged('file_uploaded', { parentId: targetParentId, id: res.id });
              return realItem; 
          } 
      } finally { triggerLoadingStop(); } 
  },

  async getFileContent(fileId: string): Promise<string> { 
      try { 
          const cachedBlob = await dbService.getBlob(fileId); 
          if (cachedBlob) return await cachedBlob.text(); 
      } catch(e) {}
      if (!authService.isAuthenticated()) return ''; 
      if (!navigator.onLine || !accessToken) return ''; 
      triggerLoadingStart(); 
      try { 
          const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, { 
              headers: { 'Authorization': `Bearer ${accessToken}` } 
          }); 
          const text = await response.text(); 
          const blob = new Blob([text], {type: 'text/html'}); 
          await dbService.putBlob(fileId, blob); 
          return text; 
      } finally { triggerLoadingStop(); } 
  },

  async searchFiles(queryText: string): Promise<FileItem[]> { 
      if (!authService.isAuthenticated() || !accessToken) return []; 
      triggerLoadingStart(); 
      try { 
          const result = await fetchDrive(`files?q=name contains '${queryText}' and trashed = false&fields=files(id, name, mimeType, createdTime, webViewLink, thumbnailLink, parents, size)`); 
          return (result.files || []).map((f: any) => ({ 
              id: f.id, 
              parentId: f.parents?.[0] || '', 
              name: f.name, 
              type: f.mimeType === 'application/vnd.google-apps.folder' ? ItemType.FOLDER : ItemType.FILE, 
              mimeType: f.mimeType, 
              createdTime: f.createdTime, 
              webViewLink: f.webViewLink, 
              previewUrl: f.thumbnailLink || `https://lh3.googleusercontent.com/d/${f.id}=s220`, 
              size: f.size ? parseInt(f.size) : 0 
          })); 
      } finally { triggerLoadingStop(); } 
  },

  // --- TASKS: SYNCED TO GOOGLE SHEETS TAB 'Tasks' ---
  async getTasks(): Promise<Task[]> { 
      if (accessToken && navigator.onLine) {
          try {
              const full = await googleSheetsService.fetchAllData(accessToken);
              if (full.tasks && full.tasks.length > 0) {
                  localTasks = full.tasks;
                  localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(localTasks));
              }
          } catch(e) {}
      }
      return [...localTasks]; 
  },

  async addTask(content: string): Promise<Task> { 
      const newTask: Task = { id: `t${Date.now()}`, content, isDone: false, createdAt: new Date().toISOString() }; 
      localTasks = [newTask, ...localTasks]; 
      localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(localTasks)); 
      if (accessToken && navigator.onLine) {
          googleSheetsService.saveTasks(localTasks, accessToken).catch(console.warn);
      }
      return newTask; 
  },

  async toggleTask(id: string): Promise<void> { 
      const index = localTasks.findIndex(t => t.id === id); 
      if (index !== -1) { 
          localTasks[index].isDone = !localTasks[index].isDone; 
          localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(localTasks)); 
          if (accessToken && navigator.onLine) {
              googleSheetsService.saveTasks(localTasks, accessToken).catch(console.warn);
          }
      } 
  },

  async deleteTask(id: string): Promise<void> { 
      localTasks = localTasks.filter(t => t.id !== id); 
      localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(localTasks)); 
      if (accessToken && navigator.onLine) {
          googleSheetsService.saveTasks(localTasks, accessToken).catch(console.warn);
      }
  },

  async getRecentFiles(): Promise<FileItem[]> { 
      if (!authService.isAuthenticated() || !accessToken) return []; 
      try { 
          const result = await fetchDrive(`files?q=trashed = false and mimeType != 'application/vnd.google-apps.folder' and name != 'metadata.json' and name != '${SPREADSHEET_NAME}'&pageSize=10&orderBy=createdTime desc&fields=files(id, name, mimeType, createdTime, webViewLink, thumbnailLink, parents, size)`); 
          return (result.files || []).map((f: any) => ({ 
              id: f.id, 
              parentId: f.parents?.[0] || '', 
              name: f.name, 
              type: ItemType.FILE, 
              mimeType: f.mimeType, 
              createdTime: f.createdTime, 
              webViewLink: f.webViewLink, 
              previewUrl: f.thumbnailLink || `https://lh3.googleusercontent.com/d/${f.id}=s220`, 
              webContentLink: f.webContentLink, 
              size: f.size ? parseInt(f.size) : 0 
          })); 
      } catch (e) { return []; } 
  },

  // --- MARKET PRICES: SYNCED TO GOOGLE SHEETS TAB 'MarketPrices' ---
  async getMarketPrices(defaultPrices: MarketItem[]): Promise<MarketItem[]> { 
      const saved = localStorage.getItem(LOCAL_STORAGE_MARKET_PRICES_KEY); 
      const localResult = saved ? JSON.parse(saved) : defaultPrices;

      if (!navigator.onLine || !accessToken || authService.isGuest()) { 
          return localResult; 
      } 
      try { 
          const fullData = await googleSheetsService.fetchAllData(accessToken);
          if (fullData.marketPrices && fullData.marketPrices.length > 0) {
              localStorage.setItem(LOCAL_STORAGE_MARKET_PRICES_KEY, JSON.stringify(fullData.marketPrices));
              return fullData.marketPrices;
          }
          // If empty in sheet, save default prices to sheet
          await googleSheetsService.saveMarketPrices(localResult, accessToken);
          return localResult;
      } catch (e: any) { 
          console.warn("Market Prices Sheets sync error:", e);
          return localResult; 
      } 
  },

  async saveMarketPrices(prices: MarketItem[]): Promise<void> { 
      localStorage.setItem(LOCAL_STORAGE_MARKET_PRICES_KEY, JSON.stringify(prices)); 
      if (!navigator.onLine || !accessToken || authService.isGuest()) return; 
      try { 
          await googleSheetsService.saveMarketPrices(prices, accessToken); 
      } catch (e) {
          console.error("Failed to save market prices to Google Sheets", e);
      } 
  },

  async mergeAndSaveMarketPrices(newItems: MarketItem[], existingPrices: MarketItem[]): Promise<void> { 
      const mergedMap = new Map<string, MarketItem>(); 
      existingPrices.forEach(p => mergedMap.set(p.name.trim().toLowerCase(), p)); 
      newItems.forEach(p => { 
          const key = p.name.trim().toLowerCase(); 
          const existing = mergedMap.get(key); 
          if (existing) { 
              mergedMap.set(key, { 
                  ...existing, 
                  price: p.price, 
                  lastUpdated: new Date().toISOString(), 
                  details: p.details || existing.details, 
                  trend: p.price > existing.price ? 'up' : (p.price < existing.price ? 'down' : 'stable') 
              }); 
          } else { 
              mergedMap.set(key, { ...p, lastUpdated: new Date().toISOString(), trend: 'stable' }); 
          } 
      }); 
      const finalPrices = Array.from(mergedMap.values()); 
      await this.saveMarketPrices(finalPrices); 
  },

  async migrateGuestData(): Promise<void> { return; },

  async wipeFullDatabaseAndStorage(): Promise<void> {
      triggerLoadingStart();
      try {
          // 1. Delete root folder and all subfolders/files from Google Drive
          if (!authService.isGuest() && accessToken) {
              try {
                  const rootId = detectedRootFolderId || localStorage.getItem('google_drive_root_id');
                  if (rootId) {
                      await fetchDrive(`files/${rootId}`, { method: 'DELETE' }).catch(() => {});
                  }
                  // Also search for any root folders or spreadsheets created by the app
                  const query = `(name = '${APP_ROOT_FOLDER_NAME}' or name = 'مدير مشروعات 5' or name = '${SPREADSHEET_NAME}') and trashed = false`;
                  const res = await fetchDrive(`files?q=${encodeURIComponent(query)}&fields=files(id,name)`).catch(() => ({ files: [] }));
                  if (res && res.files && res.files.length > 0) {
                      for (const f of res.files) {
                          try {
                              await fetchDrive(`files/${f.id}`, { method: 'DELETE' });
                          } catch(e) {}
                      }
                  }
              } catch (driveErr) {
                  console.warn("Drive delete error during wipe:", driveErr);
              }
          }

          // 2. Clear Google Sheets data if accessible
          if (!authService.isGuest() && accessToken) {
              try {
                  const sheetId = await googleSheetsService.getOrInitId(accessToken);
                  if (sheetId) {
                      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Projects!A2:R:clear`, {
                          method: 'POST',
                          headers: { Authorization: `Bearer ${accessToken}` }
                      }).catch(() => {});
                      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Tasks!A2:G:clear`, {
                          method: 'POST',
                          headers: { Authorization: `Bearer ${accessToken}` }
                      }).catch(() => {});
                  }
              } catch (sheetErr) {
                  console.warn("Sheets clear error during wipe:", sheetErr);
              }
          }

          // 3. Clear local IndexedDB stores
          await dbService.clearStore('files').catch(() => {});
          await dbService.clearStore('projects').catch(() => {});
          await dbService.clearStore('file_blobs').catch(() => {});
          await dbService.clearStore('sync_queue').catch(() => {});

          // 4. Clear LocalStorage and in-memory caches
          localStorage.removeItem(LOCAL_STORAGE_PROJECTS_KEY);
          localStorage.removeItem(LOCAL_STORAGE_RECENT_FILES_KEY);
          localStorage.removeItem(LOCAL_STORAGE_MARKET_PRICES_KEY);
          localStorage.removeItem('google_drive_root_id');
          localStorage.removeItem('google_sheets_db_id');
          localStorage.removeItem('construction_pro_tasks');
          detectedRootFolderId = '';
          contentCache.clear();

          triggerLoadingStop();
          notifyDataChanged('all_data_wiped');
      } catch (err) {
          triggerLoadingStop();
          throw err;
      }
  },

  notifyDataChanged(type: string, detail?: any) {
      notifyDataChanged(type, detail);
  },

  isHiddenSystemItem(name?: string, mimeType?: string): boolean {
      return isHiddenSystemItem(name, mimeType);
  }
};

export function getFolderDisplayName(name?: string): string {
    if (!name) return '';
    if (name === 'الملفات الفرعية' || name === 'فولدر 1') return 'فولدر 1';
    if (name === 'سجل الحافظة' || name === 'فولدر 2') return 'فولدر 2';
    return name;
}

const DEFAULT_SUBFOLDERS = [
    'فولدر 1',
    'فولدر 2',
    'الخطابات'
];

let localTasks: Task[] = JSON.parse(localStorage.getItem('construction_pro_tasks') || '[]');
const STORAGE_KEYS = { TASKS: 'construction_pro_tasks' };
