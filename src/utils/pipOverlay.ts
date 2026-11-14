import { AutoCoachAdvice } from "../types/game";

export interface PipOverlayReply {
  label: string;
  text: string;
  timestamp: string;
}

export interface PipOverlayState {
  gameName: string;
  advice: AutoCoachAdvice | null;
  latestReply: PipOverlayReply | null;
  isGenerating: boolean;
  isAiSpeaking: boolean;
  autoCoachEnabled: boolean;
  autoCoachBusy: boolean;
  isMicMuted: boolean;
  isSpeakerMuted: boolean;
  isSharing: boolean;
  compactMode: boolean;
}

export interface PipOverlayCallbacks {
  onToggleCompactMode: () => void;
  onToggleAutoCoach: () => void;
  onToggleMicMute: () => void;
  onToggleSpeakerMute: () => void;
  onRunAutoCoachNow: () => void;
  onSendMessage: (text: string) => void;
}

type PipWindowWithCallbacks = Window & {
  __asawPipCallbacks?: PipOverlayCallbacks;
};

declare global {
  interface Window {
    documentPictureInPicture?: {
      requestWindow: (options?: {
        width?: number;
        height?: number;
      }) => Promise<Window>;
    };
  }
}

export function renderDocumentPipContent(
  pipWin: Window,
  state: PipOverlayState,
  callbacks: PipOverlayCallbacks
) {
  const winWithCb = pipWin as PipWindowWithCallbacks;
  winWithCb.__asawPipCallbacks = callbacks;

  const doc = pipWin.document;
  if (!doc.getElementById("gs-pip-root")) {
    doc.head.innerHTML = `
      <title>Overlay · Asaw AI</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: system-ui, -apple-system, sans-serif; }
        body { background: #090B10; color: #F8FAFC; padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; height: 100vh; }
        .top { display: flex; justify-content: space-between; align-items: center; gap: 8px; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 7px; }
        .title { font-size: 12px; font-weight: 700; color: #FFFFFF; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .top-right { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
        .tag { font-size: 11px; color: #7DD3FC; font-family: monospace; white-space: nowrap; }
        .card { flex: 1; background: #11151E; border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 10px; display: flex; flex-direction: column; gap: 6px; overflow-y: auto; }
        .meta { font-size: 11px; color: #94A3B8; font-family: monospace; }
        .msg { font-size: 12.5px; line-height: 1.45; color: #F8FAFC; white-space: pre-wrap; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
        .composer { display: flex; align-items: center; gap: 6px; }
        .composer input { flex: 1; min-width: 0; border-radius: 8px; border: 1px solid rgba(255,255,255,0.14); background: #11151E; color: #F8FAFC; padding: 7px 10px; font-size: 12px; outline: none; }
        .composer input:focus { border-color: #00A2FF; }
        .compact-bar { display: flex; align-items: center; gap: 6px; }
        .compact-bar button { flex: 1; white-space: nowrap; }
        button { cursor: pointer; border-radius: 8px; border: 1px solid rgba(255,255,255,0.14); background: #182030; color: #E2E8F0; padding: 7px 8px; font-size: 11px; font-weight: 600; white-space: nowrap; }
        button:hover { background: #222D42; }
        button:disabled { opacity: 0.45; cursor: not-allowed; }
        button.mini { padding: 4px 8px; font-size: 11px; background: rgba(255,255,255,0.06); }
        button.primary { background: #00A2FF; color: #06101B; border-color: #00A2FF; }
        button.active { border-color: rgba(16,185,129,0.5); background: rgba(16,185,129,0.18); color: #A7F3D0; }
        button.busy { border-color: rgba(0,162,255,0.5); background: rgba(0,162,255,0.18); color: #7DD3FC; }
        button.muted { border-color: rgba(239,68,68,0.45); background: rgba(239,68,68,0.18); color: #FECACA; }
      </style>
    `;
    doc.body.innerHTML = `<div id="gs-pip-root" style="display:flex;flex-direction:column;gap:8px;height:100%;"></div>`;
  }

  const root = doc.getElementById("gs-pip-root");
  if (!root) return;

  const targetMode = state.compactMode ? "compact" : "full";
  if (root.dataset.mode !== targetMode) {
    root.dataset.mode = targetMode;
    if (state.compactMode) {
      root.innerHTML = `
        <div class="top">
          <span id="pip-title" class="title">Asaw AI</span>
          <div class="top-right">
            <button id="btn-compact" type="button" class="mini">Mode Penuh</button>
          </div>
        </div>
        <div class="compact-bar">
          <button id="btn-coach" type="button"></button>
          <button id="btn-mic" type="button"></button>
          <button id="btn-spk" type="button"></button>
        </div>
      `;
    } else {
      root.innerHTML = `
        <div class="top">
          <span id="pip-title" class="title"></span>
          <div class="top-right">
            <span id="pip-tag" class="tag"></span>
            <button id="btn-compact" type="button" class="mini">Ringkas</button>
          </div>
        </div>
        <div id="pip-card" class="card">
          <div id="pip-meta" class="meta"></div>
          <div id="pip-msg" class="msg"></div>
        </div>
        <div class="grid">
          <button id="btn-coach" type="button"></button>
          <button id="btn-check" type="button" class="primary"></button>
          <button id="btn-mic" type="button"></button>
          <button id="btn-spk" type="button"></button>
        </div>
        <form id="pip-form" class="composer">
          <input id="pip-text-input" type="text" placeholder="Tanya Asaw AI..." autocomplete="off" />
          <button id="btn-send" type="submit" class="primary">Kirim</button>
        </form>
      `;

      doc.getElementById("pip-form")?.addEventListener("submit", (e) => {
        e.preventDefault();
        const sendBtn = doc.getElementById("btn-send") as HTMLButtonElement | null;
        if (sendBtn?.disabled) return;
        const inputEl = doc.getElementById("pip-text-input") as HTMLInputElement | null;
        const val = inputEl?.value.trim() || "";
        if (!val) return;
        winWithCb.__asawPipCallbacks?.onSendMessage(val);
        if (inputEl) inputEl.value = "";
      });
    }

    doc.getElementById("btn-compact")?.addEventListener("click", () => {
      winWithCb.__asawPipCallbacks?.onToggleCompactMode();
    });
    doc.getElementById("btn-coach")?.addEventListener("click", () => {
      winWithCb.__asawPipCallbacks?.onToggleAutoCoach();
    });
    doc.getElementById("btn-check")?.addEventListener("click", () => {
      winWithCb.__asawPipCallbacks?.onRunAutoCoachNow();
    });
    doc.getElementById("btn-mic")?.addEventListener("click", () => {
      winWithCb.__asawPipCallbacks?.onToggleMicMute();
    });
    doc.getElementById("btn-spk")?.addEventListener("click", () => {
      winWithCb.__asawPipCallbacks?.onToggleSpeakerMute();
    });
  }

  const coachClass = state.autoCoachBusy
    ? "busy"
    : state.autoCoachEnabled
      ? "active"
      : "";
  const coachText = state.autoCoachBusy
    ? "Mengecek..."
    : state.autoCoachEnabled
      ? "Coach: Aktif"
      : "Coach: Mati";

  const btnCoach = doc.getElementById("btn-coach");
  if (btnCoach) {
    btnCoach.className = coachClass;
    btnCoach.textContent = coachText;
  }

  const btnMic = doc.getElementById("btn-mic");
  if (btnMic) {
    btnMic.className = state.isMicMuted ? "muted" : "";
    btnMic.textContent = state.compactMode
      ? state.isMicMuted
        ? "Mic Mute"
        : "Mic"
      : state.isMicMuted
        ? "Unmute Mic"
        : "Mute Mic";
  }

  const btnSpk = doc.getElementById("btn-spk");
  if (btnSpk) {
    btnSpk.className = state.isSpeakerMuted
      ? "muted"
      : state.isAiSpeaking
        ? "active"
        : "";
    btnSpk.textContent = state.compactMode
      ? state.isSpeakerMuted
        ? "AI Mute"
        : state.isAiSpeaking
          ? "AI Bicara"
          : "AI"
      : state.isSpeakerMuted
        ? "Unmute AI"
        : state.isAiSpeaking
          ? "Mute AI (Bicara)"
          : "Mute AI";
  }

  if (state.compactMode) return;

  const titleEl = doc.getElementById("pip-title");
  if (titleEl) titleEl.textContent = state.gameName;

  const urgencyLabel = state.latestReply
    ? state.latestReply.label
    : state.advice
      ? state.advice.urgency === "alert"
        ? "Peringatan"
        : state.advice.urgency === "important"
          ? "Penting"
          : "Info"
      : "Siap";

  const tagEl = doc.getElementById("pip-tag");
  if (tagEl) {
    tagEl.textContent = `${urgencyLabel} · ${
      state.latestReply?.timestamp || state.advice?.timestamp || "--:--"
    }`;
  }

  const metaEl = doc.getElementById("pip-meta");
  if (metaEl) {
    metaEl.textContent = state.isGenerating
      ? "Asaw AI sedang menjawab..."
      : state.isAiSpeaking && !state.isSpeakerMuted
        ? "Asaw AI sedang berbicara..."
        : state.isSpeakerMuted && state.latestReply
          ? "Suara AI di-mute · Klik Unmute AI untuk dengar"
          : state.latestReply
            ? "Jawaban Asaw AI"
            : "Auto-Coach · Bahasa Indonesia";
  }

  const msgEl = doc.getElementById("pip-msg");
  if (msgEl) {
    const displayText =
      state.latestReply?.text ||
      state.advice?.instruction ||
      (state.isSharing
        ? "Auto-Coach memantau layar. Anda juga bisa mengetik pertanyaan di bawah."
        : "Mulai Share Layar atau ketik pertanyaan langsung di bawah.");
    msgEl.textContent = displayText;
    const cardEl = doc.getElementById("pip-card");
    if (cardEl && state.isGenerating) {
      cardEl.scrollTop = cardEl.scrollHeight;
    }
  }

  const btnCheck = doc.getElementById("btn-check") as HTMLButtonElement | null;
  if (btnCheck) {
    btnCheck.textContent = state.autoCoachBusy ? "Mengecek..." : "Cek Layar";
    btnCheck.disabled = !state.isSharing || state.autoCoachBusy;
  }

  const btnSend = doc.getElementById("btn-send") as HTMLButtonElement | null;
  if (btnSend) {
    btnSend.textContent = state.isGenerating ? "..." : "Kirim";
    btnSend.disabled = state.isGenerating;
  }
}

