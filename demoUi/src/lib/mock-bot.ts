import { uid } from "./chat-store";
import type { ChatMessage, TimelineStep } from "./chat-types";

export interface BotEmitter {
  pushMessage: (m: ChatMessage) => void;
  patchMessage: (id: string, patch: Partial<ChatMessage>) => void;
  setLiveFrame: (url: string | null, hot?: boolean) => void;
  setTyping: (typing: boolean) => void;
}

const SHOTS = [
  "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=900&q=70",
  "https://images.unsplash.com/photo-1555421689-491a97ff2040?w=900&q=70",
  "https://images.unsplash.com/photo-1607799279861-4dd421887fb3?w=900&q=70",
  "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=900&q=70",
  "https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=900&q=70",
];

function delay(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function detectIntent(text: string) {
  const t = text.toLowerCase();
  if (/aadhaar|aadhar|pan card|passport|download/.test(t)) return "download";
  if (/job|form|fill|apply/.test(t)) return "form";
  if (/pay|upi|recharge|bill|ticket/.test(t)) return "payment";
  return "general";
}

export async function runMockTask(text: string, emit: BotEmitter) {
  const intent = detectIntent(text);

  emit.setTyping(true);
  await delay(700);
  emit.setTyping(false);

  // Greeting message
  const greetingId = uid();
  emit.pushMessage({
    id: greetingId,
    role: "bot",
    type: "text",
    createdAt: Date.now(),
    content: greetingFor(intent, text),
  });

  // Timeline
  const timelineId = uid();
  const steps: TimelineStep[] = stepsFor(intent).map((label, i) => ({
    id: uid(),
    label,
    status: i === 0 ? "active" : "pending",
    at: Date.now(),
  }));
  emit.pushMessage({
    id: timelineId,
    role: "bot",
    type: "timeline",
    createdAt: Date.now(),
    title: titleFor(intent),
    steps,
    done: false,
  });

  // Begin "browser session"
  emit.setLiveFrame(SHOTS[0], false);
  await delay(900);

  for (let i = 0; i < steps.length; i++) {
    // mark current done if not first iteration
    if (i > 0) {
      steps[i - 1].status = "done";
      steps[i].status = "active";
      emit.patchMessage(timelineId, { steps: [...steps] });
    }
    emit.setLiveFrame(SHOTS[i % SHOTS.length], false);
    await delay(1100);

    // Trigger interactive cards on certain steps
    if (intent === "download" && i === 1) {
      await askCard(emit, {
        kind: "captcha",
        prompt: "Please solve the CAPTCHA shown on screen to continue.",
        data: { captchaUrl: "https://dummyimage.com/240x80/1f2937/ffffff&text=8K2P9A" },
      });
      emit.setLiveFrame(SHOTS[(i + 1) % SHOTS.length], true);
    }
    if (intent === "download" && i === 2) {
      await askCard(emit, {
        kind: "otp",
        prompt: "Enter the 6-digit OTP sent to your registered mobile.",
      });
    }
    if (intent === "payment" && i === 1) {
      await askCard(emit, {
        kind: "upi",
        prompt: "Enter your UPI ID to proceed with payment.",
      });
    }
    if (intent === "payment" && i === 2) {
      await askCard(emit, {
        kind: "confirm",
        prompt: "Confirm payment of ₹499 to BSES Rajdhani?",
        data: { amount: "₹499", confirmLabel: "Pay now", cancelLabel: "Cancel" },
      });
    }
  }

  // Finalize
  steps[steps.length - 1].status = "done";
  emit.patchMessage(timelineId, { steps: [...steps], done: true });
  emit.setLiveFrame(null, false);

  // Result
  if (intent === "download") {
    emit.pushMessage({
      id: uid(),
      role: "bot",
      type: "download",
      createdAt: Date.now(),
      title: "Aadhaar e-Card",
      description: "Downloaded successfully and verified.",
      fileName: "aadhaar-ecard.pdf",
      mime: "application/pdf",
      sizeLabel: "412 KB",
    });
  } else if (intent === "payment") {
    emit.pushMessage({
      id: uid(),
      role: "bot",
      type: "download",
      createdAt: Date.now(),
      title: "Payment Receipt",
      description: "Bill paid successfully. Reference TXN8821X.",
      fileName: "receipt.pdf",
      mime: "application/pdf",
      sizeLabel: "88 KB",
    });
  }

  emit.pushMessage({
    id: uid(),
    role: "bot",
    type: "text",
    createdAt: Date.now(),
    content: closingFor(intent),
  });
}

function greetingFor(intent: string, text: string) {
  switch (intent) {
    case "download":
      return `Got it. I'll **download your document** now. I'll open the portal, log in on your behalf, and grab it. Watch the live screen on the right.`;
    case "payment":
      return `Sure — I'll handle the **payment**. I'll open the merchant page, enter details, and ask you to confirm before paying.`;
    case "form":
      return `On it. I'll **fill out the form** step by step using your saved profile. I'll ask if anything is missing.`;
    default:
      return `I can help with that. Let me get started on: _${text}_`;
  }
}

function titleFor(intent: string) {
  return intent === "download"
    ? "Document download"
    : intent === "payment"
      ? "Payment workflow"
      : intent === "form"
        ? "Form auto-fill"
        : "Task";
}

function stepsFor(intent: string) {
  if (intent === "download") {
    return ["Opening portal", "Solving CAPTCHA", "Verifying OTP", "Downloading file"];
  }
  if (intent === "payment") {
    return ["Loading merchant", "Collecting UPI", "Confirming amount", "Processing payment"];
  }
  if (intent === "form") {
    return ["Loading form", "Filling personal info", "Uploading documents", "Submitting"];
  }
  return ["Analyzing", "Working", "Finalizing"];
}

function closingFor(intent: string) {
  if (intent === "download") return "All done ✅ Your document is ready below.";
  if (intent === "payment") return "Payment complete ✅ Receipt saved below.";
  if (intent === "form") return "Form submitted ✅ You'll get an email confirmation.";
  return "Done ✅";
}

// helper that pushes an input card and waits for resolution via window event
function askCard(
  emit: BotEmitter,
  opts: {
    kind: "otp" | "captcha" | "upi" | "confirm";
    prompt: string;
    data?: Record<string, string>;
  }
) {
  const id = uid();
  emit.pushMessage({
    id,
    role: "bot",
    type: "input-card",
    createdAt: Date.now(),
    kind: opts.kind,
    prompt: opts.prompt,
    data: opts.data,
  });
  return new Promise<string>((resolve) => {
    const handler = (e: Event) => {
      const ev = e as CustomEvent<{ id: string; value: string }>;
      if (ev.detail.id === id) {
        emit.patchMessage(id, { resolved: { value: ev.detail.value, at: Date.now() } });
        window.removeEventListener("agent-card-resolve", handler);
        resolve(ev.detail.value);
      }
    };
    window.addEventListener("agent-card-resolve", handler);
  });
}

export function resolveCard(id: string, value: string) {
  window.dispatchEvent(new CustomEvent("agent-card-resolve", { detail: { id, value } }));
}
