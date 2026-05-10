import type { UserFile } from '../shared/types/index.js';
type FileCategory = UserFile['category'];
export declare class FileStorageService {
    buildAutomationReferences(file: UserFile): {
        fileRef: string;
        latestCategoryRef: string;
        templateRef: string;
    };
    uploadBase64(input: {
        userId: string;
        originalName: string;
        mimeType: string;
        base64Data: string;
        category?: FileCategory;
        profileName?: string;
        metadata?: Record<string, unknown>;
    }): Promise<UserFile>;
    listFiles(userId: string, category?: FileCategory): Promise<UserFile[]>;
    summarizeFiles(userId: string): Promise<string>;
    getFile(fileId: string, userId?: string): Promise<UserFile | null>;
    getFileContent(fileId: string, userId?: string): Promise<{
        file: UserFile;
        buffer: Buffer;
    } | null>;
    deleteFile(fileId: string, userId?: string): Promise<boolean>;
}
export declare const fileStorageService: FileStorageService;
export {};
//# sourceMappingURL=file-storage.service.d.ts.map