export function drawCanvasPipOverlay(
  canvas: HTMLCanvasElement,
  state: PipOverlayState
) {
  canvas.width = 480;
  canvas.height = state.compactMode ? 140 : 270;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.fillStyle = "#090B10";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#11151E";
  ctx.fillRect(14, 14, canvas.width - 28, canvas.height - 28);
  ctx.strokeStyle = "rgba(0, 162, 255, 0.5)";
  ctx.lineWidth = 2;
  ctx.strokeRect(14, 14, canvas.width - 28, canvas.height - 28);

  ctx.fillStyle = "#00A2FF";
  ctx.font = "bold 16px sans-serif";
  ctx.fillText(
    state.compactMode
      ? "Asaw AI · Mode Ringkas"
      : `Asaw AI · ${state.gameName}`,
    28,
    46
  );

  ctx.fillStyle = "#E2E8F0";
  ctx.font = state.compactMode ? "15px monospace" : "13px monospace";
  const coachLabel = state.autoCoachBusy
    ? "Mengecek"
    : state.autoCoachEnabled
      ? "Aktif"
      : "Mati";
  const statusLine = `Coach: ${coachLabel}  |  Mic: ${
    state.isMicMuted ? "Mute" : "Aktif"
  }  |  AI: ${state.isSpeakerMuted ? "Mute" : "Aktif"}`;
  ctx.fillText(statusLine, 28, state.compactMode ? 88 : 72);

  if (state.compactMode) return;

  const text =
    state.latestReply?.text ||
    state.advice?.instruction ||
    (state.isSharing
      ? "Memantau layar game secara otomatis..."
      : "Mulai Share Layar agar Auto-Coach aktif.");

  ctx.fillStyle = "#F8FAFC";
  ctx.font = "16px sans-serif";
  wrapText(ctx, text, 28, 114, canvas.width - 56, 24);
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number
) {
  const words = text.split(" ");
  let line = "";
  let currY = y;
  for (let i = 0; i < words.length; i++) {
    const testLine = `${line}${words[i]} `;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && i > 0) {
      ctx.fillText(line.trim(), x, currY);
      line = `${words[i]} `;
      currY += lineHeight;
    } else {
      line = testLine;
    }
  }
  if (line.trim()) {
    ctx.fillText(line.trim(), x, currY);
  }
}
