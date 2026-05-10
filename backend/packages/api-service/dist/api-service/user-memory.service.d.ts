export interface UserProfile {
    id: string;
    userId: string;
    profileName: string;
    data: Record<string, string>;
    createdAt: Date;
    updatedAt: Date;
}
export declare class UserMemoryService {
    sanitizeProfileData(data: Record<string, string>): Record<string, string>;
    /**
     * Fetch all saved profiles for a user
     */
    getProfiles(userId: string): Promise<UserProfile[]>;
    /**
     * Get a specific profile by name
     */
    getProfileByName(userId: string, profileName: string): Promise<UserProfile | null>;
    /**
     * Save or update a safe profile
     */
    saveProfile(userId: string, profileName: string, data: Record<string, string>): Promise<void>;
    deleteProfile(userId: string, profileName: string): Promise<boolean>;
    renameProfile(userId: string, profileName: string, newProfileName: string): Promise<boolean>;
    summarizeProfiles(userId: string): Promise<string>;
    /**
     * Store sensitive session data ephemerally in Redis (e.g., OTPs, Passwords for the current task)
     */
    storeEphemeralData(userId: string, key: string, value: string, ttlSeconds?: number): Promise<void>;
    /**
     * Retrieve ephemeral data
     */
    getEphemeralData(userId: string, key: string): Promise<string | null>;
}
export declare const memoryService: UserMemoryService;
//# sourceMappingURL=user-memory.service.d.ts.map