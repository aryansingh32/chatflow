import { Plus, MessageSquare, Trash2, PanelLeftClose, User, Workflow, Clock } from "lucide-react";
import type { Profile, Thread } from "@/lib/chat-types";

interface Props {
  threads: Thread[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  profile: Profile;
  profiles: Profile[];
  onProfileChange: (id: string) => void;
}

export function ChatSidebar({
  threads,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onClose,
  profile,
  profiles,
  onProfileChange,
}: Props) {
  return (
    <aside className="flex h-full w-72 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex items-center justify-between px-3 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary text-primary-foreground">A</span>
          Agent
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
          aria-label="Hide sidebar"
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </div>

      <div className="px-3">
        <button
          onClick={onNew}
          className="flex w-full items-center gap-2 rounded-lg border border-sidebar-border bg-sidebar-accent/40 px-3 py-2 text-sm font-medium hover:bg-sidebar-accent"
        >
          <Plus className="h-4 w-4" /> New chat
        </button>
      </div>

      <div className="px-3 pt-4 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
        <Clock className="h-3 w-3" /> History
      </div>
      <div className="scroll-thin flex-1 overflow-y-auto px-2 pb-2">
        {threads.map((t) => {
          const active = t.id === activeId;
          return (
            <div
              key={t.id}
              className={`group mb-0.5 flex items-center gap-2 rounded-lg px-2 py-2 text-sm ${
                active ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/50"
              }`}
            >
              <button
                onClick={() => onSelect(t.id)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{t.title || "New chat"}</span>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(t.id);
                }}
                className="rounded p-1 text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:bg-destructive/20 hover:text-destructive"
                aria-label="Delete chat"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>

      <div className="border-t border-sidebar-border p-3 space-y-3">
        <div>
          <label className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            <User className="h-3 w-3" /> Profile
          </label>
          <select
            value={profile.id}
            onChange={(e) => onProfileChange(e.target.value)}
            className="w-full rounded-md border border-sidebar-border bg-sidebar-accent/40 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Workflow className="h-3 w-3" />
          <span>Workflows · coming soon</span>
        </div>
      </div>
    </aside>
  );
}
