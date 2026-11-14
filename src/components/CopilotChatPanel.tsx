import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Image as ImageIcon,
  Mic,
  Plus,
  RotateCcw,
  Send,
  Square,
  Trash2,
  X,
} from "lucide-react";
import {
  ChatMessage,
  ChatSessionItem,
  GamePlatform,
  GameProfile,
  ModelTier,
  SnapshotFrame,
  VoiceTranscriptItem,
} from "../types/game";
import { LuauMessageRenderer } from "./LuauMessageRenderer";

interface CopilotChatPanelProps {
  activeProfile: GameProfile;
  sessions: ChatSessionItem[];
  activeSessionId: string | null;
  messages: ChatMessage[];
  transcripts: VoiceTranscriptItem[];
  modelTier: ModelTier;
  isGenerating: boolean;
  isSyncingCloud: boolean;
  isSharing: boolean;
  activeSnapshot: SnapshotFrame | null;
  pendingImage: SnapshotFrame | null;
  isTranscribing: boolean;
  isRecordingTranscript: boolean;
  recordingSeconds: number;
  transcribedDraft: string | null;
  onConsumeTranscribedDraft: () => void;
  onChangeModelTier: (tier: ModelTier) => void;
  onSelectSession: (sessionId: string) => void;
  onNewSession: () => void;
  onClearChat: () => void;
  onSendMessage: (text: string) => void;
  onPasteImage: (file: File) => void;
  onClearPendingImage: () => void;
  onClearActiveSnapshot: () => void;
  onToggleTranscriptRecord: () => void;
  onUseTranscriptInChat: (text: string) => void;
  onDeleteTranscript: (item: VoiceTranscriptItem) => void;
}

const MODEL_TIERS: Array<{ id: ModelTier; label: string; hint: string }> = [
  { id: "fast", label: "Kilat", hint: "Respon tercepat untuk instruksi singkat" },
  { id: "standard", label: "Standar", hint: "Seimbang untuk pemandu bermain harian" },
  { id: "tactical", label: "Taktis", hint: "Strategi dan analisis situasi kompleks" },
  { id: "deep", label: "Mendalam", hint: "Penalaran penuh untuk masalah rumit" },
];

function getQuickPromptsForPlatform(platform: GamePlatform): string[] {
  if (platform === "studio") {
    return [
      "Cek error di Output ini dan cara memperbaikinya",
      "Beri saran peningkatan gameplay, UI & performa dari layar ini",
      "Perbaiki script yang terlihat di layar",
      "Buatkan sistem koin & save data yang aman",
    ];
  }
  if (platform === "mobile") {
    return [
      "Rekomendasi build item / skill terbaik dari layar ini",
      "Apa strategi & posisi terbaik di situasi sekarang?",
      "Jelaskan menu atau event di layar ini",
      "Tips cepat menang di stage / match ini",
    ];
  }
  if (platform === "console") {
    return [
      "Bantu langkah berikutnya untuk quest / puzzle ini",
      "Tips mengalahkan boss atau musuh di layar",
      "Jelaskan status HUD, inventory, atau skill di layar",
      "Terjemahkan teks misi / menu di layar",
    ];
  }
  return [
    "Analisis situasi layar sekarang dan langkah terbaik",
    "Saran build, loadout, atau upgrade dari inventory ini",
    "Tips mengalahkan boss / musuh yang sedang dihadapi",
    "Jelaskan menu, quest, atau setting grafis di layar",
  ];
}

