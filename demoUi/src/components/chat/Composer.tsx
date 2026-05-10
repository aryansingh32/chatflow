import { useEffect, useRef, useState } from "react";
import { Send, Paperclip, X, Square } from "lucide-react";

interface Props {
  onSend: (text: string, files: File[]) => void;
  busy: boolean;
  onStop?: () => void;
}

export function Composer({ onSend, busy, onStop }: Props) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [drag, setDrag] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    taRef.current?.focus();
  }, []);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "0px";
    ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
  }, [text]);

  const submit = () => {
    if (busy) return;
    const t = text.trim();
    if (!t && files.length === 0) return;
    onSend(t, files);
    setText("");
    setFiles([]);
    requestAnimationFrame(() => taRef.current?.focus());
  };

  return (
    <div className="px-4 pb-4 pt-2">
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const dropped = Array.from(e.dataTransfer.files);
          if (dropped.length) setFiles((f) => [...f, ...dropped]);
        }}
        className={`mx-auto max-w-3xl rounded-2xl border bg-card shadow-sm transition ${
          drag ? "border-primary ring-2 ring-primary/30" : "border-border"
        }`}
      >
        {files.length > 0 && (
          <div className="flex flex-wrap gap-2 border-b border-border px-3 py-2">
            {files.map((f, i) => (
              <div key={i} className="flex items-center gap-1.5 rounded-lg bg-muted px-2 py-1 text-xs">
                <Paperclip className="h-3 w-3" />
                <span className="max-w-[160px] truncate">{f.name}</span>
                <button
                  onClick={() => setFiles((arr) => arr.filter((_, j) => j !== i))}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2 px-3 py-2.5">
          <button
            onClick={() => fileRef.current?.click()}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Attach files"
            type="button"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              const arr = Array.from(e.target.files ?? []);
              if (arr.length) setFiles((f) => [...f, ...arr]);
              e.target.value = "";
            }}
          />
          <textarea
            ref={taRef}
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={busy ? "Agent is working…" : "Message agent — try “Download my Aadhaar”"}
            className="max-h-[200px] flex-1 resize-none bg-transparent py-1.5 text-sm leading-6 placeholder:text-muted-foreground focus:outline-none"
          />
          {busy ? (
            <button
              onClick={onStop}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-destructive text-destructive-foreground hover:opacity-90"
              aria-label="Stop"
              type="button"
            >
              <Square className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={!text.trim() && files.length === 0}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40"
              aria-label="Send"
              type="button"
            >
              <Send className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      <p className="mx-auto mt-2 max-w-3xl text-center text-[11px] text-muted-foreground">
        Drop files anywhere · Press Enter to send · Shift+Enter for newline
      </p>
    </div>
  );
}
