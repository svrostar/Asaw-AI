import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from "firebase/auth";
import {
  AlertCircle,
  Gamepad2,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { CopilotChatPanel } from "./components/CopilotChatPanel";
import { InGameOverlayHud } from "./components/InGameOverlayHud";
import { OfflineIndicator } from "./components/OfflineIndicator";
import { PWAInstallButton } from "./components/PWAInstallButton";
import { ScreenStage } from "./components/ScreenStage";
import { usePWAInstall } from "./hooks/usePWAInstall";
import { auth, googleAuthProvider } from "./lib/firebase";
import {
  addFirestoreChatMessage,
  createFirestoreChatSession,
  createFirestoreGameProfile,
  createFirestoreVoiceTranscript,
  deleteFirestoreGameProfile,
  deleteFirestoreVoiceTranscript,
  ensureFirebaseUserRecord,
  subscribeChatSessions,
  subscribeGameProfiles,
  subscribeSessionMessages,
  subscribeVoiceTranscripts,
} from "./lib/firestoreStore";

const GameProfileModal = lazy(() =>
  import("./components/GameProfileModal").then((m) => ({
    default: m.GameProfileModal,
  }))
);

const RobloxPackageBuilder = lazy(() =>
  import("./components/RobloxPackageBuilder").then((m) => ({
    default: m.RobloxPackageBuilder,
  }))
);
import {
  AutoCoachAdvice,
  ChatMessage,
  ChatSessionItem,
  GamePlatform,
  GameProfile,
  LiveConnectionState,
  ModelTier,
  SnapshotFrame,
  VoiceTranscriptItem,
} from "./types/game";
import {
  computeRmsLevel,
  decodeBase64Pcm24k,
  downsampleTo16k,
  float32ToInt16Base64,
} from "./utils/audioPcm";
import {
  drawCanvasPipOverlay,
  PipOverlayReply,
  renderDocumentPipContent,
} from "./utils/pipOverlay";

function prepareTextForSpeech(rawText: string): string {
  const withoutCode = rawText
    .replace(/```[\s\S]*?```/g, " Lihat kode lengkap di panel chat. ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^#+\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();

  if (withoutCode.length <= 420) return withoutCode;
  const sliced = withoutCode.slice(0, 420);
  const lastStop = Math.max(
    sliced.lastIndexOf("."),
    sliced.lastIndexOf("!"),
    sliced.lastIndexOf("?")
  );
  return lastStop > 180 ? sliced.slice(0, lastStop + 1) : `${sliced}...`;
}

function formatNow(): string {
  return new Date().toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const DEFAULT_LOCAL_PROFILES: GameProfile[] = [
  {
    id: "local-pc",
    name: "Game PC / Konsol Umum",
    platform: "pc",
    genre: "Action / RPG",
    notes: "Bantu strategi bertarung, build item, quest, dan navigasi menu.",
  },
  {
    id: "local-mobile",
    name: "Game Mobile (MOBA / RPG)",
    platform: "mobile",
    genre: "MOBA / Strategy",
    notes: "Bantu build item, rotasi objektif, dan posisi tim.",
  },
  {
    id: "local-console",
    name: "Game Konsol (Remote Play)",
    platform: "console",
    genre: "Adventure / Boss Fight",
    notes: "Bantu baca mekanik boss, puzzle, dan langkah misi.",
  },
  {
    id: "local-studio",
    name: "Game Dev / Roblox Studio",
    platform: "studio",
    genre: "Scripting & Design",
    notes: "Bantu debugging error, kode Luau/C#, UI, dan optimasi game.",
  },
];

async function fileToSnapshotFrame(
  file: File,
  source: "upload" | "paste"
): Promise<SnapshotFrame> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Gagal membaca file gambar."));
    reader.readAsDataURL(file);
  });

  const dims = await new Promise<{ width: number; height: number }>(
    (resolve) => {
      const img = new Image();
      img.onload = () =>
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => resolve({ width: 0, height: 0 });
      img.src = dataUrl;
    }
  );

  const [header, base64] = dataUrl.split(",");
  const mimeMatch = header.match(/data:(.*?);base64/);
  const mimeType = mimeMatch?.[1] || file.type || "image/png";

  return {
    id: makeId(),
    dataUrl,
    base64: base64 || "",
    mimeType,
    width: dims.width,
    height: dims.height,
    capturedAt: formatNow(),
    source,
  };
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = String(reader.result || "");
      resolve(res.split(",")[1] || "");
    };
    reader.onerror = () => reject(new Error("Gagal membaca audio."));
    reader.readAsDataURL(blob);
  });
}

