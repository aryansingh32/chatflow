import { useEffect, useRef, useState } from "react";
import { Check, X, ShieldCheck, KeyRound, Wallet, AlertCircle } from "lucide-react";
import type { InputCardMessage } from "@/lib/chat-types";
import { resolveCard } from "@/lib/mock-bot";

interface Props {
  msg: InputCardMessage;
}

export function InputCard({ msg }: Props) {
  if (msg.resolved) return <ResolvedCard msg={msg} />;
  switch (msg.kind) {
    case "otp": return <OtpCard msg={msg} />;
    case "captcha": return <CaptchaCard msg={msg} />;
    case "upi": return <UpiCard msg={msg} />;
    case "confirm": return <ConfirmCard msg={msg} />;
  }
}

function CardShell({
  icon, title, children,
}: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/15 text-primary">
          {icon}
        </span>
        {title}
      </div>
      {children}
    </div>
  );
}

function ResolvedCard({ msg }: { msg: InputCardMessage }) {
  const label =
    msg.kind === "confirm" ? msg.resolved!.value :
    msg.kind === "otp" ? "•".repeat(msg.resolved!.value.length) :
    msg.resolved!.value;
  return (
    <div className="rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground flex items-center gap-2">
      <Check className="h-4 w-4 text-primary" />
      <span className="capitalize">{msg.kind}</span>
      <span>·</span>
      <span className="text-foreground">{label}</span>
    </div>
  );
}

function OtpCard({ msg }: { msg: InputCardMessage }) {
  const [vals, setVals] = useState<string[]>(Array(6).fill(""));
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  useEffect(() => { refs.current[0]?.focus(); }, []);

  const setAt = (i: number, v: string) => {
    const c = v.replace(/\D/g, "").slice(-1);
    const next = [...vals];
    next[i] = c;
    setVals(next);
    if (c && i < 5) refs.current[i + 1]?.focus();
  };
  const onKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !vals[i] && i > 0) refs.current[i - 1]?.focus();
  };
  const onPaste = (e: React.ClipboardEvent) => {
    const txt = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!txt) return;
    e.preventDefault();
    const arr = Array(6).fill("").map((_, i) => txt[i] ?? "");
    setVals(arr);
    refs.current[Math.min(txt.length, 5)]?.focus();
  };
  const submit = () => {
    const v = vals.join("");
    if (v.length === 6) resolveCard(msg.id, v);
  };
  return (
    <CardShell icon={<KeyRound className="h-4 w-4" />} title="Enter OTP">
      <p className="mb-3 text-sm text-muted-foreground">{msg.prompt}</p>
      <div className="mb-3 flex gap-2" onPaste={onPaste}>
        {vals.map((v, i) => (
          <input
            key={i}
            ref={(el) => { refs.current[i] = el; }}
            value={v}
            onChange={(e) => setAt(i, e.target.value)}
            onKeyDown={(e) => onKey(i, e)}
            inputMode="numeric"
            maxLength={1}
            className="h-12 w-10 rounded-lg border border-input bg-background text-center text-lg font-semibold focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        ))}
      </div>
      <button
        onClick={submit}
        disabled={vals.join("").length < 6}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        Verify
      </button>
    </CardShell>
  );
}

function CaptchaCard({ msg }: { msg: InputCardMessage }) {
  const [v, setV] = useState("");
  return (
    <CardShell icon={<ShieldCheck className="h-4 w-4" />} title="Solve CAPTCHA">
      <p className="mb-3 text-sm text-muted-foreground">{msg.prompt}</p>
      <div className="mb-3 overflow-hidden rounded-lg border border-border bg-background p-2">
        <img
          src={msg.data?.captchaUrl}
          alt="captcha"
          className="block h-20 w-full object-contain"
        />
      </div>
      <div className="flex gap-2">
        <input
          autoFocus
          value={v}
          onChange={(e) => setV(e.target.value)}
          placeholder="Type the characters"
          className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          onKeyDown={(e) => { if (e.key === "Enter" && v) resolveCard(msg.id, v); }}
        />
        <button
          onClick={() => v && resolveCard(msg.id, v)}
          disabled={!v}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          Submit
        </button>
      </div>
    </CardShell>
  );
}

function UpiCard({ msg }: { msg: InputCardMessage }) {
  const [v, setV] = useState("");
  const valid = /^[\w.\-]{2,}@[a-z]{2,}$/i.test(v);
  return (
    <CardShell icon={<Wallet className="h-4 w-4" />} title="UPI ID">
      <p className="mb-3 text-sm text-muted-foreground">{msg.prompt}</p>
      <div className="flex gap-2">
        <input
          autoFocus
          value={v}
          onChange={(e) => setV(e.target.value)}
          placeholder="yourname@bank"
          className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
        />
        <button
          onClick={() => valid && resolveCard(msg.id, v)}
          disabled={!valid}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          Continue
        </button>
      </div>
      {!valid && v && (
        <div className="mt-2 flex items-center gap-1 text-xs text-warning">
          <AlertCircle className="h-3 w-3" /> Looks like an invalid UPI ID
        </div>
      )}
    </CardShell>
  );
}

function ConfirmCard({ msg }: { msg: InputCardMessage }) {
  return (
    <CardShell icon={<Check className="h-4 w-4" />} title="Confirmation">
      <p className="mb-1 text-sm text-muted-foreground">{msg.prompt}</p>
      {msg.data?.amount && (
        <div className="my-3 text-2xl font-semibold tracking-tight">{msg.data.amount}</div>
      )}
      <div className="mt-2 flex gap-2">
        <button
          onClick={() => resolveCard(msg.id, msg.data?.confirmLabel ?? "Confirm")}
          className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          <Check className="mr-1 inline h-4 w-4" />
          {msg.data?.confirmLabel ?? "Confirm"}
        </button>
        <button
          onClick={() => resolveCard(msg.id, msg.data?.cancelLabel ?? "Cancel")}
          className="flex-1 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          <X className="mr-1 inline h-4 w-4" />
          {msg.data?.cancelLabel ?? "Cancel"}
        </button>
      </div>
    </CardShell>
  );
}
