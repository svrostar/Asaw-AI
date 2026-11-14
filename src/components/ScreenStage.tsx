import { useRef } from "react";
import {
  Bot,
  Camera,
  Eye,
  ImagePlus,
  Layers,
  Mic,
  MicOff,
  Monitor,
  MonitorOff,
  Radio,
  Trash2,
  Volume2,
  VolumeX,
  Zap,
} from "lucide-react";
import {
  AutoCoachAdvice,
  GameProfile,
  LiveConnectionState,
  SnapshotFrame,
} from "../types/game";

interface ScreenStageProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  activeProfile: GameProfile;
  isSharing: boolean;
  screenResolution: { width: number; height: number } | null;
  liveState: LiveConnectionState;
  micLevel: number;
  isMicMuted: boolean;
  isSpeakerMuted: boolean;
  autoCoachEnabled: boolean;
  autoCoachIntervalSec: 5 | 8 | 12;
  autoCoachBusy: boolean;
  latestAdvice: AutoCoachAdvice | null;
  overlayOpen: boolean;
  snapshots: SnapshotFrame[];
  activeSnapshot: SnapshotFrame | null;
  onStartShare: () => void;
  onStopShare: () => void;
  onCaptureSnapshot: () => void;
  onUploadScreenshot: (file: File) => void;
  onToggleLiveVoice: () => void;
  onToggleMicMute: () => void;
  onToggleSpeakerMute: () => void;
  onToggleAutoCoach: () => void;
  onChangeAutoCoachInterval: (sec: 5 | 8 | 12) => void;
  onRunAutoCoachNow: () => void;
  onToggleOverlay: () => void;
  onSelectSnapshot: (snapshot: SnapshotFrame | null) => void;
  onRemoveSnapshot: (id: string) => void;
}

