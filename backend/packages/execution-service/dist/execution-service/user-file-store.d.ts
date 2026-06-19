import type { UserFile } from '../shared/types/index.js';
type FileCategory = UserFile['category'];
export declare class UserFileStore {
    constructor();
    private ensureDirectories;
    resolveInputReference(userId: string, rawValue: string): Promise<string>;
    persistDownloadedFile(input: {
        userId: string;
        category: FileCategory;
        originalName: string;
        buffer: Buffer;
        mimeType?: string;
        profileName?: string;
        metadata?: Record<string, unknown>;
    }): Promise<UserFile>;
    getFileById(fileId: string, userId: string): Promise<UserFile | null>;
    getLatestByCategory(userId: string, category: FileCategory): Promise<UserFile | null>;
    /**
     * Cleanup temporary files older than a certain age
     */
    cleanupTempFiles(maxAgeMs?: number): Promise<void>;
    getTempPath(type: 'screenshots' | 'downloads', filename: string): string;
}
export declare const userFileStore: UserFileStore;
export {};
//# sourceMappingURL=user-file-store.d.ts.map