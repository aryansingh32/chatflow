import { useEffect, useState, useCallback, useRef } from "react";
import { Download, AlertCircle } from "lucide-react";
import { adminApi, type LogEntry } from "@/lib/admin-api";

const SERVICES = ["api", "worker", "execution", "auth", "system"];
const LOG_LEVELS: Record<string, string> = {
  info: "text-blue-300",
  warn: "text-amber-300",
  error: "text-red-400",
  debug: "text-zinc-400",
};

export function LogsPanel() {
  const [service, setService] = useState("api");
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [filter, setFilter] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const res = await adminApi.getLogs(service, 300); setEntries(res.entries); }
    catch {} finally { setLoading(false); }
  }, [service]);

  useEffect(() => {
    load();
    if (!autoRefresh) return;
    const iv = setInterval(load, 5000);
    return () => clearInterval(iv);
  }, [load, autoRefresh]);

  useEffect(() => { if (autoRefresh) bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [entries, autoRefresh]);

  const filtered = filter ? entries.filter((e) => JSON.stringify(e).toLowerCase().includes(filter.toLowerCase())) : entries;

  return (
    <div className="flex flex-col gap-4" style={{ height: "calc(100vh - 160px)" }}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1.5">
          {SERVICES.map((s) => (
            <button key={s} onClick={() => setService(s)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition capitalize ${service === s ? "bg-violet-500/20 text-violet-300 border border-violet-500/40" : "bg-card/60 text-muted-foreground border border-border/40"}`}>
              {s}
            </button>
          ))}
        </div>
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter…"
          className="rounded-xl border border-border/50 bg-card/60 px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-violet-500/60 focus:outline-none w-40" />
        <label className="flex items-center gap-2 cursor-pointer" onClick={() => setAutoRefresh((v) => !v)}>
          <div className={`relative h-5 w-9 rounded-full transition-colors ${autoRefresh ? "bg-violet-500" : "bg-zinc-700"}`}>
            <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${autoRefresh ? "translate-x-4" : "translate-x-0.5"}`} />
          </div>
          <span className="text-xs text-muted-foreground">Live</span>
        </label>
        <span className="ml-auto text-xs text-muted-foreground">{filtered.length} entries</span>
      </div>

      <div className="flex-1 overflow-y-auto rounded-2xl border border-border/40 bg-[oklch(0.1_0.01_260)] p-4 font-mono text-xs scroll-thin">
        {loading && !entries.length ? <p className="text-muted-foreground">Loading…</p> : !filtered.length ? <p className="text-muted-foreground">No entries</p> : (
          filtered.map((entry, i) => {
            const level = String(entry.level ?? "").toLowerCase();
            const cls = Object.entries(LOG_LEVELS).find(([k]) => level.includes(k))?.[1] ?? "text-zinc-300";
            const ts = entry.timestamp ? new Date(entry.timestamp as string).toLocaleTimeString() : "";
            const msg = String(entry.message ?? entry.msg ?? JSON.stringify(entry));
            return (
              <div key={i} className="flex gap-2 py-0.5 hover:bg-white/5 rounded">
                <span className="shrink-0 text-zinc-600 w-20">{ts}</span>
                <span className={`shrink-0 w-12 uppercase ${cls}`}>{level.slice(0, 5) || "LOG"}</span>
                <span className="text-zinc-300 break-all">{msg.slice(0, 300)}</span>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

export function ErrorsPanel() {
  const [errors, setErrors] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    try { const r = await adminApi.getErrors(200); setErrors(r.errors); } catch {} finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); const iv = setInterval(load, 10000); return () => clearInterval(iv); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <AlertCircle className="h-4 w-4 text-red-400" />
        <span className="text-sm font-medium text-foreground">{errors.length} recent errors</span>
      </div>
      {loading && !errors.length ? (
        <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>
      ) : !errors.length ? (
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 py-10 text-center text-sm text-emerald-400">✓ No recent errors</div>
      ) : errors.map((e, i) => (
        <div key={i} className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm text-red-300">{String(e.message ?? e.msg ?? "").slice(0, 200)}</p>
            <span className="shrink-0 text-[10px] text-muted-foreground">
              {e.timestamp ? new Date(e.timestamp as string).toLocaleString() : ""}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
