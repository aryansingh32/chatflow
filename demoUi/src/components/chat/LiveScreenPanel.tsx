import { Monitor, X, Maximize2 } from "lucide-react";

interface Props {
  frame: string | null;
  hot: boolean;
  onClose: () => void;
}

export function LiveScreenPanel({ frame, hot, onClose }: Props) {
  return (
    <aside className="flex h-full w-[380px] flex-col border-l border-border bg-sidebar">
      <div className="flex items-center justify-between border-b border-border px-3 py-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Monitor className="h-4 w-4 text-primary" />
          Live screen
          {frame && (
            <span className="ml-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="live-dot" /> {hot ? "high FPS" : "live"}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Close live view"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 scroll-thin">
        <div className="overflow-hidden rounded-xl border border-border bg-background">
          {frame ? (
            <img
              src={frame}
              alt="Live agent view"
              className="block w-full object-cover"
            />
          ) : (
            <div className="flex aspect-video flex-col items-center justify-center gap-2 text-center text-xs text-muted-foreground">
              <Maximize2 className="h-5 w-5" />
              <div>No active session</div>
              <div className="opacity-70">Send a task to see the agent work live</div>
            </div>
          )}
        </div>
        <div className="mt-3 rounded-xl border border-border bg-card/40 p-3 text-xs text-muted-foreground">
          Frames stream in real time during browser automation. FPS auto-increases on
          CAPTCHA, payments, and other critical steps.
        </div>
      </div>
    </aside>
  );
}
