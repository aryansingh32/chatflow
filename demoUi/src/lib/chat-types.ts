export type Role = "user" | "bot" | "system";

export type InputCardKind = "otp" | "captcha" | "upi" | "confirm";

export interface BaseMessage {
  id: string;
  role: Role;
  createdAt: number;
}

export interface TextMessage extends BaseMessage {
  type: "text";
  content: string;
}

export interface FileAttachment {
  id: string;
  name: string;
  size: number;
  mime: string;
  url?: string; // local object URL (preview only)
}

export interface FileMessage extends BaseMessage {
  type: "file-upload";
  files: FileAttachment[];
  note?: string;
}

export interface DownloadMessage extends BaseMessage {
  type: "download";
  title: string;
  description?: string;
  fileName: string;
  mime: string;
  sizeLabel?: string;
}

export interface InputCardMessage extends BaseMessage {
  type: "input-card";
  kind: InputCardKind;
  prompt: string;
  data?: {
    captchaUrl?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    amount?: string;
  };
  resolved?: { value: string; at: number };
}

export interface TimelineStep {
  id: string;
  label: string;
  status: "pending" | "active" | "done" | "error";
  at: number;
}

export interface TimelineMessage extends BaseMessage {
  type: "timeline";
  title: string;
  steps: TimelineStep[];
  done: boolean;
}

export type ChatMessage =
  | TextMessage
  | FileMessage
  | DownloadMessage
  | InputCardMessage
  | TimelineMessage;

export interface Thread {
  id: string;
  title: string;
  updatedAt: number;
  messages: ChatMessage[];
}

export interface Profile {
  id: string;
  name: string;
  description: string;
}

export const PROFILES: Profile[] = [
  { id: "personal", name: "Personal", description: "Your default profile" },
  { id: "work", name: "Work", description: "Professional context" },
  { id: "family", name: "Family", description: "Shared family tasks" },
];
