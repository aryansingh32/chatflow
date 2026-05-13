import { useEffect, useState, useCallback } from "react";
import type { ChatMessage, Thread } from "./chat-types";

const KEY = "agent-chat-threads-v1";
const ACTIVE_KEY = "agent-chat-active-v1";

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function loadThreads(): Thread[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Thread[];
  } catch {
    return [];
  }
}

function saveThreads(threads: Thread[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(threads));
}

function loadActive(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACTIVE_KEY);
}

function saveActive(id: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACTIVE_KEY, id);
}

function makeThread(title = "New chat"): Thread {
  return { id: uid(), title, updatedAt: Date.now(), messages: [] };
}

export function useChatStore() {
  const [threads, setThreadsState] = useState<Thread[]>([]);
  const [activeId, setActiveIdState] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Idempotent bootstrap (StrictMode safe)
  useEffect(() => {
    if (typeof window === "undefined") return;
    let initial = loadThreads();
    let active = loadActive();
    if (initial.length === 0) {
      const t = makeThread();
      initial = [t];
      active = t.id;
      saveThreads(initial);
      saveActive(active);
    } else if (!active || !initial.find((t) => t.id === active)) {
      active = initial[0].id;
      saveActive(active);
    }
    setThreadsState(initial);
    setActiveIdState(active);
    setHydrated(true);
  }, []);

  const setThreads = useCallback((updater: (prev: Thread[]) => Thread[]) => {
    setThreadsState((prev) => {
      const next = updater(prev);
      saveThreads(next);
      return next;
    });
  }, []);

  const setActiveId = useCallback((id: string) => {
    setActiveIdState(id);
    saveActive(id);
  }, []);

  const newThread = useCallback(() => {
    const t = makeThread();
    setThreads((prev) => [t, ...prev]);
    setActiveId(t.id);
    return t.id;
  }, [setThreads, setActiveId]);

  const deleteThread = useCallback(
    (id: string) => {
      setThreads((prev) => {
        const next = prev.filter((t) => t.id !== id);
        if (next.length === 0) {
          const t = makeThread();
          saveActive(t.id);
          setActiveIdState(t.id);
          return [t];
        }
        if (id === activeId) {
          saveActive(next[0].id);
          setActiveIdState(next[0].id);
        }
        return next;
      });
    },
    [activeId, setThreads],
  );

  const renameThread = useCallback(
    (id: string, title: string) => {
      setThreads((prev) => prev.map((t) => (t.id === id ? { ...t, title } : t)));
    },
    [setThreads],
  );

  const appendMessage = useCallback(
    (threadId: string, msg: ChatMessage, autoTitle = false) => {
      setThreads((prev) =>
        prev.map((t) => {
          if (t.id !== threadId) return t;
          const messages = [...t.messages, msg];
          let title = t.title;
          if (autoTitle && t.title === "New chat" && msg.role === "user" && msg.type === "text") {
            title = msg.content.slice(0, 48) || "New chat";
          }
          return { ...t, messages, updatedAt: Date.now(), title };
        }),
      );
    },
    [setThreads],
  );

  const updateMessage = useCallback(
    (threadId: string, msgId: string, patch: Partial<ChatMessage>) => {
      setThreads((prev) =>
        prev.map((t) => {
          if (t.id !== threadId) return t;
          return {
            ...t,
            messages: t.messages.map((m) =>
              m.id === msgId ? ({ ...m, ...patch } as ChatMessage) : m,
            ),
            updatedAt: Date.now(),
          };
        }),
      );
    },
    [setThreads],
  );

  const activeThread = threads.find((t) => t.id === activeId) ?? null;

  return {
    hydrated,
    threads,
    activeId,
    activeThread,
    setActiveId,
    newThread,
    deleteThread,
    renameThread,
    appendMessage,
    updateMessage,
  };
}

export { uid };
