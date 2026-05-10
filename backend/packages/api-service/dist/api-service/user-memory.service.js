import { getPgPool, getRedisClient } from '../shared/db/index.js';
export class UserMemoryService {
    sanitizeProfileData(data) {
        const safeData = { ...data };
        const sensitiveKeys = ['password', 'aadhaar', 'pan', 'ssn', 'cvv', 'otp'];
        for (const key of Object.keys(safeData)) {
            if (sensitiveKeys.some((sk) => key.toLowerCase().includes(sk))) {
                delete safeData[key];
            }
        }
        return safeData;
    }
    /**
     * Fetch all saved profiles for a user
     */
    async getProfiles(userId) {
        const pool = getPgPool();
        const { rows } = await pool.query(`SELECT id, user_id as "userId", profile_name as "profileName", data, created_at as "createdAt", updated_at as "updatedAt"
       FROM user_profiles WHERE user_id = $1`, [userId]);
        return rows;
    }
    /**
     * Get a specific profile by name
     */
    async getProfileByName(userId, profileName) {
        const pool = getPgPool();
        const { rows } = await pool.query(`SELECT id, user_id as "userId", profile_name as "profileName", data, created_at as "createdAt", updated_at as "updatedAt"
       FROM user_profiles WHERE user_id = $1 AND profile_name = $2`, [userId, profileName]);
        return rows[0] || null;
    }
    /**
     * Save or update a safe profile
     */
    async saveProfile(userId, profileName, data) {
        const pool = getPgPool();
        const safeData = this.sanitizeProfileData(data);
        await pool.query(`
      INSERT INTO user_profiles (user_id, profile_name, data, created_at, updated_at)
      VALUES ($1, $2, $3, NOW(), NOW())
      ON CONFLICT (user_id, profile_name) 
      DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
    `, [userId, profileName, JSON.stringify(safeData)]);
    }
    async deleteProfile(userId, profileName) {
        const pool = getPgPool();
        const result = await pool.query(`DELETE FROM user_profiles WHERE user_id = $1 AND profile_name = $2`, [userId, profileName]);
        return (result.rowCount ?? 0) > 0;
    }
    async renameProfile(userId, profileName, newProfileName) {
        const pool = getPgPool();
        const result = await pool.query(`UPDATE user_profiles
       SET profile_name = $3, updated_at = NOW()
       WHERE user_id = $1 AND profile_name = $2`, [userId, profileName, newProfileName]);
        return (result.rowCount ?? 0) > 0;
    }
    async summarizeProfiles(userId) {
        const profiles = await this.getProfiles(userId);
        if (!profiles.length)
            return 'No saved user profiles.';
        return profiles.map((profile) => JSON.stringify({
            profileName: profile.profileName,
            fields: Object.keys(profile.data).sort(),
            sample: Object.fromEntries(Object.entries(profile.data).slice(0, 6)),
        })).join('\n');
    }
    /**
     * Store sensitive session data ephemerally in Redis (e.g., OTPs, Passwords for the current task)
     */
    async storeEphemeralData(userId, key, value, ttlSeconds = 600) {
        const redis = await getRedisClient();
        await redis.setEx(`ephemeral:${userId}:${key}`, ttlSeconds, value);
    }
    /**
     * Retrieve ephemeral data
     */
    async getEphemeralData(userId, key) {
        const redis = await getRedisClient();
        return await redis.get(`ephemeral:${userId}:${key}`);
    }
}
export const memoryService = new UserMemoryService();
//# sourceMappingURL=user-memory.service.js.map