// ============================================================
// REST API CLIENT
// Typed wrapper for all backend REST endpoints.
// Every call includes x-api-key authentication.
// ============================================================

import { config } from "./config";
import { createLogger } from "./logger";

const logger = createLogger("frontend-api");

// ─── Types (mirrors backend shared/types) ──────────────────

export interface JobResponse {
  jobId: string;
  sessionId?: string;
  status: string;
  message?: string;
}

export interface UserProfile {
  id: string;
  userId: string;
  profileName: string;
  data: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface UserFile {
  id: string;
  userId: string;
  profileName?: string;
  category: "resume" | "signature" | "photo" | "document" | "receipt" | "other";
  originalName: string;
  storedName: string;
  mimeType: string;
  fileSizeBytes: number;
  storagePath: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  references?: {
    fileRef: string;
    latestCategoryRef: string;
    templateRef: string;
  };
}

export interface SiteWorkflow {
  id: string;
  workflowKey?: string;
  siteId: string;
  category?: string;
  name: string;
  trigger: string;
  triggerPhrases?: string[];
  portalType?: string;
  requiredInputs?: string[];
  requiredFiles?: string[];
  instructions: string;
  isActive?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface HealthResponse {
  status: "healthy" | "degraded";
  db: string;
  redis: string;
  browsers: Record<string, unknown>;
  uptime: number;
  timestamp: string;
}

export interface JobRuntimeState {
  jobId: string;
  userId: string;
  sessionId: string;
  siteId: string;
  task: string;
  status: "queued" | "running" | "paused" | "completed" | "failed";
  activeStepId?: string;
  lastInputType?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── HTTP helpers ───────────────────────────────────────────

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${config.apiBaseUrl}${path}`;
  const headers: Record<string, string> = {
    "x-api-key": config.apiKey,
    ...((options.headers as Record<string, string>) || {}),
  };

  // Add content-type for JSON bodies
  if (options.body && typeof options.body === "string") {
    headers["Content-Type"] = "application/json";
  }

  logger.debug("request:start", {
    url,
    method: options.method ?? "GET",
    origin: typeof window !== "undefined" ? window.location.origin : "server",
  });

  let res: Response;
  try {
    res = await fetch(url, { ...options, headers });
  } catch (error) {
    logger.error("request:network-error", error, {
      url,
      method: options.method ?? "GET",
      origin: typeof window !== "undefined" ? window.location.origin : "server",
      corsHint: "Check backend CORS_ORIGIN and x-api-key allowed headers",
    });
    throw error;
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    let msg = `API ${res.status}: ${res.statusText}`;
    try {
      const parsed = JSON.parse(body);
      if (parsed.error) msg = parsed.error;
    } catch {}
    logger.warn("request:failed", {
      url,
      method: options.method ?? "GET",
      status: res.status,
      statusText: res.statusText,
      responseBody: body.slice(0, 500),
    });
    throw new ApiError(msg, res.status);
  }

  logger.debug("request:success", {
    url,
    method: options.method ?? "GET",
    status: res.status,
  });
  return res.json() as Promise<T>;
}

function get<T>(path: string): Promise<T> {
  return request<T>(path, { method: "GET" });
}

function post<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: "POST",
    body: body ? JSON.stringify(body) : undefined,
  });
}

function put<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: "PUT",
    body: body ? JSON.stringify(body) : undefined,
  });
}

function del<T>(path: string): Promise<T> {
  return request<T>(path, { method: "DELETE" });
}

// ─── API Methods ────────────────────────────────────────────

export const api = {
  // Health
  health: () => get<HealthResponse>("/health"),

  // Execute
  execute: (payload: {
    siteId: string;
    task: string;
    sessionId?: string;
    userId?: string;
    priority?: "critical" | "high" | "normal" | "low";
  }) => post<JobResponse>("/execute", { ...payload, userId: payload.userId || config.userId }),

  // Jobs
  getJob: (jobId: string) => get<{ job: Record<string, unknown> }>(`/jobs/${jobId}`),
  getJobRuntime: (jobId: string) => get<{ runtime: JobRuntimeState }>(`/jobs/${jobId}/runtime`),
  resumeJob: (jobId: string, input: string) =>
    post<{ jobId: string; resumed: boolean }>(`/jobs/${jobId}/resume`, { input }),
  cancelJob: (jobId: string) =>
    post<{ jobId: string; cancelled: boolean }>(`/jobs/${jobId}/cancel`, {}),

  // Profiles
  getProfiles: (userId?: string) =>
    get<{ profiles: UserProfile[] }>(`/memory/profiles?userId=${userId || config.userId}`),

  getProfile: (profileName: string, userId?: string) =>
    get<{ profile: UserProfile }>(
      `/memory/profiles/${encodeURIComponent(profileName)}?userId=${userId || config.userId}`,
    ),

  saveProfile: (profileName: string, data: Record<string, string>, userId?: string) =>
    post<{ saved: boolean; profileName: string }>("/memory/profiles", {
      userId: userId || config.userId,
      profileName,
      data,
    }),

  updateProfile: (
    profileName: string,
    data: Record<string, string>,
    newName?: string,
    userId?: string,
  ) =>
    put<{ profile: UserProfile }>(`/memory/profiles/${encodeURIComponent(profileName)}`, {
      userId: userId || config.userId,
      data,
      newProfileName: newName,
    }),

  deleteProfile: (profileName: string, userId?: string) =>
    del<{ deleted: boolean }>(
      `/memory/profiles/${encodeURIComponent(profileName)}?userId=${userId || config.userId}`,
    ),

  // Files
  uploadFile: (payload: {
    originalName: string;
    mimeType: string;
    base64Data: string;
    category?: UserFile["category"];
    profileName?: string;
    userId?: string;
  }) =>
    post<{ file: UserFile; references: UserFile["references"] }>("/files/upload", {
      ...payload,
      userId: payload.userId || config.userId,
    }),

  listFiles: (category?: string, userId?: string) =>
    get<{ files: UserFile[] }>(
      `/files?userId=${userId || config.userId}${category ? `&category=${category}` : ""}`,
    ),

  getFile: (fileId: string, userId?: string) =>
    get<{ file: UserFile }>(`/files/${fileId}?userId=${userId || config.userId}`),

  getFileDownloadUrl: (fileId: string, userId?: string) =>
    `${config.apiBaseUrl}/files/${fileId}/download?userId=${userId || config.userId}`,

  deleteFile: (fileId: string, userId?: string) =>
    del<{ deleted: boolean }>(`/files/${fileId}?userId=${userId || config.userId}`),

  // Workflows
  listWorkflows: (siteId?: string) =>
    get<{ workflows: SiteWorkflow[] }>(`/workflows${siteId ? `?siteId=${siteId}` : ""}`),

  getWorkflow: (workflowId: string) => get<{ workflow: SiteWorkflow }>(`/workflows/${workflowId}`),

  // Queues
  getQueues: () => get<{ queues: Record<string, unknown> }>("/queues"),
} as const;
