// ============================================================
// APPLICATION CONFIG
// Central configuration for connecting to the backend API
// ============================================================

const env = typeof import.meta !== 'undefined' ? (import.meta as any).env : {};

export const config = {
  /** Backend API base URL (no trailing slash) */
  apiBaseUrl: (env?.VITE_API_BASE_URL !== undefined && env?.VITE_API_BASE_URL !== null) ? env.VITE_API_BASE_URL : 'http://localhost:3000',

  /** API key for x-api-key header */
  apiKey: env?.VITE_API_KEY || 'dev-key-change-in-prod',

  /** User ID (will be replaced by proper auth later) */
  userId: env?.VITE_USER_ID || 'default-user',

  /** Socket.IO path (defaults to /socket.io) */
  socketPath: env?.VITE_SOCKET_PATH || '/socket.io',
} as const;
