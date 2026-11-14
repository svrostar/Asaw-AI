export type GamePlatform = "pc" | "mobile" | "console" | "studio";
export type ModelTier = "fast" | "standard" | "tactical" | "deep";

export type LiveConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "error";

export interface GameProfile {
  id: string;
  name: string;
  platform: GamePlatform;
  genre: string;
  notes: string;
}

export interface ChatSessionItem {
  id: string;
  profileId: string;
  title: string;
  updatedAt: string;
}

export interface SnapshotFrame {
  id: string;
  dataUrl: string;
  base64: string;
  mimeType: string;
  width: number;
  height: number;
  capturedAt: string;
  source: "screen" | "upload" | "paste";
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: string;
  channel: "text" | "voice" | "transcribe" | "autocoach";
  modelUsed?: string;
  thumbnailUrl?: string;
  isStreaming?: boolean;
  isError?: boolean;
}

export interface VoiceTranscriptItem {
  id: string;
  transcriptText: string;
  durationMs: number;
  createdAt: string;
}

export interface AutoCoachAdvice {
  instruction: string;
  urgency: "info" | "important" | "alert";
  timestamp: string;
}
