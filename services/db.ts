
import { openDB, DBSchema, IDBPDatabase } from 'idb';

interface ConstructionDB extends DBSchema {
  files: {
    key: string;
    value: any;
  };
  projects: {
    key: string;
    value: any;
  };
  file_blobs: {
    key: string;
    value: Blob; 
  };
  sync_queue: {
    key: string;
    value: any;
  };
}

const DB_NAME = 'TatbiqAlHafezaDB';
const DB_VERSION = 1;
const LEGACY_DB_NAME = 'ConstructionProDB';

class DatabaseService {
  private dbPromise: Promise<IDBPDatabase<ConstructionDB>>;
  private legacyDbPromise: Promise<IDBPDatabase<ConstructionDB> | null>;
  private isMigrated = false;

  constructor() {
    this.dbPromise = openDB<ConstructionDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, newVersion, transaction) {
        if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('sync_queue')) db.createObjectStore('sync_queue', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('file_blobs')) db.createObjectStore('file_blobs');
      },
    });

    this.legacyDbPromise = (async () => {
      try {
        return await openDB<ConstructionDB>(LEGACY_DB_NAME, 13);
      } catch (e) {
        return null;
      }
    })();

    this.autoMigrateLegacyData();
  }

  private async autoMigrateLegacyData() {
    if (this.isMigrated) return;
    try {
      const db = await this.dbPromise;
      const legacyDb = await this.legacyDbPromise;
      
      const currentProjects = await db.getAll('projects');
      if (currentProjects.length === 0 && legacyDb) {
        try {
          const oldProjects = await legacyDb.getAll('projects');
          if (oldProjects && oldProjects.length > 0) {
            for (const p of oldProjects) {
              await db.put('projects', p);
            }
          }
        } catch (e) {}

        try {
          const oldFiles = await legacyDb.getAll('files');
          if (oldFiles && oldFiles.length > 0) {
            for (const f of oldFiles) {
              await db.put('files', f);
            }
          }
        } catch (e) {}
      }

      // Also migrate from localStorage if db is still empty
      const postCheckProjects = await db.getAll('projects');
      if (postCheckProjects.length === 0) {
        try {
          const lsProjectsRaw = localStorage.getItem('construction_pro_projects_sync');
          if (lsProjectsRaw) {
            const lsProjects = JSON.parse(lsProjectsRaw);
            if (Array.isArray(lsProjects)) {
              for (const p of lsProjects) {
                await db.put('projects', p);
              }
            }
          }
        } catch (e) {}
      }
      this.isMigrated = true;
    } catch (e) {
      console.warn("Auto-migrate note:", e);
    }
  }

  async putBlob(id: string, blob: Blob) {
    const db = await this.dbPromise;
    try {
        await db.put('file_blobs', blob, id);
    } catch (e) {
        console.error("Storage Error:", e);
    }
  }

  async getBlob(id: string): Promise<Blob | undefined> {
    const db = await this.dbPromise;
    const item = await db.get('file_blobs', id);
    if (!item) return undefined;
    // @ts-ignore
    if (item.iv && item.data) { // Cleanup legacy
        try { await db.delete('file_blobs', id); } catch(e){}
        return undefined;
    }
    if (item instanceof Blob) return item;
    return undefined;
  }

  async hasBlob(id: string): Promise<boolean> {
    const db = await this.dbPromise;
    const key = await db.getKey('file_blobs', id);
    return !!key;
  }

  async putItem(store: 'files' | 'projects', item: any) {
    const db = await this.dbPromise;
    await db.put(store, item);
  }

  async getAllItems<T>(store: 'files' | 'projects'): Promise<T[]> {
    const db = await this.dbPromise;
    const items = await db.getAll(store) as T[];
    if (items.length > 0) return items;
    
    // Fallback to legacy database if new database hasn't finished migrating
    try {
      const legacyDb = await this.legacyDbPromise;
      if (legacyDb) {
        const legacyItems = await legacyDb.getAll(store) as T[];
        if (legacyItems && legacyItems.length > 0) {
          // Asynchronously cache them into the new db
          for (const item of legacyItems) {
            db.put(store, item).catch(() => {});
          }
          return legacyItems;
        }
      }
    } catch (e) {}

    // Fallback to localStorage for projects
    if (store === 'projects') {
      try {
        const lsProjectsRaw = localStorage.getItem('construction_pro_projects_sync');
        if (lsProjectsRaw) {
          const lsProjects = JSON.parse(lsProjectsRaw);
          if (Array.isArray(lsProjects) && lsProjects.length > 0) {
            for (const p of lsProjects) {
              db.put('projects', p).catch(() => {});
            }
            return lsProjects as T[];
          }
        }
      } catch (e) {}
    }

    return [];
  }
  
  async getItem<T>(store: 'files' | 'projects', id: string): Promise<T | undefined> {
    const db = await this.dbPromise;
    const item = await db.get(store, id) as T;
    if (item) return item;

    try {
      const legacyDb = await this.legacyDbPromise;
      if (legacyDb) {
        const legacyItem = await legacyDb.get(store, id) as T;
        if (legacyItem) {
          db.put(store, legacyItem).catch(() => {});
          return legacyItem;
        }
      }
    } catch (e) {}

    if (store === 'projects') {
      try {
        const lsProjectsRaw = localStorage.getItem('construction_pro_projects_sync');
        if (lsProjectsRaw) {
          const lsProjects = JSON.parse(lsProjectsRaw);
          if (Array.isArray(lsProjects)) {
            const found = lsProjects.find((p: any) => p.id === id);
            if (found) return found as T;
          }
        }
      } catch (e) {}
    }

    return undefined;
  }

  async deleteItem(store: 'files' | 'projects' | 'file_blobs', id: string) {
    const db = await this.dbPromise;
    await db.delete(store, id);
  }
  
  async clearStore(store: 'files' | 'projects' | 'file_blobs') {
      const db = await this.dbPromise;
      await db.clear(store);
  }
  
  async count(store: 'sync_queue'): Promise<number> {
      const db = await this.dbPromise;
      return await db.count(store);
  }
  
  async addToQueue(item: any) {
      const db = await this.dbPromise;
      await db.put('sync_queue', item);
  }

  async getQueue(): Promise<any[]> {
      const db = await this.dbPromise;
      return await db.getAll('sync_queue');
  }

  async removeFromQueue(id: string) {
      const db = await this.dbPromise;
      await db.delete('sync_queue', id);
  }
  
  async clearQueue() {
      const db = await this.dbPromise;
      await db.clear('sync_queue');
  }
}

export const dbService = new DatabaseService();