export default function App() {
  const { isInstalled } = usePWAInstall();

  // Auth & Firestore-backed Workspace State
  const [user, setUser] = useState<User | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [isSyncingCloud, setIsSyncingCloud] = useState(false);

  const [profiles, setProfiles] = useState<GameProfile[]>(
    DEFAULT_LOCAL_PROFILES
  );
  const [activeProfileId, setActiveProfileId] = useState<string>("local-pc");
  const [profileModalOpen, setProfileModalOpen] = useState(false);

  const [sessions, setSessions] = useState<ChatSessionItem[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [transcripts, setTranscripts] = useState<VoiceTranscriptItem[]>([]);

  // Model & UI Controls
  const [modelTier, setModelTier] = useState<ModelTier>("fast");
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [showRobloxBuilder, setShowRobloxBuilder] = useState(false);

  // Screen Sharing & Snapshots
  const [isSharing, setIsSharing] = useState(false);
  const [screenResolution, setScreenResolution] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [snapshots, setSnapshots] = useState<SnapshotFrame[]>([]);
  const [activeSnapshot, setActiveSnapshot] = useState<SnapshotFrame | null>(
    null
  );
  const [pendingImage, setPendingImage] = useState<SnapshotFrame | null>(null);

  // Live Voice + Mute Controls
  const [liveState, setLiveState] = useState<LiveConnectionState>("idle");
  const [micLevel, setMicLevel] = useState(0);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);

  // Proactive Auto-Coach + Floating Overlay
  const [autoCoachEnabled, setAutoCoachEnabled] = useState(false);
  const [autoCoachIntervalSec, setAutoCoachIntervalSec] = useState<5 | 8 | 12>(
    8
  );
  const [autoCoachBusy, setAutoCoachBusy] = useState(false);
  const [latestAdvice, setLatestAdvice] = useState<AutoCoachAdvice | null>(
    null
  );
  const [overlayHudOpen, setOverlayHudOpen] = useState(false);
  const [pipWindowOpen, setPipWindowOpen] = useState(false);
  const [overlayCompactMode, setOverlayCompactMode] = useState(false);

  // Microphone Transcription (gemini-3.5-transcribe)
  const [isRecordingTranscript, setIsRecordingTranscript] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [transcribedDraft, setTranscribedDraft] = useState<string | null>(null);

  const activeProfile = useMemo(
    () => profiles.find((p) => p.id === activeProfileId) ?? profiles[0],
    [profiles, activeProfileId]
  );

  // Refs for real-time callbacks (avoid stale closures)
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const diffCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const prevDiffPixelsRef = useRef<Uint8ClampedArray | null>(null);
  const displayStreamRef = useRef<MediaStream | null>(null);
  const isSharingRef = useRef(false);

  const isMicMutedRef = useRef(false);
  const isSpeakerMutedRef = useRef(false);
  const latestAdviceRef = useRef<AutoCoachAdvice | null>(null);
  const autoCoachBusyRef = useRef(false);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
  const ttsAbortRef = useRef<AbortController | null>(null);
  const pendingSpeechTextRef = useRef<string>("");

  const pipWindowRef = useRef<Window | null>(null);
  const pipCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const pipVideoRef = useRef<HTMLVideoElement | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const videoIntervalRef = useRef<number | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordStartMsRef = useRef<number>(0);
  const recordTimerRef = useRef<number | null>(null);

  const activeUserVoiceIdRef = useRef<string | null>(null);
  const activeModelVoiceIdRef = useRef<string | null>(null);

  useEffect(() => {
    isMicMutedRef.current = isMicMuted;
    if (isMicMuted) setMicLevel(0);
  }, [isMicMuted]);

  // Firebase Auth listener -> Real-time Cloud Firestore Sync
  useEffect(() => {
    let unsubProfiles: (() => void) | null = null;
    let unsubSessions: (() => void) | null = null;
    let unsubTranscripts: (() => void) | null = null;
    let cancelled = false;

    const cleanupSubs = () => {
      unsubProfiles?.();
      unsubSessions?.();
      unsubTranscripts?.();
      unsubProfiles = null;
      unsubSessions = null;
      unsubTranscripts = null;
    };

    const unsubAuth = onAuthStateChanged(auth, async (fbUser) => {
      cleanupSubs();
      setUser(fbUser);

      if (!fbUser) {
        setIsSyncingCloud(false);
        setProfiles(DEFAULT_LOCAL_PROFILES);
        setActiveProfileId("local-pc");
        setSessions([]);
        setActiveSessionId(null);
        setTranscripts([]);
        return;
      }

      setIsSyncingCloud(true);
      try {
        await ensureFirebaseUserRecord(fbUser);
        if (cancelled) return;

        const handleCloudError = () => {
          setErrorBanner(
            "Sinkronisasi Firestore mengalami kendala izin atau kuota. Data sesi lokal tetap dapat digunakan."
          );
          setIsSyncingCloud(false);
        };

        unsubProfiles = subscribeGameProfiles(
          fbUser.uid,
          (cloudProfiles) => {
            if (cloudProfiles.length > 0) {
              setProfiles(cloudProfiles);
              setActiveProfileId((curr) =>
                cloudProfiles.some((p) => p.id === curr)
                  ? curr
                  : cloudProfiles[0].id
              );
            }
            setIsSyncingCloud(false);
          },
          handleCloudError
        );

        unsubSessions = subscribeChatSessions(
          fbUser.uid,
          (cloudSessions) => {
            setSessions(cloudSessions);
            setActiveSessionId((curr) => {
              if (curr && cloudSessions.some((s) => s.id === curr)) return curr;
              return cloudSessions[0]?.id ?? null;
            });
          },
          handleCloudError
        );

        unsubTranscripts = subscribeVoiceTranscripts(
          fbUser.uid,
          (cloudTranscripts) => {
            setTranscripts(cloudTranscripts);
          },
          handleCloudError
        );
      } catch {
        setIsSyncingCloud(false);
        setErrorBanner("Gagal menyiapkan penyimpanan akun Firebase Anda.");
      }
    });

    return () => {
      cancelled = true;
      cleanupSubs();
      unsubAuth();
    };
  }, []);

  // Subscribe to messages of the currently selected Firestore session
  useEffect(() => {
    if (!user || !activeSessionId) return;

    const unsub = subscribeSessionMessages(
      user.uid,
      activeSessionId,
      (cloudMessages) => {
        setMessages((prev) => {
          const streaming = prev.filter((m) => m.isStreaming);
          if (streaming.length === 0) return cloudMessages;
          return [...cloudMessages, ...streaming];
        });
      },
      () => {
        setErrorBanner("Gagal memuat pesan dari sesi Firestore.");
      }
    );

    return () => unsub();
  }, [user, activeSessionId]);

  const handleSignIn = async () => {
    setErrorBanner(null);
    setAuthBusy(true);
    try {
      await signInWithPopup(auth, googleAuthProvider);
    } catch {
      setErrorBanner(
        "Login Google dibatalkan atau pop-up diblokir browser. Anda tetap bisa memakai aplikasi dalam mode tamu."
      );
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    setMessages([]);
    setTranscripts([]);
    setSnapshots([]);
  };

  const ensureActiveSessionId = useCallback(
    async (firstPrompt: string): Promise<string | null> => {
      const currentUser = auth.currentUser;
      if (!currentUser) return null;
      if (activeSessionId) return activeSessionId;

      try {
        const title = `${activeProfile.name}: ${firstPrompt.slice(0, 32)}`;
        const created = await createFirestoreChatSession(currentUser.uid, {
          title,
          profileId: activeProfile.id.startsWith("local-")
            ? ""
            : activeProfile.id,
        });
        setActiveSessionId(created.id);
        return created.id;
      } catch {
        return null;
      }
    },
    [activeSessionId, activeProfile]
  );

  const persistMessage = useCallback(
    async (
      sessionId: string | null,
      msg: {
        role: "user" | "assistant";
        text: string;
        modelUsed?: string;
        channel: "text" | "voice" | "transcribe" | "autocoach";
      }
    ) => {
      const currentUser = auth.currentUser;
      if (!currentUser || !sessionId || !msg.text.trim()) return;
      try {
        await addFirestoreChatMessage(currentUser.uid, sessionId, msg);
      } catch {
        // Non-blocking persistence fallback so chat stays fluid
      }
    },
    []
  );

  // Frame capture + Pixel-Diff helper
  const captureVideoFrame = useCallback(
    (quality = 0.78, maxWidth = 1024): SnapshotFrame | null => {
      const video = videoRef.current;
      if (!video || !isSharingRef.current || video.videoWidth === 0) {
        return null;
      }

      if (!canvasRef.current) {
        canvasRef.current = document.createElement("canvas");
      }
      const canvas = canvasRef.current;
      const scale =
        video.videoWidth > maxWidth ? maxWidth / video.videoWidth : 1;
      const width = Math.round(video.videoWidth * scale);
      const height = Math.round(video.videoHeight * scale);

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;

      ctx.drawImage(video, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      const base64 = dataUrl.split(",")[1] || "";

      return {
        id: makeId(),
        dataUrl,
        base64,
        mimeType: "image/jpeg",
        width,
        height,
        capturedAt: formatNow(),
        source: "screen",
      };
    },
    []
  );

  const computeFrameDiff = useCallback((): number => {
    const video = videoRef.current;
    if (!video || !isSharingRef.current || video.videoWidth === 0) return 0;

    if (!diffCanvasRef.current) {
      diffCanvasRef.current = document.createElement("canvas");
    }
    const c = diffCanvasRef.current;
    c.width = 64;
    c.height = 36;
    const ctx = c.getContext("2d");
    if (!ctx) return 1;

    ctx.drawImage(video, 0, 0, 64, 36);
    const data = ctx.getImageData(0, 0, 64, 36).data;

    const prev = prevDiffPixelsRef.current;
    if (!prev || prev.length !== data.length) {
      prevDiffPixelsRef.current = new Uint8ClampedArray(data);
      return 1;
    }

    let diffSum = 0;
    for (let i = 0; i < data.length; i += 4) {
      diffSum +=
        Math.abs(data[i] - prev[i]) +
        Math.abs(data[i + 1] - prev[i + 1]) +
        Math.abs(data[i + 2] - prev[i + 2]);
    }

    prevDiffPixelsRef.current = new Uint8ClampedArray(data);
    return diffSum / ((data.length / 4) * 3 * 255);
  }, []);

  // Speak Indonesian TTS for Auto-Coach & AI Answers with live Mute/Unmute support
  const speakIndonesianCoach = useCallback(async (text: string) => {
    const cleaned = text.trim();
    if (!cleaned) return;

    ttsAbortRef.current?.abort();
    if (ttsAudioRef.current) {
      ttsAudioRef.current.pause();
      ttsAudioRef.current = null;
    }

    if (isSpeakerMutedRef.current) {
      pendingSpeechTextRef.current = cleaned;
      setIsAiSpeaking(false);
      return;
    }

    pendingSpeechTextRef.current = "";
    const controller = new AbortController();
    ttsAbortRef.current = controller;

    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ text: cleaned }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        audioBase64?: string;
        mimeType?: string;
      };
      if (!data.audioBase64 || controller.signal.aborted) return;

      const audio = new Audio(
        `data:${data.mimeType || "audio/wav"};base64,${data.audioBase64}`
      );
      audio.muted = isSpeakerMutedRef.current;
      audio.onplay = () => {
        if (ttsAudioRef.current === audio && !isSpeakerMutedRef.current) {
          setIsAiSpeaking(true);
        }
      };
      audio.onpause = () => {
        if (ttsAudioRef.current === audio) {
          setIsAiSpeaking(false);
        }
      };
      audio.onended = () => {
        if (ttsAudioRef.current === audio) {
          ttsAudioRef.current = null;
          setIsAiSpeaking(false);
        }
      };
      ttsAudioRef.current = audio;

      if (!isSpeakerMutedRef.current) {
        await audio.play().catch(() => {
          setIsAiSpeaking(false);
        });
      }
    } catch {
      setIsAiSpeaking(false);
    }
  }, []);

  useEffect(() => {
    isSpeakerMutedRef.current = isSpeakerMuted;
    if (isSpeakerMuted) {
      for (const src of activeSourcesRef.current) {
        try {
          src.stop();
        } catch {
          // Ignore
        }
      }
      activeSourcesRef.current.clear();
      nextStartTimeRef.current = 0;
      if (ttsAudioRef.current) {
        ttsAudioRef.current.muted = true;
        ttsAudioRef.current.pause();
      }
      setIsAiSpeaking(false);
    } else {
      if (pendingSpeechTextRef.current) {
        const queued = pendingSpeechTextRef.current;
        pendingSpeechTextRef.current = "";
        void speakIndonesianCoach(queued);
      } else if (ttsAudioRef.current && !ttsAudioRef.current.ended) {
        ttsAudioRef.current.muted = false;
        void ttsAudioRef.current.play().catch(() => {
          setIsAiSpeaking(false);
        });
      }
    }
  }, [isSpeakerMuted, speakIndonesianCoach]);

  const runAutoCoachCheck = useCallback(
    async (force = false) => {
      if (!isSharingRef.current || autoCoachBusyRef.current) return;

      const diff = computeFrameDiff();
      if (!force && diff < 0.012) {
        return; // Screen barely changed, save latency & quota
      }

      const frame = captureVideoFrame(0.6, 720);
      if (!frame?.base64) return;

      autoCoachBusyRef.current = true;
      setAutoCoachBusy(true);

      try {
        const res = await fetch("/api/auto-coach", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageBase64: frame.base64,
            imageMimeType: frame.mimeType,
            gameProfile: activeProfile,
            lastAdvice: latestAdviceRef.current?.instruction || "",
          }),
        });

        if (!res.ok) return;
        const data = (await res.json()) as {
          shouldSpeak?: boolean;
          urgency?: "info" | "important" | "alert";
          instruction?: string;
        };

        if (data.shouldSpeak && data.instruction) {
          const advice: AutoCoachAdvice = {
            instruction: data.instruction,
            urgency: data.urgency ?? "info",
            timestamp: formatNow(),
          };
          latestAdviceRef.current = advice;
          setLatestAdvice(advice);

          setMessages((prev) => [
            ...prev,
            {
              id: makeId(),
              role: "assistant",
              text: advice.instruction,
              timestamp: advice.timestamp,
              channel: "autocoach",
              modelUsed: "gemini-3.1-flash-lite",
            },
          ]);

          if (!isSpeakerMutedRef.current) {
            void speakIndonesianCoach(advice.instruction);
          }
        }
      } catch {
        // Silent auto-coach skip on transient hiccup
      } finally {
        autoCoachBusyRef.current = false;
        setAutoCoachBusy(false);
      }
    },
    [activeProfile, captureVideoFrame, computeFrameDiff, speakIndonesianCoach]
  );

  // Auto-Coach Interval Timer
  useEffect(() => {
    if (!autoCoachEnabled || !isSharing) return;
    const id = window.setInterval(() => {
      void runAutoCoachCheck(false);
    }, autoCoachIntervalSec * 1000);
    return () => window.clearInterval(id);
  }, [autoCoachEnabled, autoCoachIntervalSec, isSharing, runAutoCoachCheck]);

  // Live Voice Stop & Start (gemini-3.8-live Indonesian)
  const stopLiveVoice = useCallback(() => {
    if (videoIntervalRef.current !== null) {
      window.clearInterval(videoIntervalRef.current);
      videoIntervalRef.current = null;
    }

    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current.onaudioprocess = null;
      processorRef.current = null;
    }

    if (micStreamRef.current) {
      for (const track of micStreamRef.current.getTracks()) {
        track.stop();
      }
      micStreamRef.current = null;
    }

    if (inputAudioCtxRef.current) {
      inputAudioCtxRef.current.close().catch(() => {});
      inputAudioCtxRef.current = null;
    }

    for (const source of activeSourcesRef.current) {
      try {
        source.stop();
      } catch {
        // Ignore
      }
    }
    activeSourcesRef.current.clear();
    nextStartTimeRef.current = 0;

    if (outputAudioCtxRef.current) {
      outputAudioCtxRef.current.close().catch(() => {});
      outputAudioCtxRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    activeUserVoiceIdRef.current = null;
    activeModelVoiceIdRef.current = null;
    setMicLevel(0);
    setLiveState("idle");
  }, []);

  const stopScreenShare = useCallback(() => {
    if (displayStreamRef.current) {
      for (const track of displayStreamRef.current.getTracks()) {
        track.stop();
      }
      displayStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    isSharingRef.current = false;
    prevDiffPixelsRef.current = null;
    setIsSharing(false);
    setScreenResolution(null);
  }, []);

  useEffect(() => {
    return () => {
      stopLiveVoice();
      stopScreenShare();
      if (pipWindowRef.current && !pipWindowRef.current.closed) {
        pipWindowRef.current.close();
      }
    };
  }, [stopLiveVoice, stopScreenShare]);

  const startScreenShare = async () => {
    setErrorBanner(null);

    if (!navigator.mediaDevices?.getDisplayMedia) {
      setErrorBanner(
        "Browser ini tidak mendukung Share Layar langsung. Gunakan Unggah Screenshot atau tempel gambar (Ctrl+V)."
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 5, max: 15 } },
        audio: false,
      });

      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack) throw new Error("Tidak ada stream video.");

      stopScreenShare();
      displayStreamRef.current = stream;
      isSharingRef.current = true;
      setIsSharing(true);
      setActiveSnapshot(null);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          if (videoRef.current) {
            setScreenResolution({
              width: videoRef.current.videoWidth,
              height: videoRef.current.videoHeight,
            });
          }
        };
      }

      videoTrack.onended = () => {
        stopScreenShare();
      };
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotAllowedError" || name === "AbortError") {
        setErrorBanner(
          "Share layar dibatalkan atau izin belum diberikan. Gunakan tombol Unggah atau tempel gambar (Ctrl+V)."
        );
      } else {
        setErrorBanner("Gagal memulai share layar.");
      }
    }
  };

  const handleCaptureSnapshot = async () => {
    const frame = captureVideoFrame(0.82, 1280);
    if (!frame) {
      setErrorBanner("Share layar belum aktif atau frame belum siap.");
      return;
    }
    setSnapshots((prev) => [frame, ...prev].slice(0, 10));
    setActiveSnapshot(frame);
  };

  const handleUploadScreenshot = async (file: File) => {
    setErrorBanner(null);
    try {
      const frame = await fileToSnapshotFrame(file, "upload");
      setSnapshots((prev) => [frame, ...prev].slice(0, 10));
      setActiveSnapshot(frame);
    } catch {
      setErrorBanner("Gagal memproses gambar yang diunggah.");
    }
  };

  const handlePasteImage = async (file: File) => {
    setErrorBanner(null);
    try {
      const frame = await fileToSnapshotFrame(file, "paste");
      setPendingImage(frame);
    } catch {
      setErrorBanner("Gagal membaca gambar dari clipboard.");
    }
  };

  const handleRemoveSnapshot = async (id: string) => {
    setSnapshots((prev) => prev.filter((s) => s.id !== id));
    if (activeSnapshot?.id === id) setActiveSnapshot(null);
  };

  const appendVoiceTranscript = useCallback(
    (speaker: "user" | "assistant", chunkText: string) => {
      if (!chunkText) return;
      const ref =
        speaker === "user" ? activeUserVoiceIdRef : activeModelVoiceIdRef;

      setMessages((prev) => {
        if (ref.current) {
          const existingIdx = prev.findIndex((m) => m.id === ref.current);
          if (existingIdx !== -1) {
            const updated = [...prev];
            updated[existingIdx] = {
              ...updated[existingIdx],
              text: updated[existingIdx].text + chunkText,
            };
            return updated;
          }
        }

        const newId = makeId();
        ref.current = newId;
        return [
          ...prev,
          {
            id: newId,
            role: speaker,
            text: chunkText,
            timestamp: formatNow(),
            channel: "voice",
            modelUsed: "gemini-3.8-live",
          },
        ];
      });
    },
    []
  );

  const startLiveVoice = async () => {
    setErrorBanner(null);
    setLiveState("connecting");

    try {
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      micStreamRef.current = micStream;

      const inputCtx = new AudioContext();
      const outputCtx = new AudioContext({ sampleRate: 24000 });
      inputAudioCtxRef.current = inputCtx;
      outputAudioCtxRef.current = outputCtx;

      if (inputCtx.state === "suspended") await inputCtx.resume();
      if (outputCtx.state === "suspended") await outputCtx.resume();

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const params = new URLSearchParams({
        game: activeProfile.name,
        platform: activeProfile.platform,
        genre: activeProfile.genre,
        notes: activeProfile.notes,
      });

      const ws = new WebSocket(
        `${protocol}//${window.location.host}/ws/live?${params.toString()}`
      );
      wsRef.current = ws;

      const startAudioAndVideoStreaming = () => {
        if (ws.readyState !== WebSocket.OPEN || processorRef.current) return;

        const source = inputCtx.createMediaStreamSource(micStream);
        const processor = inputCtx.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        processor.onaudioprocess = (e) => {
          if (ws.readyState !== WebSocket.OPEN) return;
          if (isMicMutedRef.current) {
            setMicLevel(0);
            return;
          }
          const nativeSamples = e.inputBuffer.getChannelData(0);
          setMicLevel(computeRmsLevel(nativeSamples));
          const pcm16k = downsampleTo16k(nativeSamples, inputCtx.sampleRate);
          const base64Audio = float32ToInt16Base64(pcm16k);
          ws.send(JSON.stringify({ type: "audio", data: base64Audio }));
        };

        source.connect(processor);
        processor.connect(inputCtx.destination);

        if (!isSharingRef.current && activeSnapshot?.base64) {
          ws.send(
            JSON.stringify({ type: "video", data: activeSnapshot.base64 })
          );
        }

        videoIntervalRef.current = window.setInterval(() => {
          if (ws.readyState !== WebSocket.OPEN) return;
          if (!isSharingRef.current) return;
          const frame = captureVideoFrame(0.65, 1024);
          if (frame?.base64) {
            ws.send(JSON.stringify({ type: "video", data: frame.base64 }));
          }
        }, 1000);
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data) as {
          type?: string;
          data?: string;
          text?: string;
          message?: string;
        };

        if (msg.type === "ready") {
          setLiveState("connected");
          startAudioAndVideoStreaming();
          return;
        }

        if (
          msg.type === "audio" &&
          msg.data &&
          outputAudioCtxRef.current &&
          !isSpeakerMutedRef.current
        ) {
          const ctx = outputAudioCtxRef.current;
          const audioBuffer = decodeBase64Pcm24k(ctx, msg.data);
          const sourceNode = ctx.createBufferSource();
          sourceNode.buffer = audioBuffer;
          sourceNode.connect(ctx.destination);

          const startAt = Math.max(ctx.currentTime, nextStartTimeRef.current);
          sourceNode.start(startAt);
          nextStartTimeRef.current = startAt + audioBuffer.duration;

          activeSourcesRef.current.add(sourceNode);
          sourceNode.onended = () => {
            activeSourcesRef.current.delete(sourceNode);
          };
        } else if (msg.type === "interrupted") {
          for (const src of activeSourcesRef.current) {
            try {
              src.stop();
            } catch {
              // Ignore
            }
          }
          activeSourcesRef.current.clear();
          nextStartTimeRef.current = 0;
          activeModelVoiceIdRef.current = null;
        } else if (msg.type === "inputTranscript" && msg.text) {
          activeModelVoiceIdRef.current = null;
          appendVoiceTranscript("user", msg.text);
        } else if (msg.type === "outputTranscript" && msg.text) {
          activeUserVoiceIdRef.current = null;
          appendVoiceTranscript("assistant", msg.text);
        } else if (msg.type === "turnComplete") {
          activeUserVoiceIdRef.current = null;
          activeModelVoiceIdRef.current = null;
        } else if (msg.type === "error" && msg.message) {
          setErrorBanner(msg.message);
          stopLiveVoice();
        } else if (msg.type === "closed") {
          stopLiveVoice();
        }
      };

      ws.onerror = () => {
        setErrorBanner("Koneksi suara langsung gagal terhubung.");
        stopLiveVoice();
      };

      ws.onclose = () => {
        stopLiveVoice();
      };
    } catch {
      setErrorBanner(
        "Izin mikrofon ditolak atau tidak tersedia. Anda masih bisa memakai chat teks."
      );
      stopLiveVoice();
    }
  };

  const handleToggleLiveVoice = () => {
    if (liveState === "connected" || liveState === "connecting") {
      stopLiveVoice();
    } else {
      startLiveVoice();
    }
  };

  // Microphone Transcription (gemini-3.5-transcribe)
  const handleToggleTranscriptRecord = async () => {
    if (isRecordingTranscript) {
      mediaRecorderRef.current?.stop();
      if (recordTimerRef.current !== null) {
        window.clearInterval(recordTimerRef.current);
        recordTimerRef.current = null;
      }
      setIsRecordingTranscript(false);
      return;
    }

    setErrorBanner(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "audio/mp4";

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      recordedChunksRef.current = [];
      recordStartMsRef.current = Date.now();
      setRecordingSeconds(0);
      setIsRecordingTranscript(true);

      recordTimerRef.current = window.setInterval(() => {
        setRecordingSeconds((s) => s + 1);
      }, 1000);

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        for (const t of stream.getTracks()) t.stop();
        const durationMs = Math.max(500, Date.now() - recordStartMsRef.current);
        const blob = new Blob(recordedChunksRef.current, { type: mimeType });
        if (blob.size === 0) return;

        setIsTranscribing(true);
        try {
          const audioBase64 = await blobToBase64(blob);
          const cleanMime = mimeType.split(";")[0] || "audio/webm";
          const res = await fetch("/api/transcribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ audioBase64, mimeType: cleanMime }),
          });
          const data = (await res.json()) as {
            transcript?: string;
            error?: string;
          };
          if (!res.ok) {
            throw new Error(data.error || "Gagal mentranskripsi suara.");
          }

          const text = (data.transcript || "").trim();
          if (text) {
            setTranscribedDraft(text);
            if (auth.currentUser) {
              try {
                await createFirestoreVoiceTranscript(auth.currentUser.uid, {
                  profileId: activeProfile.id.startsWith("local-")
                    ? ""
                    : activeProfile.id,
                  transcriptText: text,
                  durationMs,
                });
              } catch {
                const fallbackItem: VoiceTranscriptItem = {
                  id: makeId(),
                  transcriptText: text,
                  durationMs,
                  createdAt: formatNow(),
                };
                setTranscripts((prev) => [fallbackItem, ...prev]);
              }
            } else {
              const newItem: VoiceTranscriptItem = {
                id: makeId(),
                transcriptText: text,
                durationMs,
                createdAt: formatNow(),
              };
              setTranscripts((prev) => [newItem, ...prev]);
            }
          }
        } catch (err) {
          setErrorBanner(
            err instanceof Error
              ? err.message
              : "Gagal memproses transkripsi audio."
          );
        } finally {
          setIsTranscribing(false);
        }
      };

      recorder.start();
    } catch {
      setErrorBanner("Izin mikrofon diperlukan untuk merekam transkrip.");
      setIsRecordingTranscript(false);
    }
  };

  const handleDeleteTranscript = async (item: VoiceTranscriptItem) => {
    setTranscripts((prev) => prev.filter((t) => t.id !== item.id));
    if (auth.currentUser && !item.id.includes("-")) {
      try {
        await deleteFirestoreVoiceTranscript(auth.currentUser.uid, item.id);
      } catch {
        // Ignore
      }
    }
  };

  // Multi-model Chat Send
  const handleSendMessage = async (promptText: string) => {
    if (isGenerating) return;
    setErrorBanner(null);

    let frameToSend: SnapshotFrame | null = null;
    if (pendingImage) {
      frameToSend = pendingImage;
      setPendingImage(null);
    } else if (activeSnapshot) {
      frameToSend = activeSnapshot;
    } else if (isSharingRef.current) {
      frameToSend =
        modelTier === "fast"
          ? captureVideoFrame(0.68, 896)
          : captureVideoFrame(0.76, 1024);
    }

    const userMessage: ChatMessage = {
      id: makeId(),
      role: "user",
      text: promptText,
      timestamp: formatNow(),
      channel: "text",
      thumbnailUrl: frameToSend?.dataUrl,
    };

    const assistantId = makeId();
    const assistantPlaceholder: ChatMessage = {
      id: assistantId,
      role: "assistant",
      text: "",
      timestamp: formatNow(),
      channel: "text",
      isStreaming: true,
    };

    const historyForApi = [...messages, userMessage].map((m) => ({
      role: m.role,
      text: m.text,
    }));

    setMessages((prev) => [...prev, userMessage, assistantPlaceholder]);
    setIsGenerating(true);

    const sessionId = await ensureActiveSessionId(promptText);
    void persistMessage(sessionId, {
      role: "user",
      text: promptText,
      channel: "text",
    });

    const fetchTimeout = new AbortController();
    const timer = window.setTimeout(() => fetchTimeout.abort(), 45000);

    let accumulatedReply = "";
    let usedModel = "";

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: fetchTimeout.signal,
        body: JSON.stringify({
          messages: historyForApi,
          imageBase64: frameToSend?.base64,
          imageMimeType: frameToSend?.mimeType,
          modelTier,
          gameProfile: activeProfile,
        }),
      });

      if (!response.ok || !response.body) {
        const errData = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(errData.error || "Gagal menghubungi server asisten.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";

        for (const evt of events) {
          const line = evt.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;

          const payload = JSON.parse(line.slice(6)) as {
            text?: string;
            model?: string;
            done?: boolean;
            error?: string;
          };

          if (payload.model) usedModel = payload.model;
          if (payload.error) throw new Error(payload.error);

          if (payload.text) {
            accumulatedReply += payload.text;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      text: m.text + payload.text,
                      modelUsed: usedModel || m.modelUsed,
                    }
                  : m
              )
            );
          }
        }
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, isStreaming: false, modelUsed: usedModel }
            : m
        )
      );

      void persistMessage(sessionId, {
        role: "assistant",
        text: accumulatedReply,
        modelUsed: usedModel,
        channel: "text",
      });

      const spokenSummary = prepareTextForSpeech(accumulatedReply);
      if (spokenSummary) {
        void speakIndonesianCoach(spokenSummary);
      }
    } catch (err) {
      const isAbort = err instanceof DOMException && err.name === "AbortError";
      const message = isAbort
        ? "Koneksi terlalu lama merespons. Coba beralih ke mode Kilat."
        : err instanceof Error
          ? err.message
          : "Terjadi kesalahan saat menganalisis layar.";

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, text: message, isStreaming: false, isError: true }
            : m
        )
      );
    } finally {
      window.clearTimeout(timer);
      setIsGenerating(false);
    }
  };

  const handleSendMessageRef = useRef(handleSendMessage);
  handleSendMessageRef.current = handleSendMessage;

  const latestOverlayReply = useMemo<PipOverlayReply | null>(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role === "assistant" && (m.text || m.isStreaming)) {
        return {
          label:
            m.channel === "autocoach"
              ? "Auto-Coach"
              : m.channel === "voice"
                ? "Suara Live"
                : "Asaw AI",
          text: m.text || "Menyusun jawaban...",
          timestamp: m.timestamp,
        };
      }
    }
    return null;
  }, [messages]);

  const handleToggleOverlayCompactMode = useCallback(() => {
    setOverlayCompactMode((prev) => {
      const next = !prev;
      const win = pipWindowRef.current;
      if (win && !win.closed) {
        try {
          win.resizeTo(next ? 340 : 380, next ? 120 : 320);
        } catch {
          // Ignore browser resize restrictions
        }
      }
      return next;
    });
  }, []);

  // Floating In-Game Overlay (Document PiP -> Canvas Video PiP Fallback -> In-App HUD)
  const syncPipOverlayDom = useCallback(() => {
    const state = {
      gameName: activeProfile.name,
      advice: latestAdvice,
      latestReply: latestOverlayReply,
      isGenerating,
      isAiSpeaking,
      autoCoachEnabled,
      autoCoachBusy,
      isMicMuted,
      isSpeakerMuted,
      isSharing,
      compactMode: overlayCompactMode,
    };

    if (pipWindowRef.current && !pipWindowRef.current.closed) {
      renderDocumentPipContent(pipWindowRef.current, state, {
        onToggleCompactMode: handleToggleOverlayCompactMode,
        onToggleAutoCoach: () => setAutoCoachEnabled((v) => !v),
        onToggleMicMute: () => setIsMicMuted((v) => !v),
        onToggleSpeakerMute: () => setIsSpeakerMuted((v) => !v),
        onRunAutoCoachNow: () => void runAutoCoachCheck(true),
        onSendMessage: (txt) => void handleSendMessageRef.current(txt),
      });
    }

    if (pipCanvasRef.current) {
      drawCanvasPipOverlay(pipCanvasRef.current, state);
    }
  }, [
    activeProfile.name,
    latestAdvice,
    latestOverlayReply,
    isGenerating,
    isAiSpeaking,
    autoCoachEnabled,
    autoCoachBusy,
    isMicMuted,
    isSpeakerMuted,
    isSharing,
    overlayCompactMode,
    handleToggleOverlayCompactMode,
    runAutoCoachCheck,
  ]);

  useEffect(() => {
    syncPipOverlayDom();
  }, [syncPipOverlayDom]);

  const handleToggleOverlay = async () => {
    if (pipWindowRef.current && !pipWindowRef.current.closed) {
      pipWindowRef.current.close();
      pipWindowRef.current = null;
      setPipWindowOpen(false);
      setOverlayHudOpen(false);
      return;
    }

    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture().catch(() => {});
      setPipWindowOpen(false);
      setOverlayHudOpen(false);
      return;
    }

    if (overlayHudOpen) {
      setOverlayHudOpen(false);
      return;
    }

    // Try Document Picture-in-Picture (Always-on-Top OS Floating Window)
    if (window.documentPictureInPicture?.requestWindow) {
      try {
        const pipWin = await window.documentPictureInPicture.requestWindow({
          width: overlayCompactMode ? 340 : 380,
          height: overlayCompactMode ? 120 : 320,
        });
        pipWindowRef.current = pipWin;
        setPipWindowOpen(true);
        pipWin.addEventListener("pagehide", () => {
          pipWindowRef.current = null;
          setPipWindowOpen(false);
        });
        syncPipOverlayDom();
        return;
      } catch {
        // Fall through to Canvas Video PiP / HUD
      }
    }

    // Fallback 1: Canvas Video Picture-in-Picture + In-App HUD
    setOverlayHudOpen(true);
    try {
      if (!pipCanvasRef.current) {
        pipCanvasRef.current = document.createElement("canvas");
      }
      drawCanvasPipOverlay(pipCanvasRef.current, {
        gameName: activeProfile.name,
        advice: latestAdvice,
        latestReply: latestOverlayReply,
        isGenerating,
        isAiSpeaking,
        autoCoachEnabled,
        autoCoachBusy,
        isMicMuted,
        isSpeakerMuted,
        isSharing,
        compactMode: overlayCompactMode,
      });

      if (!pipVideoRef.current) {
        const vid = document.createElement("video");
        vid.muted = true;
        vid.playsInline = true;
        vid.style.position = "fixed";
        vid.style.width = "1px";
        vid.style.height = "1px";
        vid.style.opacity = "0";
        vid.style.pointerEvents = "none";
        document.body.appendChild(vid);
        pipVideoRef.current = vid;
      }

      const stream = pipCanvasRef.current.captureStream(2);
      pipVideoRef.current.srcObject = stream;
      await pipVideoRef.current.play();
      if (pipVideoRef.current.requestPictureInPicture) {
        await pipVideoRef.current.requestPictureInPicture();
        setPipWindowOpen(true);
      }
    } catch {
      // In-App Overlay HUD remains active cleanly
    }
  };

  // Profile Management
  const handleCreateProfile = async (input: {
    name: string;
    platform: GamePlatform;
    genre: string;
    notes: string;
  }) => {
    if (auth.currentUser) {
      const created = await createFirestoreGameProfile(
        auth.currentUser.uid,
        input
      );
      setActiveProfileId(created.id);
      return;
    }

    const localProfile: GameProfile = {
      id: `local-${Date.now()}`,
      ...input,
    };
    setProfiles((prev) => [localProfile, ...prev]);
    setActiveProfileId(localProfile.id);
  };

  const handleDeleteProfile = async (id: string) => {
    setProfiles((prev) => prev.filter((p) => p.id !== id));
    if (activeProfileId === id) {
      const remaining = profiles.filter((p) => p.id !== id);
      if (remaining[0]) setActiveProfileId(remaining[0].id);
    }
    if (!id.startsWith("local-") && auth.currentUser) {
      try {
        await deleteFirestoreGameProfile(auth.currentUser.uid, id);
      } catch {
        // Ignore
      }
    }
  };

  const handleNewSession = () => {
    setActiveSessionId(null);
    setMessages([]);
  };

  return (
    <div className="min-h-screen bg-[#090B10] text-slate-100 flex flex-col">
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="sticky top-0 z-30 border-b border-white/8 bg-[#090B10]/[0.98]">
        <div className="mx-auto flex max-w-[1480px] items-center justify-between gap-8 px-4 sm:px-6 lg:px-8 py-3.5">
          {/* Zone 1: Single-line Wordmark */}
          <a
            href="#workbench"
            className="text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0"
          >
            Asaw AI
          </a>

          {/* Zone 2: Clean single-line navigation links */}
          <nav
            aria-label="Navigasi utama"
            className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-400"
          >
            <a
              href="#workbench"
              className="hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Ruang Kerja
            </a>
            <button
              type="button"
              onClick={() => setProfileModalOpen(true)}
              className="hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Profil Game
            </button>
            <button
              type="button"
              onClick={() => setShowRobloxBuilder(true)}
              className="hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Alat Roblox
            </button>
            {user ? (
              <button
                type="button"
                onClick={handleSignOut}
                className="hover:text-white transition-colors whitespace-nowrap shrink-0"
              >
                Keluar ({user.email?.split("@")[0]})
              </button>
            ) : (
              <button
                type="button"
                disabled={authBusy}
                onClick={handleSignIn}
                className="hover:text-white transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
              >
                {authBusy ? "Menghubungkan..." : "Masuk Google"}
              </button>
            )}
          </nav>

          {/* Zone 3: 1 Primary Action (Desktop PWA Install, or Screen Share once installed) */}
          <div className="shrink-0">
            {isInstalled ? (
              <button
                type="button"
                onClick={isSharing ? stopScreenShare : startScreenShare}
                className={`rounded-lg px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  isSharing
                    ? "border border-red-500/40 bg-red-500/15 text-red-200 hover:bg-red-500/25"
                    : "bg-[#00A2FF] text-[#06101B] hover:bg-[#33B5FF]"
                }`}
              >
                {isSharing ? "Hentikan Share" : "Mulai Share Layar"}
              </button>
            ) : (
              <PWAInstallButton variant="primary" />
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main
        id="workbench"
        className="mx-auto w-full max-w-[1480px] flex-1 px-4 sm:px-6 lg:px-8 py-5 space-y-5"
      >
        {/* Minimal Game Switcher Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <Gamepad2 className="h-4 w-4 text-[#00A2FF] shrink-0" />
            <div className="flex flex-wrap items-center gap-1 rounded-lg border border-white/8 bg-[#11151E] p-1">
              {profiles.slice(0, 4).map((p) => {
                const active = p.id === activeProfile.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setActiveProfileId(p.id)}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      active
                        ? "bg-[#1D273B] text-white"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {p.name}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => setProfileModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#11151E] px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:text-white whitespace-nowrap shrink-0"
            >
              <SlidersHorizontal className="h-3.5 w-3.5 text-[#00A2FF]" />
              <span>Kelola Game</span>
            </button>
          </div>

          <div className="flex md:hidden items-center gap-3 text-xs text-slate-300">
            <button
              type="button"
              onClick={() => setShowRobloxBuilder(true)}
              className="hover:text-white whitespace-nowrap"
            >
              Alat Roblox
            </button>
            {user ? (
              <button
                type="button"
                onClick={handleSignOut}
                className="hover:text-white whitespace-nowrap"
              >
                Keluar
              </button>
            ) : (
              <button
                type="button"
                disabled={authBusy}
                onClick={handleSignIn}
                className="text-[#00A2FF] hover:underline whitespace-nowrap"
              >
                Masuk Google
              </button>
            )}
          </div>
        </div>

        {errorBanner && (
          <div
            role="alert"
            className="flex items-start justify-between gap-3 rounded-xl border border-amber-500/35 bg-amber-950/30 px-4 py-3 text-sm text-amber-100"
          >
            <div className="flex items-start gap-2.5">
              <AlertCircle className="mt-0.5 h-4 w-4 text-amber-400 shrink-0" />
              <p className="leading-relaxed">{errorBanner}</p>
            </div>
            <button
              type="button"
              aria-label="Tutup peringatan"
              onClick={() => setErrorBanner(null)}
              className="text-amber-300 hover:text-white shrink-0"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Spacious 8:4 Game-First Split Workbench */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          <div className="lg:col-span-8">
            <ScreenStage
              videoRef={videoRef}
              activeProfile={activeProfile}
              isSharing={isSharing}
              screenResolution={screenResolution}
              liveState={liveState}
              micLevel={micLevel}
              isMicMuted={isMicMuted}
              isSpeakerMuted={isSpeakerMuted}
              autoCoachEnabled={autoCoachEnabled}
              autoCoachIntervalSec={autoCoachIntervalSec}
              autoCoachBusy={autoCoachBusy}
              latestAdvice={latestAdvice}
              overlayOpen={overlayHudOpen || pipWindowOpen}
              snapshots={snapshots}
              activeSnapshot={activeSnapshot}
              onStartShare={startScreenShare}
              onStopShare={stopScreenShare}
              onCaptureSnapshot={handleCaptureSnapshot}
              onUploadScreenshot={handleUploadScreenshot}
              onToggleLiveVoice={handleToggleLiveVoice}
              onToggleMicMute={() => setIsMicMuted((v) => !v)}
              onToggleSpeakerMute={() => setIsSpeakerMuted((v) => !v)}
              onToggleAutoCoach={() => setAutoCoachEnabled((v) => !v)}
              onChangeAutoCoachInterval={setAutoCoachIntervalSec}
              onRunAutoCoachNow={() => void runAutoCoachCheck(true)}
              onToggleOverlay={handleToggleOverlay}
              onSelectSnapshot={setActiveSnapshot}
              onRemoveSnapshot={handleRemoveSnapshot}
            />
          </div>

          <div className="lg:col-span-4">
            <CopilotChatPanel
              activeProfile={activeProfile}
              sessions={sessions}
              activeSessionId={activeSessionId}
              messages={messages}
              transcripts={transcripts}
              modelTier={modelTier}
              isGenerating={isGenerating}
              isSyncingCloud={isSyncingCloud}
              isSharing={isSharing}
              activeSnapshot={activeSnapshot}
              pendingImage={pendingImage}
              isTranscribing={isTranscribing}
              isRecordingTranscript={isRecordingTranscript}
              recordingSeconds={recordingSeconds}
              transcribedDraft={transcribedDraft}
              onConsumeTranscribedDraft={() => setTranscribedDraft(null)}
              onChangeModelTier={setModelTier}
              onSelectSession={(sessionId) => {
                setActiveSessionId(sessionId);
              }}
              onNewSession={handleNewSession}
              onClearChat={() => setMessages([])}
              onSendMessage={handleSendMessage}
              onPasteImage={handlePasteImage}
              onClearPendingImage={() => setPendingImage(null)}
              onClearActiveSnapshot={() => setActiveSnapshot(null)}
              onToggleTranscriptRecord={handleToggleTranscriptRecord}
              onUseTranscriptInChat={(txt) => setTranscribedDraft(txt)}
              onDeleteTranscript={handleDeleteTranscript}
            />
          </div>
        </div>
      </main>

      {/* Lazy-Loaded Modals & Floating In-Game Overlay HUD */}
      <Suspense fallback={null}>
        {profileModalOpen && (
          <GameProfileModal
            isOpen={profileModalOpen}
            profiles={profiles}
            activeProfileId={activeProfile.id}
            onClose={() => setProfileModalOpen(false)}
            onSelectProfile={(p) => setActiveProfileId(p.id)}
            onCreateProfile={handleCreateProfile}
            onDeleteProfile={handleDeleteProfile}
          />
        )}

        {showRobloxBuilder && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Alat Kreator Roblox"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          >
            <div className="w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-xl border border-white/12 bg-[#11151E]">
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/8 bg-[#11151E] px-5 py-3.5">
                <h2 className="text-sm font-semibold text-white">
                  Alat Kreator Roblox (.rbxmx)
                </h2>
                <button
                  type="button"
                  onClick={() => setShowRobloxBuilder(false)}
                  aria-label="Tutup Alat Roblox"
                  className="rounded-md p-1 text-slate-400 hover:bg-white/10 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="p-5">
                <RobloxPackageBuilder />
              </div>
            </div>
          </div>
        )}
      </Suspense>

      <InGameOverlayHud
        visible={overlayHudOpen && !pipWindowOpen}
        gameName={activeProfile.name}
        latestAdvice={latestAdvice}
        latestReply={latestOverlayReply}
        isGenerating={isGenerating}
        isAiSpeaking={isAiSpeaking}
        autoCoachEnabled={autoCoachEnabled}
        autoCoachBusy={autoCoachBusy}
        isMicMuted={isMicMuted}
        isSpeakerMuted={isSpeakerMuted}
        isSharing={isSharing}
        compactMode={overlayCompactMode}
        onClose={() => setOverlayHudOpen(false)}
        onToggleCompactMode={handleToggleOverlayCompactMode}
        onToggleAutoCoach={() => setAutoCoachEnabled((v) => !v)}
        onToggleMicMute={() => setIsMicMuted((v) => !v)}
        onToggleSpeakerMute={() => setIsSpeakerMuted((v) => !v)}
        onRunAutoCoachNow={() => void runAutoCoachCheck(true)}
        onSendMessage={(txt) => void handleSendMessage(txt)}
      />

      <OfflineIndicator />
    </div>
  );
}
