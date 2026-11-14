import { useState } from "react";
import {
  Bot,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  Send,
  Volume2,
  VolumeX,
  X,
  Zap,
} from "lucide-react";
import { AutoCoachAdvice } from "../types/game";
import { PipOverlayReply } from "../utils/pipOverlay";

interface InGameOverlayHudProps {
  visible: boolean;
  gameName: string;
  latestAdvice: AutoCoachAdvice | null;
  latestReply: PipOverlayReply | null;
  isGenerating: boolean;
  isAiSpeaking: boolean;
  autoCoachEnabled: boolean;
  autoCoachBusy: boolean;
  isMicMuted: boolean;
  isSpeakerMuted: boolean;
  isSharing: boolean;
  compactMode: boolean;
  onClose: () => void;
  onToggleCompactMode: () => void;
  onToggleAutoCoach: () => void;
  onToggleMicMute: () => void;
  onToggleSpeakerMute: () => void;
  onRunAutoCoachNow: () => void;
  onSendMessage: (text: string) => void;
}

export function InGameOverlayHud({
  visible,
  gameName,
  latestAdvice,
  latestReply,
  isGenerating,
  isAiSpeaking,
  autoCoachEnabled,
  autoCoachBusy,
  isMicMuted,
  isSpeakerMuted,
  isSharing,
  compactMode,
  onClose,
  onToggleCompactMode,
  onToggleAutoCoach,
  onToggleMicMute,
  onToggleSpeakerMute,
  onRunAutoCoachNow,
  onSendMessage,
}: InGameOverlayHudProps) {
  const [textInput, setTextInput] = useState("");

  if (!visible) return null;

  const coachStatusLabel = autoCoachBusy
    ? "Mengecek..."
    : autoCoachEnabled
      ? "Coach: Aktif"
      : "Coach: Mati";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = textInput.trim();
    if (!trimmed || isGenerating) return;
    onSendMessage(trimmed);
    setTextInput("");
  };

  const displayLabel = isGenerating
    ? "Asaw AI menjawab..."
    : isAiSpeaking && !isSpeakerMuted
      ? "Asaw AI berbicara..."
      : latestReply
        ? latestReply.label
        : latestAdvice
          ? `Auto-Coach · ${
              latestAdvice.urgency === "alert"
                ? "Peringatan"
                : latestAdvice.urgency === "important"
                  ? "Penting"
                  : "Info"
            }`
          : "Siap Memantau";

  const displayTimestamp =
    latestReply?.timestamp || latestAdvice?.timestamp || "--:--";

  const displayText =
    latestReply?.text ||
    latestAdvice?.instruction ||
    (isSharing
      ? "Auto-Coach aktif memantau layar. Anda juga bisa mengetik pertanyaan di bawah."
      : "Bagikan layar game Anda atau ketik pertanyaan langsung di bawah.");

  return (
    <div
      role="region"
      aria-label="Overlay In-Game HUD"
      className={`fixed bottom-4 right-4 z-40 max-w-[calc(100vw-2rem)] rounded-xl border border-[#00A2FF]/45 bg-[#090B10]/[0.97] shadow-2xl overflow-hidden ${
        compactMode ? "w-auto" : "w-[360px]"
      }`}
    >
      <div className="flex items-center justify-between gap-3 border-b border-white/8 px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <Bot className="h-4 w-4 text-[#00A2FF] shrink-0" />
          <span className="text-xs font-semibold text-white truncate">
            {compactMode ? "Asaw AI" : `Asaw AI · ${gameName}`}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onToggleCompactMode}
            title={compactMode ? "Buka Mode Penuh" : "Aktifkan Mode Ringkas"}
            className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px] font-medium text-slate-300 hover:bg-white/10 hover:text-white whitespace-nowrap shrink-0"
          >
            {compactMode ? (
              <>
                <Maximize2 className="h-3 w-3 text-[#00A2FF]" />
                <span>Penuh</span>
              </>
            ) : (
              <>
                <Minimize2 className="h-3 w-3 text-[#00A2FF]" />
                <span>Mode Ringkas</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup Overlay HUD"
            className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white shrink-0"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {compactMode ? (
        <div className="flex items-center gap-1.5 px-3 py-2.5">
          <button
            type="button"
            onClick={onToggleAutoCoach}
            title="Klik untuk nyalakan atau matikan Auto-Coach"
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              autoCoachBusy
                ? "border-[#00A2FF]/50 bg-[#00A2FF]/15 text-[#7DD3FC]"
                : autoCoachEnabled
                  ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-200"
                  : "border-white/12 bg-white/5 text-slate-300 hover:bg-white/10"
            }`}
          >
            <Bot className="h-3.5 w-3.5 shrink-0" />
            <span>{coachStatusLabel}</span>
          </button>

          <button
            type="button"
            onClick={onToggleMicMute}
            title={isMicMuted ? "Unmute Mic" : "Mute Mic"}
            aria-label={isMicMuted ? "Unmute Mic" : "Mute Mic"}
            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              isMicMuted
                ? "border-amber-500/40 bg-amber-500/15 text-amber-200"
                : "border-white/12 bg-white/5 text-slate-200 hover:bg-white/10"
            }`}
          >
            {isMicMuted ? (
              <MicOff className="h-3.5 w-3.5" />
            ) : (
              <Mic className="h-3.5 w-3.5 text-emerald-400" />
            )}
            <span>{isMicMuted ? "Mic Mute" : "Mic"}</span>
          </button>

          <button
            type="button"
            onClick={onToggleSpeakerMute}
            title={isSpeakerMuted ? "Unmute Suara AI" : "Mute Suara AI"}
            aria-label={isSpeakerMuted ? "Unmute Suara AI" : "Mute Suara AI"}
            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              isSpeakerMuted
                ? "border-red-500/40 bg-red-500/15 text-red-200"
                : isAiSpeaking
                  ? "border-[#00A2FF]/45 bg-[#00A2FF]/15 text-[#7DD3FC]"
                  : "border-white/12 bg-white/5 text-slate-200 hover:bg-white/10"
            }`}
          >
            {isSpeakerMuted ? (
              <VolumeX className="h-3.5 w-3.5" />
            ) : (
              <Volume2 className="h-3.5 w-3.5 text-[#00A2FF]" />
            )}
            <span>
              {isSpeakerMuted ? "AI Mute" : isAiSpeaking ? "AI Bicara" : "AI"}
            </span>
          </button>
        </div>
      ) : (
        <div className="p-3.5 space-y-3">
          <div className="max-h-36 overflow-y-auto border-b border-white/8 pb-3 space-y-1">
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 tabular-nums">
              <span>{displayLabel}</span>
              <span>{displayTimestamp}</span>
            </div>
            <p className="text-xs leading-relaxed text-slate-100 whitespace-pre-wrap">
              {displayText}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onToggleAutoCoach}
              className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                autoCoachEnabled
                  ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-200"
                  : "border-white/12 bg-white/5 text-slate-300"
              }`}
            >
              <Bot className="h-3.5 w-3.5" />
              <span>Coach: {autoCoachEnabled ? "On" : "Off"}</span>
            </button>

            <button
              type="button"
              onClick={onRunAutoCoachNow}
              disabled={!isSharing || autoCoachBusy}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#00A2FF] px-2.5 py-1.5 text-xs font-semibold text-[#06101B] transition-colors hover:bg-[#33B5FF] disabled:opacity-40 whitespace-nowrap"
            >
              <Zap className="h-3.5 w-3.5" />
              <span>{autoCoachBusy ? "Cek..." : "Cek Layar"}</span>
            </button>

            <button
              type="button"
              onClick={onToggleMicMute}
              className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                isMicMuted
                  ? "border-amber-500/40 bg-amber-500/15 text-amber-200"
                  : "border-white/12 bg-white/5 text-slate-200"
              }`}
            >
              {isMicMuted ? (
                <MicOff className="h-3.5 w-3.5" />
              ) : (
                <Mic className="h-3.5 w-3.5 text-emerald-400" />
              )}
              <span>{isMicMuted ? "Unmute Mic" : "Mute Mic"}</span>
            </button>

            <button
              type="button"
              onClick={onToggleSpeakerMute}
              className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                isSpeakerMuted
                  ? "border-red-500/40 bg-red-500/15 text-red-200"
                  : isAiSpeaking
                    ? "border-[#00A2FF]/45 bg-[#00A2FF]/15 text-[#7DD3FC]"
                    : "border-white/12 bg-white/5 text-slate-200 hover:bg-white/10"
              }`}
            >
              {isSpeakerMuted ? (
                <VolumeX className="h-3.5 w-3.5" />
              ) : (
                <Volume2 className="h-3.5 w-3.5 text-[#00A2FF]" />
              )}
              <span>
                {isSpeakerMuted
                  ? "Unmute AI"
                  : isAiSpeaking
                    ? "Mute AI (Bicara)"
                    : "Mute AI"}
              </span>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex items-center gap-2 pt-0.5">
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Tanya Asaw AI..."
              className="flex-1 min-w-0 rounded-lg border border-white/12 bg-[#11151E] px-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-[#00A2FF] focus:outline-none"
            />
            <button
              type="submit"
              disabled={isGenerating || !textInput.trim()}
              aria-label="Kirim pesan dari overlay"
              className="inline-flex items-center gap-1 rounded-lg bg-[#00A2FF] px-3 py-1.5 text-xs font-semibold text-[#06101B] transition-colors hover:bg-[#33B5FF] disabled:opacity-40 whitespace-nowrap shrink-0"
            >
              <Send className="h-3.5 w-3.5" />
              <span>{isGenerating ? "..." : "Kirim"}</span>
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
