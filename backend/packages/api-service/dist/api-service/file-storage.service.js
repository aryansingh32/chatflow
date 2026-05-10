import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { getPgPool } from '../shared/db/index.js';
const STORAGE_ROOT = process.env.USER_FILE_STORAGE_ROOT
    ?? path.resolve(process.cwd(), 'mnt/user-data/outputs/automation-platform/uploads');
function sanitizeFileName(name) {
    return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}
export class FileStorageService {
    buildAutomationReferences(file) {
        return {
            fileRef: `file:${file.id}`,
            latestCategoryRef: `file-category:${file.category}`,
            templateRef: `{{userFile:${file.category}}}`,
        };
    }
    async uploadBase64(input) {
        const fileId = randomUUID();
        const category = input.category ?? 'other';
        const safeOriginal = sanitizeFileName(input.originalName || 'file.bin');
        const extension = path.extname(safeOriginal);
        const storedName = `${fileId}${extension}`;
        const userDir = path.join(STORAGE_ROOT, sanitizeFileName(input.userId), category);
        const fullPath = path.join(userDir, storedName);
        const buffer = Buffer.from(input.base64Data, 'base64');
        await mkdir(userDir, { recursive: true });
        await writeFile(fullPath, buffer);
        const pool = getPgPool();
        const { rows } = await pool.query(`INSERT INTO user_files (
         id, user_id, profile_name, category, original_name, stored_name,
         mime_type, file_size_bytes, storage_path, metadata, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
       RETURNING
         id,
         user_id as "userId",
         profile_name as "profileName",
         category,
         original_name as "originalName",
         stored_name as "storedName",
         mime_type as "mimeType",
         file_size_bytes as "fileSizeBytes",
         storage_path as "storagePath",
         metadata,
         created_at as "createdAt",
         updated_at as "updatedAt"`, [
            fileId,
            input.userId,
            input.profileName ?? null,
            category,
            input.originalName,
            storedName,
            input.mimeType || 'application/octet-stream',
            buffer.byteLength,
            fullPath,
            JSON.stringify(input.metadata ?? {}),
        ]);
        return rows[0];
    }
    async listFiles(userId, category) {
        const pool = getPgPool();
        const { rows } = await pool.query(`SELECT
         id,
         user_id as "userId",
         profile_name as "profileName",
         category,
         original_name as "originalName",
         stored_name as "storedName",
         mime_type as "mimeType",
         file_size_bytes as "fileSizeBytes",
         storage_path as "storagePath",
         metadata,
         created_at as "createdAt",
         updated_at as "updatedAt"
       FROM user_files
       WHERE user_id = $1
         AND ($2::text IS NULL OR category = $2)
       ORDER BY created_at DESC`, [userId, category ?? null]);
        return rows;
    }
    async summarizeFiles(userId) {
        const files = await this.listFiles(userId);
        if (!files.length)
            return 'No uploaded user files.';
        return files.slice(0, 20).map((file) => JSON.stringify({
            id: file.id,
            category: file.category,
            originalName: file.originalName,
            profileName: file.profileName ?? null,
            reference: this.buildAutomationReferences(file),
        })).join('\n');
    }
    async getFile(fileId, userId) {
        const pool = getPgPool();
        const { rows } = await pool.query(`SELECT
         id,
         user_id as "userId",
         profile_name as "profileName",
         category,
         original_name as "originalName",
         stored_name as "storedName",
         mime_type as "mimeType",
         file_size_bytes as "fileSizeBytes",
         storage_path as "storagePath",
         metadata,
         created_at as "createdAt",
         updated_at as "updatedAt"
       FROM user_files
       WHERE id = $1
         AND ($2::text IS NULL OR user_id = $2)
       LIMIT 1`, [fileId, userId ?? null]);
        return rows[0] ?? null;
    }
    async getFileContent(fileId, userId) {
        const file = await this.getFile(fileId, userId);
        if (!file)
            return null;
        const buffer = await readFile(file.storagePath);
        return { file, buffer };
    }
    async deleteFile(fileId, userId) {
        const file = await this.getFile(fileId, userId);
        if (!file)
            return false;
        await unlink(file.storagePath).catch(() => { });
        const pool = getPgPool();
        await pool.query(`DELETE FROM user_files WHERE id = $1`, [fileId]);
        return true;
    }
}
export const fileStorageService = new FileStorageService();
//# sourceMappingURL=file-storage.service.js.map