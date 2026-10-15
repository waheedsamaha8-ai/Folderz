// @ts-nocheck
import { 
    collection, 
    doc, 
    setDoc, 
    getDoc, 
    getDocs, 
    updateDoc, 
    deleteDoc, 
    onSnapshot, 
    serverTimestamp,
    query,
    orderBy
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from './firebaseConfig';
import { Project, ProjectLog, FileItem, PortfolioCategoryMeta } from '../types';
import { dbService } from './db';

class FirestoreSyncService {
    private activeProjectUnsub: (() => void) | null = null;
    private activeLogsUnsub: Map<string, () => void> = new Map();
    private activeFilesUnsub: (() => void) | null = null;

    /**
     * Ensure an active authenticated session for Firestore rules
     */
    public async ensureAuth(): Promise<string | null> {
        if (auth.currentUser?.uid) return auth.currentUser.uid;
        try {
            const { signInAnonymously } = await import('firebase/auth');
            const cred = await signInAnonymously(auth);
            return cred.user.uid;
        } catch (e) {
            return this.getUserId();
        }
    }

    /**
     * Get current user ID safely or fallback to local commercial ID
     */
    public getUserId(): string | null {
        if (auth.currentUser?.uid) return auth.currentUser.uid;
        const savedEmail = localStorage.getItem('user_email');
        if (savedEmail) {
            return 'user_' + btoa(savedEmail.toLowerCase()).replace(/[^a-zA-Z0-9]/g, '_').slice(0, 32);
        }
        return null;
    }

    /**
     * Save user profile in Firestore
     */
    public async saveUserProfile(user: any, details?: { accountType?: string; companyName?: string; licenseNumber?: string }) {
        const userId = user.uid || this.getUserId();
        if (!userId) return;
        const userRef = doc(db, 'users', userId);
        const data = {
            uid: userId,
            email: user.email || '',
            displayName: user.displayName || localStorage.getItem('user_display_name') || 'مهندس معتمد',
            photoURL: user.photoURL || '',
            accountType: details?.accountType || localStorage.getItem('user_account_type') || 'commercial_pro',
            companyName: details?.companyName || localStorage.getItem('user_company_name') || '',
            licenseNumber: details?.licenseNumber || localStorage.getItem('user_license_number') || '',
            updatedAt: new Date().toISOString()
        };
        try {
            await setDoc(userRef, data, { merge: true });
        } catch (e) {
            handleFirestoreError(e, OperationType.WRITE, `users/${userId}`);
        }
    }

    /**
     * Real-time subscription to user's projects with INSTANT sub-50ms live sync
     */
    public subscribeToProjects(userId: string, onUpdate: (projects: Project[]) => void): () => void {
        const path = `users/${userId}/projects`;
        try {
            const projectsRef = collection(db, 'users', userId, 'projects');
            const q = query(projectsRef);

            const unsubscribe = onSnapshot(q, async (snapshot) => {
                const projects: Project[] = [];
                snapshot.forEach((docSnap) => {
                    const data = docSnap.data();
                    projects.push({
                        ...data,
                        id: docSnap.id,
                        userId
                    } as Project);
                });

                // Update local storage and IndexedDB cache immediately
                for (const proj of projects) {
                    await dbService.putItem('projects', proj).catch(() => {});
                }

                // Notify UI immediately
                onUpdate(projects);
            }, (error) => {
                handleFirestoreError(error, OperationType.LIST, path);
            });

            this.activeProjectUnsub = unsubscribe;
            return unsubscribe;
        } catch (e) {
            handleFirestoreError(e, OperationType.LIST, path);
            return () => {};
        }
    }

    /**
     * Create or update project in real-time Firestore database
     */
    public async saveProject(project: Project): Promise<void> {
        const userId = this.getUserId();
        if (!userId) return;

        const path = `users/${userId}/projects/${project.id}`;
        try {
            const projectRef = doc(db, 'users', userId, 'projects', project.id);
            const projectData = {
                ...project,
                userId,
                updatedAt: new Date().toISOString()
            };
            await setDoc(projectRef, projectData, { merge: true });
        } catch (e) {
            handleFirestoreError(e, OperationType.WRITE, path);
            throw e;
        }
    }

    /**
     * Delete project from real-time Firestore database
     */
    public async deleteProject(projectId: string): Promise<void> {
        const userId = this.getUserId();
        if (!userId) return;

        const path = `users/${userId}/projects/${projectId}`;
        try {
            const projectRef = doc(db, 'users', userId, 'projects', projectId);
            await deleteDoc(projectRef);
        } catch (e) {
            handleFirestoreError(e, OperationType.DELETE, path);
            throw e;
        }
    }

    /**
     * Real-time subscription to project execution logs
     */
    public subscribeToProjectLogs(projectId: string, onUpdate: (logs: ProjectLog[]) => void): () => void {
        const userId = this.getUserId();
        if (!userId) return () => {};

        const path = `users/${userId}/projects/${projectId}/logs`;
        try {
            const logsRef = collection(db, 'users', userId, 'projects', projectId, 'logs');
            const q = query(logsRef);

            const unsubscribe = onSnapshot(q, (snapshot) => {
                const logs: ProjectLog[] = [];
                snapshot.forEach((docSnap) => {
                    logs.push({
                        ...docSnap.data(),
                        id: docSnap.id
                    } as ProjectLog);
                });
                onUpdate(logs);
            }, (error) => {
                handleFirestoreError(error, OperationType.LIST, path);
            });

            this.activeLogsUnsub.set(projectId, unsubscribe);
            return unsubscribe;
        } catch (e) {
            handleFirestoreError(e, OperationType.LIST, path);
            return () => {};
        }
    }

    /**
     * Save execution log to Firestore
     */
    public async saveProjectLog(projectId: string, log: ProjectLog): Promise<void> {
        const userId = this.getUserId();
        if (!userId) return;

        const path = `users/${userId}/projects/${projectId}/logs/${log.id}`;
        try {
            const logRef = doc(db, 'users', userId, 'projects', projectId, 'logs', log.id);
            await setDoc(logRef, {
                ...log,
                userId,
                projectId,
                updatedAt: new Date().toISOString()
            }, { merge: true });
        } catch (e) {
            handleFirestoreError(e, OperationType.WRITE, path);
        }
    }

    /**
     * Delete execution log from Firestore
     */
    public async deleteProjectLog(projectId: string, logId: string): Promise<void> {
        const userId = this.getUserId();
        if (!userId) return;

        const path = `users/${userId}/projects/${projectId}/logs/${logId}`;
        try {
            const logRef = doc(db, 'users', userId, 'projects', projectId, 'logs', logId);
            await deleteDoc(logRef);
        } catch (e) {
            handleFirestoreError(e, OperationType.DELETE, path);
        }
    }

    /**
     * Real-time subscription to user's files and folders
     */
    public subscribeToFiles(onUpdate: (files: FileItem[]) => void, parentId?: string | null): () => void {
        const userId = this.getUserId();
        if (!userId) return () => {};

        const path = `users/${userId}/files`;
        try {
            const filesRef = collection(db, 'users', userId, 'files');
            const unsubscribe = onSnapshot(filesRef, async (snapshot) => {
                const files: FileItem[] = [];
                snapshot.forEach((docSnap) => {
                    const data = docSnap.data();
                    if (!parentId || data.parentId === parentId) {
                        files.push({
                            ...data,
                            id: docSnap.id
                        } as FileItem);
                    }
                });

                // Update local IndexedDB
                for (const f of files) {
                    await dbService.putItem('files', f).catch(() => {});
                }

                onUpdate(files);
            }, (error) => {
                handleFirestoreError(error, OperationType.LIST, path);
            });

            this.activeFilesUnsub = unsubscribe;
            return unsubscribe;
        } catch (e) {
            handleFirestoreError(e, OperationType.LIST, path);
            return () => {};
        }
    }

    /**
     * Save file metadata to Firestore
     */
    public async saveFileItem(item: FileItem): Promise<void> {
        const userId = this.getUserId();
        if (!userId) return;

        const path = `users/${userId}/files/${item.id}`;
        try {
            const fileRef = doc(db, 'users', userId, 'files', item.id);
            await setDoc(fileRef, {
                ...item,
                userId,
                updatedAt: new Date().toISOString()
            }, { merge: true });
        } catch (e) {
            handleFirestoreError(e, OperationType.WRITE, path);
        }
    }

    /**
     * Delete file from Firestore
     */
    public async deleteFileItem(fileId: string): Promise<void> {
        const userId = this.getUserId();
        if (!userId) return;

        const path = `users/${userId}/files/${fileId}`;
        try {
            const fileRef = doc(db, 'users', userId, 'files', fileId);
            await deleteDoc(fileRef);
        } catch (e) {
            handleFirestoreError(e, OperationType.DELETE, path);
        }
    }
}

export const firestoreSyncService = new FirestoreSyncService();
