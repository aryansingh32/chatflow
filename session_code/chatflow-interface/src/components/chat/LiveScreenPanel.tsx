import { Monitor, X, Maximize2, Wifi, WifiOff } from "lucide-react";

interface Props {
  frame: string | null;
  hot: boolean;
  onClose: () => void;
  connected?: boolean;
}

export function LiveScreenPanel({ frame, hot, onClose, connected = false }: Props) {
  return (
    <aside className="flex h-full w-[380px] flex-col border-l border-border bg-sidebar">
      <div className="flex items-center justify-between border-b border-border px-3 py-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Monitor className="h-4 w-4 text-primary" />
          Live screen
          {frame ? (
            <span className="ml-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="live-dot" /> {hot ? "high FPS" : "live"}
            </span>
          ) : (
            <span className="ml-1 flex items-center gap-1 text-[11px]">
              {connected ? (
                <>
                  <Wifi className="h-3 w-3 text-primary" />{" "}
                  <span className="text-muted-foreground">connected</span>
                </>
              ) : (
                <>
                  <WifiOff className="h-3 w-3 text-muted-foreground" />{" "}
                  <span className="text-muted-foreground">offline</span>
                </>
              )}
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
      <div className="flex-1 overflow-y-auto p-4 scroll-thin">
        <div className="relative overflow-hidden rounded-xl border border-primary/20 bg-black/5 shadow-[0_0_20px_rgba(0,0,0,0.05)] ring-1 ring-white/10 dark:bg-white/5">
          {frame ? (
            <>
              <img
                src={frame}
                alt="Live agent view"
                className="block aspect-video w-full object-cover transition-opacity duration-300"
              />
              {/* Subtle inner shadow for premium screen feel */}
              <div className="absolute inset-0 pointer-events-none shadow-[inset_0_0_20px_rgba(0,0,0,0.1)] rounded-xl" />
            </>
          ) : (
            <div className="relative flex aspect-video flex-col items-center justify-center gap-3 overflow-hidden text-center text-xs text-muted-foreground/80">
              {/* Scanline / gradient pulse effect */}
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/5 to-transparent bg-[length:100%_200%] animate-scanline" />

              <div className="relative flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/20">
                <Maximize2 className="h-5 w-5 text-primary/70" />
                <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl animate-pulse" />
              </div>

              <div className="relative z-10 space-y-1">
                <div className="font-medium text-foreground/80">Agent Standby</div>
                <div className="max-w-[200px] text-[11px] leading-relaxed opacity-70">
                  Awaiting task instructions. Live automation feed will appear here.
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 space-y-3 rounded-xl border border-border/50 bg-card/40 p-3.5 text-[11px] leading-relaxed text-muted-foreground shadow-sm">
          <div className="flex gap-2">
            <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              ⚡
            </div>
            <p>Frames stream securely in real time during automation.</p>
          </div>
          <div className="flex gap-2">
            <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              👁️
            </div>
            <p>FPS auto-adjusts to ensure smooth interaction during CAPTCHA and payments.</p>
          </div>
          {!connected && (
            <div className="flex gap-2 text-warning/90">
              <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-warning/10">
                ⚠️
              </div>
              <p>Backend disconnected. Frames will resume when session is active.</p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