function formatDuration(ms: number): string {
  const secs = Math.max(1, Math.round(ms / 1000));
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function CopilotChatPanel({
  activeProfile,
  sessions,
  activeSessionId,
  messages,
  transcripts,
  modelTier,
  isGenerating,
  isSyncingCloud,
  isSharing,
  activeSnapshot,
  pendingImage,
  isTranscribing,
  isRecordingTranscript,
  recordingSeconds,
  transcribedDraft,
  onConsumeTranscribedDraft,
  onChangeModelTier,
  onSelectSession,
  onNewSession,
  onClearChat,
  onSendMessage,
  onPasteImage,
  onClearPendingImage,
  onClearActiveSnapshot,
  onToggleTranscriptRecord,
  onUseTranscriptInChat,
  onDeleteTranscript,
}: CopilotChatPanelProps) {
  const [activeTab, setActiveTab] = useState<"chat" | "transcripts">("chat");
  const [input, setInput] = useState("");
  const scrollEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (activeTab === "chat") {
      scrollEndRef.current?.scrollIntoView({ behavior: "auto" });
    }
  }, [messages, activeTab]);

  useEffect(() => {
    if (transcribedDraft) {
      setInput((prev) =>
        prev.trim() ? `${prev.trim()} ${transcribedDraft}` : transcribedDraft
      );
      onConsumeTranscribedDraft();
    }
  }, [transcribedDraft, onConsumeTranscribedDraft]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = input.trim();
    if (!trimmed && !pendingImage && !activeSnapshot && !isSharing) return;
    if (isGenerating) return;

    onSendMessage(
      trimmed ||
        `Tolong analisis layar ${activeProfile.name} saya ini dan beri saran langkah terbaik.`
    );
    setInput("");
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          onPasteImage(file);
          return;
        }
      }
    }
  };

  return (
    <aside
      aria-label="Panel Asisten Asaw AI"
      className="flex h-[680px] lg:h-full lg:min-h-[640px] lg:max-h-[calc(100vh-148px)] flex-col rounded-xl border border-white/10 bg-[#11151E] overflow-hidden"
    >
      {/* Top Header + Tabs */}
      <div className="border-b border-white/8 px-4 py-3 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-[#090C12] p-0.5">
            <button
              type="button"
              onClick={() => setActiveTab("chat")}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                activeTab === "chat"
                  ? "bg-[#1D273B] text-white"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Chat &amp; Coach
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("transcripts")}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                activeTab === "transcripts"
                  ? "bg-[#1D273B] text-white"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Log Transkrip ({transcripts.length})
            </button>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={onNewSession}
              title="Buat sesi chat baru"
              className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-white/10 whitespace-nowrap shrink-0"
            >
              <Plus className="h-3.5 w-3.5 text-[#00A2FF]" />
              <span>Sesi Baru</span>
            </button>
            <button
              type="button"
              onClick={onClearChat}
              title="Bersihkan tampilan chat ini"
              className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-white/10 whitespace-nowrap shrink-0"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* 4-Tier Gemini Model Selector + Session Selector */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div
            role="group"
            aria-label="Pilih tingkat model Gemini"
            className="flex items-center gap-1 rounded-lg border border-white/10 bg-[#090C12] p-0.5"
          >
            {MODEL_TIERS.map((tier) => {
              const active = modelTier === tier.id;
              return (
                <button
                  key={tier.id}
                  type="button"
                  title={tier.hint}
                  onClick={() => onChangeModelTier(tier.id)}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? "bg-[#00A2FF] text-[#06101B] font-semibold"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {tier.label}
                </button>
              );
            })}
          </div>

          {sessions.length > 0 && (
            <select
              aria-label="Pilih riwayat sesi"
              value={activeSessionId ?? ""}
              onChange={(e) => {
                if (e.target.value) onSelectSession(e.target.value);
              }}
              className="max-w-[160px] truncate rounded-lg border border-white/10 bg-[#090B10] px-2.5 py-1 text-[11px] text-slate-200 focus:border-[#00A2FF] focus:outline-none"
            >
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Body Area: Chat OR Transcript Log */}
      {activeTab === "transcripts" ? (
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {transcripts.length === 0 ? (
            <div className="py-6 space-y-2">
              <h3 className="text-sm font-semibold text-white">
                Belum ada transkrip suara
              </h3>
              <p className="text-xs leading-relaxed text-slate-400">
                Tekan tombol{" "}
                <strong className="text-slate-200">Transkrip</strong> di bawah
                untuk mendiktekan pertanyaan. Teks hasil rekaman otomatis masuk
                ke kolom chat dan tersimpan di sini.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-white/8">
              {transcripts.map((item) => (
                <div key={item.id} className="py-3 first:pt-0 space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 tabular-nums">
                  <span>
                    {item.createdAt} · {formatDuration(item.durationMs)}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        onUseTranscriptInChat(item.transcriptText);
                        setActiveTab("chat");
                      }}
                      className="inline-flex items-center gap-1 text-[#7DD3FC] hover:underline"
                    >
                      <span>Kirim ke Chat</span>
                      <ArrowUpRight className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      aria-label="Hapus transkrip"
                      onClick={() => onDeleteTranscript(item)}
                      className="text-slate-500 hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <p className="text-sm leading-relaxed text-slate-100">
                  {item.transcriptText}
                </p>
              </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {isSyncingCloud && messages.length === 0 ? (
            <div className="space-y-3 py-2" aria-label="Memuat riwayat chat">
              <div className="h-10 w-3/4 rounded-lg bg-white/5" />
              <div className="h-16 w-full rounded-lg bg-white/5" />
              <div className="h-10 w-2/3 rounded-lg bg-white/5" />
            </div>
          ) : messages.length === 0 ? (
            <div className="space-y-5 py-2">
              <div className="border-b border-white/8 pb-4 space-y-1.5">
                <h3 className="text-sm font-semibold text-white">
                  {activeProfile.name}
                </h3>
                <p className="text-xs leading-relaxed text-slate-400">
                  Pilih mode respon di atas, nyalakan Auto-Coach untuk instruksi
                  otomatis, atau ajukan pertanyaan langsung dari layar game
                  Anda.
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-400">
                  Mulai cepat
                </p>
                <div className="divide-y divide-white/8 border-y border-white/8">
                  {getQuickPromptsForPlatform(activeProfile.platform).map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => onSendMessage(prompt)}
                      disabled={isGenerating}
                      className="w-full py-2.5 text-left text-xs font-medium text-slate-200 transition-colors hover:text-[#00A2FF] disabled:opacity-50"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            messages.map((msg) => {
              const isUser = msg.role === "user";
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${
                    isUser ? "items-end" : "items-start"
                  }`}
                >
                  <div className="mb-1 flex items-center gap-1.5 text-[11px] text-slate-400 font-mono tabular-nums">
                    <span>
                      {msg.channel === "voice"
                        ? "Suara Live · "
                        : msg.channel === "autocoach"
                          ? "Auto-Coach · "
                          : msg.channel === "transcribe"
                            ? "Transkrip · "
                            : ""}
                    </span>
                    <span>{isUser ? "Anda" : "Asaw AI"}</span>
                    <span aria-hidden="true">·</span>
                    <span>{msg.timestamp}</span>
                  </div>

                  <div
                    className={`max-w-[92%] rounded-xl px-3.5 py-2.5 ${
                      isUser
                        ? "border border-[#00A2FF]/30 bg-[#0D243B] text-slate-100"
                        : msg.isError
                          ? "border border-red-500/35 bg-red-950/35 text-red-200"
                          : "border border-white/8 bg-[#161D2B] text-slate-100"
                    }`}
                  >
                    {msg.thumbnailUrl && (
                      <div className="mb-2 overflow-hidden rounded-lg border border-white/10 bg-black">
                        <img
                          src={msg.thumbnailUrl}
                          alt="Tangkapan layar yang dikirim"
                          className="max-h-36 w-full object-contain"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    )}

                    {isUser ? (
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">
                        {msg.text}
                      </p>
                    ) : msg.text ? (
                      <LuauMessageRenderer text={msg.text} />
                    ) : (
                      <p className="text-xs text-slate-400">
                        Menyusun jawaban...
                      </p>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={scrollEndRef} />
        </div>
      )}

      {/* Quick Prompts Strip when conversation is active */}
      {activeTab === "chat" && messages.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto border-t border-white/6 px-4 py-2">
          {getQuickPromptsForPlatform(activeProfile.platform)
            .slice(0, 3)
            .map((prompt) => (
              <button
                key={prompt}
                type="button"
                disabled={isGenerating}
                onClick={() => onSendMessage(prompt)}
                className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-slate-300 transition-colors hover:bg-white/10 disabled:opacity-40 whitespace-nowrap shrink-0"
              >
                {prompt}
              </button>
            ))}
        </div>
      )}

      {/* Composer Dock */}
      <form
        onSubmit={handleSubmit}
        className="border-t border-white/8 p-3 space-y-2"
      >
        {(pendingImage || activeSnapshot) && (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-[#161D2B] px-2.5 py-1.5 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <ImageIcon className="h-3.5 w-3.5 text-[#00A2FF] shrink-0" />
              <span className="truncate text-slate-300">
                {pendingImage
                  ? "Gambar ditempel siap dikirim"
                  : `Menggunakan Snapshot (${activeSnapshot?.capturedAt})`}
              </span>
            </div>
            <button
              type="button"
              onClick={
                pendingImage ? onClearPendingImage : onClearActiveSnapshot
              }
              className="text-slate-400 hover:text-white shrink-0"
              aria-label="Hapus lampiran gambar"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={onToggleTranscriptRecord}
            disabled={isTranscribing}
            title="Rekam suara mikrofon lalu transkripsikan ke chat & log"
            className={`inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              isRecordingTranscript
                ? "border-red-500/50 bg-red-500/20 text-red-200"
                : "border-white/12 bg-white/5 text-slate-200 hover:bg-white/10"
            } disabled:opacity-40`}
          >
            {isRecordingTranscript ? (
              <>
                <Square className="h-3.5 w-3.5 fill-current" />
                <span className="font-mono tabular-nums">
                  00:{String(recordingSeconds).padStart(2, "0")}
                </span>
              </>
            ) : isTranscribing ? (
              <span>Mentranskrip...</span>
            ) : (
              <>
                <Mic className="h-4 w-4 text-[#00A2FF]" />
                <span className="hidden sm:inline">Transkrip</span>
              </>
            )}
          </button>

          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPaste={handlePaste}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            rows={2}
            placeholder={
              isSharing
                ? `Tanya strategi ${activeProfile.name}, build, quest, atau tempel gambar...`
                : "Ketik pertanyaan game, rekam transkrip suara, atau tempel screenshot (Ctrl+V)..."
            }
            className="flex-1 resize-none rounded-lg border border-white/12 bg-[#090C12] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-[#00A2FF] focus:outline-none"
          />

          <button
            type="submit"
            disabled={
              isGenerating ||
              (!input.trim() && !pendingImage && !activeSnapshot && !isSharing)
            }
            aria-label="Kirim pertanyaan"
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-[#00A2FF] px-4 text-xs font-semibold text-[#06101B] transition-colors hover:bg-[#33B5FF] disabled:cursor-not-allowed disabled:opacity-40 whitespace-nowrap shrink-0"
          >
            <Send className="h-4 w-4" />
            <span>{isGenerating ? "Mengirim..." : "Kirim"}</span>
          </button>
        </div>
      </form>
    </aside>
  );
}
