import { getPgPool, getRedisClient } from '../shared/db/index.js';

// ============================================================
// USER MEMORY SERVICE
// Manages safe user profiles and ephemeral sensitive data.
// Sensitive data (PAN, Aadhaar, passwords) is never stored permanently.
// ============================================================

export interface UserProfile {
  id: string;
  userId: string;
  profileName: string; // e.g., 'default', 'father-details'
  data: Record<string, string>; // Safe data like Name, DOB, Address
  createdAt: Date;
  updatedAt: Date;
}

export class UserMemoryService {
  sanitizeProfileData(data: Record<string, string>): Record<string, string> {
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
  async getProfiles(userId: string): Promise<UserProfile[]> {
    const pool = getPgPool();
    const { rows } = await pool.query(
      `SELECT id, user_id as "userId", profile_name as "profileName", data, created_at as "createdAt", updated_at as "updatedAt"
       FROM user_profiles WHERE user_id = $1`,
      [userId]
    );
    return rows;
  }

  /**
   * Get a specific profile by name
   */
  async getProfileByName(userId: string, profileName: string): Promise<UserProfile | null> {
    const pool = getPgPool();
    const { rows } = await pool.query(
      `SELECT id, user_id as "userId", profile_name as "profileName", data, created_at as "createdAt", updated_at as "updatedAt"
       FROM user_profiles WHERE user_id = $1 AND profile_name = $2`,
      [userId, profileName]
    );
    return rows[0] || null;
  }

  /**
   * Save or update a safe profile
   */
  async saveProfile(userId: string, profileName: string, data: Record<string, string>): Promise<void> {
    const pool = getPgPool();
    const safeData = this.sanitizeProfileData(data);

    await pool.query(`
      INSERT INTO user_profiles (user_id, profile_name, data, created_at, updated_at)
      VALUES ($1, $2, $3, NOW(), NOW())
      ON CONFLICT (user_id, profile_name) 
      DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
    `, [userId, profileName, JSON.stringify(safeData)]);
  }

  async deleteProfile(userId: string, profileName: string): Promise<boolean> {
    const pool = getPgPool();
    const result = await pool.query(
      `DELETE FROM user_profiles WHERE user_id = $1 AND profile_name = $2`,
      [userId, profileName]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async renameProfile(userId: string, profileName: string, newProfileName: string): Promise<boolean> {
    const pool = getPgPool();
    const result = await pool.query(
      `UPDATE user_profiles
       SET profile_name = $3, updated_at = NOW()
       WHERE user_id = $1 AND profile_name = $2`,
      [userId, profileName, newProfileName]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async summarizeProfiles(userId: string): Promise<string> {
    const profiles = await this.getProfiles(userId);
    if (!profiles.length) return 'No saved user profiles.';

    return profiles.map((profile) => JSON.stringify({
      profileName: profile.profileName,
      fields: Object.keys(profile.data).sort(),
      sample: Object.fromEntries(Object.entries(profile.data).slice(0, 6)),
    })).join('\n');
  }

  /**
   * Store sensitive session data ephemerally in Redis (e.g., OTPs, Passwords for the current task)
   */
  async storeEphemeralData(userId: string, key: string, value: string, ttlSeconds = 600): Promise<void> {
    const redis = await getRedisClient();
    await redis.setEx(`ephemeral:${userId}:${key}`, ttlSeconds, value);
  }

  /**
   * Retrieve ephemeral data
   */
  async getEphemeralData(userId: string, key: string): Promise<string | null> {
    const redis = await getRedisClient();
    return await redis.get(`ephemeral:${userId}:${key}`);
  }
}

export const memoryService = new UserMemoryService();