export function ScreenStage({
  videoRef,
  activeProfile,
  isSharing,
  screenResolution,
  liveState,
  micLevel,
  isMicMuted,
  isSpeakerMuted,
  autoCoachEnabled,
  autoCoachIntervalSec,
  autoCoachBusy,
  latestAdvice,
  overlayOpen,
  snapshots,
  activeSnapshot,
  onStartShare,
  onStopShare,
  onCaptureSnapshot,
  onUploadScreenshot,
  onToggleLiveVoice,
  onToggleMicMute,
  onToggleSpeakerMute,
  onToggleAutoCoach,
  onChangeAutoCoachInterval,
  onRunAutoCoachNow,
  onToggleOverlay,
  onSelectSnapshot,
  onRemoveSnapshot,
}: ScreenStageProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const showingPinnedSnapshot = Boolean(activeSnapshot);
  const hasVisualCanvas = isSharing || showingPinnedSnapshot;

  return (
    <section
      aria-label="Layar Game"
      className="flex flex-col rounded-xl border border-white/10 bg-[#11151E] overflow-hidden"
    >
      {/* Top Stage Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <Monitor className="h-4 w-4 text-[#00A2FF] shrink-0" />
          <h2 className="text-sm font-semibold text-white truncate">
            {showingPinnedSnapshot
              ? `Snapshot Tersimpan · ${activeSnapshot?.capturedAt}`
              : isSharing
                ? `Layar Live · ${activeProfile.name}`
                : `Pratinjau Layar · ${activeProfile.name}`}
          </h2>
          {isSharing && screenResolution && !showingPinnedSnapshot && (
            <span className="hidden sm:inline font-mono text-xs text-slate-400 tabular-nums">
              · {screenResolution.width}×{screenResolution.height}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {showingPinnedSnapshot && isSharing && (
            <button
              type="button"
              onClick={() => onSelectSnapshot(null)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/12 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-white/10 whitespace-nowrap shrink-0"
            >
              <Eye className="h-3.5 w-3.5 text-[#00A2FF]" />
              <span>Kembali ke Live</span>
            </button>
          )}
          {liveState === "connected" && (
            <div className="flex items-center gap-2 text-xs font-medium text-emerald-400">
              <Radio className="h-3.5 w-3.5 shrink-0" />
              <span className="whitespace-nowrap">
                {isMicMuted ? "Live (Mic Mute)" : "Suara Live Aktif"}
              </span>
              {!isMicMuted && (
                <div
                  aria-hidden="true"
                  className="flex items-end gap-0.5 h-3 w-5"
                >
                  {[0.35, 0.7, 1, 0.6].map((scale, idx) => (
                    <span
                      key={idx}
                      className="w-1 rounded-sm bg-emerald-400 transition-transform duration-75"
                      style={{
                        height: `${Math.max(25, Math.round(micLevel * scale * 100))}%`,
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 16:9 Stage Canvas */}
      <div className="relative aspect-video w-full bg-[#07090E]">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`h-full w-full object-contain ${
            isSharing && !showingPinnedSnapshot ? "block" : "hidden"
          }`}
        />

        {showingPinnedSnapshot && activeSnapshot && (
          <img
            src={activeSnapshot.dataUrl}
            alt="Tangkapan layar game terpilih"
            className="h-full w-full object-contain"
            referrerPolicy="no-referrer"
          />
        )}

        {/* Latest Auto-Coach Banner inside stage bottom when sharing */}
        {hasVisualCanvas && latestAdvice && (
          <div className="absolute bottom-3 left-3 right-3 rounded-lg border border-white/15 bg-[#090B10]/95 px-3.5 py-2.5 flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-0.5">
              <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400 tabular-nums">
                <Bot className="h-3.5 w-3.5 text-[#00A2FF]" />
                <span
                  className={
                    latestAdvice.urgency === "alert"
                      ? "text-red-300 font-semibold"
                      : latestAdvice.urgency === "important"
                        ? "text-amber-300 font-semibold"
                        : "text-[#7DD3FC] font-semibold"
                  }
                >
                  Auto-Coach ·{" "}
                  {latestAdvice.urgency === "alert"
                    ? "Peringatan"
                    : latestAdvice.urgency === "important"
                      ? "Penting"
                      : "Info"}
                </span>
                <span aria-hidden="true">·</span>
                <span>{latestAdvice.timestamp}</span>
              </div>
              <p className="text-xs sm:text-sm font-medium text-white leading-snug">
                {latestAdvice.instruction}
              </p>
            </div>
          </div>
        )}

        {!hasVisualCanvas && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 sm:p-8 text-center">
            <div className="mx-auto max-w-lg space-y-5">
              <div className="space-y-2.5">
                <h3 className="text-xl sm:text-2xl font-semibold tracking-tight text-white">
                  Bagikan Layar Game Anda
                </h3>
                <p className="text-sm leading-relaxed text-slate-400">
                  Pilih jendela game PC, emulator mobile, konsol, atau editor
                  untuk dipantau langsung dengan Auto-Coach dan suara Bahasa
                  Indonesia.
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={onStartShare}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#00A2FF] px-5 py-2.5 text-sm font-semibold text-[#06101B] transition-colors hover:bg-[#33B5FF] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00A2FF] whitespace-nowrap shrink-0"
                >
                  <Monitor className="h-4 w-4" />
                  <span>Mulai Share Layar</span>
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-200 transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-[#00A2FF] whitespace-nowrap shrink-0"
                >
                  <ImagePlus className="h-4 w-4 text-slate-300" />
                  <span>Unggah Screenshot</span>
                </button>
              </div>

              <p className="text-xs text-slate-500">
                Tempel screenshot kapan saja dengan{" "}
                <span className="font-mono text-slate-300">Ctrl+V</span>.
              </p>
            </div>
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            onUploadScreenshot(file);
            e.target.value = "";
          }
        }}
      />

      {/* Primary Stage Controls */}
      <div className="space-y-2.5 border-t border-white/8 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {isSharing ? (
              <button
                type="button"
                onClick={onStopShare}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/15 px-3 py-2 text-xs font-semibold text-red-200 transition-colors hover:bg-red-500/25 whitespace-nowrap shrink-0"
              >
                <MonitorOff className="h-4 w-4" />
                <span>Hentikan Share</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onStartShare}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#00A2FF] px-3 py-2 text-xs font-semibold text-[#06101B] transition-colors hover:bg-[#33B5FF] whitespace-nowrap shrink-0"
              >
                <Monitor className="h-4 w-4" />
                <span>Share Layar</span>
              </button>
            )}

            <button
              type="button"
              onClick={onCaptureSnapshot}
              disabled={!isSharing}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/12 bg-white/5 px-3 py-2 text-xs font-medium text-slate-200 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 whitespace-nowrap shrink-0"
            >
              <Camera className="h-4 w-4 text-slate-300" />
              <span>Snapshot</span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/12 bg-white/5 px-3 py-2 text-xs font-medium text-slate-200 transition-colors hover:bg-white/10 whitespace-nowrap shrink-0"
            >
              <ImagePlus className="h-4 w-4 text-slate-300" />
              <span>Unggah</span>
            </button>

            <button
              type="button"
              onClick={onToggleOverlay}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                overlayOpen
                  ? "border-[#00A2FF]/50 bg-[#00A2FF]/20 text-[#7DD3FC]"
                  : "border-white/12 bg-white/5 text-slate-100 hover:bg-white/10"
              }`}
            >
              <Layers className="h-4 w-4 text-[#00A2FF]" />
              <span>{overlayOpen ? "Tutup Overlay" : "Buka Overlay In-Game"}</span>
            </button>
          </div>

          {/* Voice Live + Separate Mic & Speaker Mute Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onToggleLiveVoice}
              disabled={liveState === "connecting"}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                liveState === "connected"
                  ? "border border-emerald-500/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25"
                  : "border border-white/12 bg-white/5 text-slate-100 hover:bg-white/10"
              } disabled:opacity-50`}
            >
              <Radio className="h-4 w-4 text-[#00A2FF]" />
              <span>
                {liveState === "connected"
                  ? "Putus Suara Live"
                  : liveState === "connecting"
                    ? "Menghubungkan..."
                    : "Suara Live (ID)"}
              </span>
            </button>

            <button
              type="button"
              onClick={onToggleMicMute}
              title={isMicMuted ? "Unmute Mikrofon" : "Mute Mikrofon"}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                isMicMuted
                  ? "border-amber-500/40 bg-amber-500/15 text-amber-200"
                  : "border-white/12 bg-white/5 text-slate-200 hover:bg-white/10"
              }`}
            >
              {isMicMuted ? (
                <>
                  <MicOff className="h-4 w-4" />
                  <span>Mic Mute</span>
                </>
              ) : (
                <>
                  <Mic className="h-4 w-4 text-emerald-400" />
                  <span>Mic Aktif</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onToggleSpeakerMute}
              title={isSpeakerMuted ? "Unmute Suara AI" : "Mute Suara AI"}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                isSpeakerMuted
                  ? "border-red-500/40 bg-red-500/15 text-red-200"
                  : "border-white/12 bg-white/5 text-slate-200 hover:bg-white/10"
              }`}
            >
              {isSpeakerMuted ? (
                <>
                  <VolumeX className="h-4 w-4" />
                  <span>AI Mute</span>
                </>
              ) : (
                <>
                  <Volume2 className="h-4 w-4 text-[#00A2FF]" />
                  <span>Suara AI</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Auto-Coach Control Row */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/6 pt-2.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={onToggleAutoCoach}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                autoCoachEnabled
                  ? "border-emerald-500/45 bg-emerald-500/15 text-emerald-200"
                  : "border-white/12 bg-white/5 text-slate-300 hover:bg-white/10"
              }`}
            >
              <Bot className="h-4 w-4" />
              <span>
                Auto-Coach: {autoCoachEnabled ? "Aktif" : "Mati"}
              </span>
            </button>

            <div
              role="group"
              aria-label="Interval Auto-Coach"
              className="flex items-center gap-1 rounded-lg border border-white/10 bg-[#090C12] p-0.5"
            >
              {([5, 8, 12] as const).map((sec) => (
                <button
                  key={sec}
                  type="button"
                  onClick={() => onChangeAutoCoachInterval(sec)}
                  className={`rounded-md px-2.5 py-1 font-mono text-xs tabular-nums transition-colors whitespace-nowrap shrink-0 ${
                    autoCoachIntervalSec === sec
                      ? "bg-[#1D273B] text-white"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {sec}d
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={onRunAutoCoachNow}
              disabled={!isSharing || autoCoachBusy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/12 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-white/10 disabled:opacity-40 whitespace-nowrap shrink-0"
            >
              <Zap className="h-3.5 w-3.5 text-[#00A2FF]" />
              <span>{autoCoachBusy ? "Mengecek..." : "Cek Layar Sekarang"}</span>
            </button>
          </div>

          <span className="text-xs text-slate-400">
            Pantau otomatis tiap {autoCoachIntervalSec} detik
          </span>
        </div>
      </div>

      {/* Snapshot Gallery Strip */}
      {snapshots.length > 0 && (
        <div className="border-t border-white/8 bg-[#0B0E14] px-4 py-3">
          <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
            <span>
              Snapshot tersimpan ({snapshots.length}) — klik untuk jadikan fokus
              pertanyaan
            </span>
            {activeSnapshot && (
              <button
                type="button"
                onClick={() => onSelectSnapshot(null)}
                className="text-[#00A2FF] hover:underline whitespace-nowrap shrink-0"
              >
                Lepas Pilihan
              </button>
            )}
          </div>
          <div className="flex items-center gap-2.5 overflow-x-auto pb-1">
            {snapshots.map((snap, idx) => {
              const isSelected = activeSnapshot?.id === snap.id;
              return (
                <div
                  key={snap.id}
                  className={`group relative shrink-0 overflow-hidden rounded-lg border transition-colors ${
                    isSelected
                      ? "border-[#00A2FF]"
                      : "border-white/10 hover:border-white/25"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() =>
                      onSelectSnapshot(isSelected ? null : snap)
                    }
                    className="block h-16 w-28 bg-black focus-visible:outline-2 focus-visible:outline-[#00A2FF]"
                    title={`Snapshot #${idx + 1} (${snap.capturedAt})`}
                  >
                    <img
                      src={snap.dataUrl}
                      alt={`Snapshot ${idx + 1}`}
                      className="h-full w-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </button>
                  <div className="flex items-center justify-between bg-[#121722] px-2 py-1 text-[11px] font-mono text-slate-400 tabular-nums">
                    <span>#{idx + 1}</span>
                    <button
                      type="button"
                      aria-label={`Hapus snapshot ${idx + 1}`}
                      onClick={() => onRemoveSnapshot(snap.id)}
                      className="text-slate-500 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
