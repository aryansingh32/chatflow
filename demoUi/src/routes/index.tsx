import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { PanelLeft, Monitor, Sparkles } from "lucide-react";
import { useChatStore, uid } from "@/lib/chat-store";
import { PROFILES } from "@/lib/chat-types";
import type { ChatMessage, FileAttachment } from "@/lib/chat-types";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { LiveScreenPanel } from "@/components/chat/LiveScreenPanel";
import { Composer } from "@/components/chat/Composer";
import { MessageItem, TypingIndicator } from "@/components/chat/MessageItem";
import { runMockTask } from "@/lib/mock-bot";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Agent — your personal automation chat" },
      { name: "description", content: "Chat with your agent. Watch it work in real time, approve OTPs and payments, get files back instantly." },
    ],
  }),
  component: Index,
});

const SUGGESTIONS = [
  "Download my Aadhaar e-card",
  "Pay my electricity bill",
  "Fill the job application form",
  "Book a train ticket to Mumbai",
];

function Index() {
  const store = useChatStore();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [liveOpen, setLiveOpen] = useState(true);
  const [liveFrame, setLiveFrame] = useState<string | null>(null);
  const [liveHot, setLiveHot] = useState(false);
  const [typing, setTyping] = useState(false);
  const [busy, setBusy] = useState(false);
  const [profileId, setProfileId] = useState("personal");
  const profile = useMemo(() => PROFILES.find((p) => p.id === profileId)!, [profileId]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const messages = store.activeThread?.messages ?? [];

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length, typing]);

  if (!store.hydrated) {
    return <div className="h-screen w-screen bg-background" />;
  }

  const send = async (text: string, files: File[]) => {
    if (!store.activeId) return;
    const tid = store.activeId;

    if (files.length) {
      const atts: FileAttachment[] = files.map((f) => ({
        id: uid(),
        name: f.name,
        size: f.size,
        mime: f.type,
        url: URL.createObjectURL(f),
      }));
      store.appendMessage(tid, {
        id: uid(),
        role: "user",
        type: "file-upload",
        createdAt: Date.now(),
        files: atts,
        note: text || undefined,
      });
    } else if (text) {
      store.appendMessage(tid, {
        id: uid(),
        role: "user",
        type: "text",
        createdAt: Date.now(),
        content: text,
      }, true);
    }

    setBusy(true);
    if (!liveOpen) setLiveOpen(true);
    try {
      await runMockTask(text || "Process my upload", {
        pushMessage: (m: ChatMessage) => store.appendMessage(tid, m),
        patchMessage: (id, patch) => store.updateMessage(tid, id, patch),
        setLiveFrame: (url, hot) => { setLiveFrame(url); setLiveHot(!!hot); },
        setTyping: (t) => setTyping(t),
      });
    } finally {
      setBusy(false);
      setTyping(false);
    }
  };

  const showEmpty = messages.length === 0;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      {sidebarOpen && (
        <ChatSidebar
          threads={store.threads}
          activeId={store.activeId}
          onSelect={store.setActiveId}
          onNew={store.newThread}
          onDelete={store.deleteThread}
          onClose={() => setSidebarOpen(false)}
          profile={profile}
          profiles={PROFILES}
          onProfileChange={setProfileId}
        />
      )}

      <main className="flex h-full min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border px-3 py-2.5">
          <div className="flex items-center gap-2">
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Show sidebar"
              >
                <PanelLeft className="h-4 w-4" />
              </button>
            )}
            <div className="text-sm font-medium truncate">
              {store.activeThread?.title || "New chat"}
            </div>
            <span className="ml-2 hidden items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground sm:inline-flex">
              Profile · {profile.name}
            </span>
          </div>
          <button
            onClick={() => setLiveOpen((v) => !v)}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
              liveOpen ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            <Monitor className="h-3.5 w-3.5" />
            Live screen
          </button>
        </header>

        <div ref={scrollRef} key={store.activeId ?? "none"} className="scroll-thin flex-1 overflow-y-auto">
          {showEmpty ? (
            <EmptyState onPick={(s) => send(s, [])} />
          ) : (
            <div className="py-3">
              {messages.map((m) => <MessageItem key={m.id} msg={m} />)}
              {typing && <TypingIndicator />}
            </div>
          )}
        </div>

        <Composer onSend={send} busy={busy} onStop={() => setBusy(false)} />
      </main>

      {liveOpen && (
        <LiveScreenPanel
          frame={liveFrame}
          hot={liveHot}
          onClose={() => setLiveOpen(false)}
        />
      )}
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center px-6 text-center">
      <div className="mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-primary/15 text-primary">
        <Sparkles className="h-6 w-6" />
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">What can I do for you?</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Ask me to download documents, fill forms, pay bills — I'll handle the browser work and check in when I need you.
      </p>
      <div className="mt-6 grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className="rounded-xl border border-border bg-card/60 px-4 py-3 text-left text-sm hover:bg-accent"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
