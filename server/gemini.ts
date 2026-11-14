import { GoogleGenAI } from "@google/genai";

export function createGeminiClient(apiVersion?: string): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY belum dikonfigurasi di server.");
  }

  return new GoogleGenAI({
    apiKey,
    ...(apiVersion ? { apiVersion } : {}),
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

export type GamePlatform = "pc" | "mobile" | "console" | "studio";
export type ModelTier = "fast" | "standard" | "tactical" | "deep";

export interface GameProfileContext {
  name?: string;
  platform?: GamePlatform;
  genre?: string;
  notes?: string;
}

export function resolveGeminiModel(tier: ModelTier = "fast"): string {
  switch (tier) {
    case "deep":
      return "gemini-4-carbon";
    case "tactical":
      return "gemini-4-argon";
    case "standard":
      return "gemini-4-hydrogen";
    case "fast":
    default:
      return "gemini-3.1-flash-lite";
  }
}

export function buildUniversalGameInstruction(
  profile?: GameProfileContext,
  isVoiceLive = false
): string {
  const gameName = profile?.name?.trim() || "Game Umum";
  const platformLabel =
    profile?.platform === "mobile"
      ? "Game Mobile (Android/iOS)"
      : profile?.platform === "console"
        ? "Game Konsol (PlayStation/Xbox/Switch)"
        : profile?.platform === "studio"
          ? "Pengembangan Game / Studio (Roblox Studio, Unity, Unreal)"
          : "Game PC / Steam";
  const genre = profile?.genre?.trim() || "Umum";
  const notes = profile?.notes?.trim()
    ? `Catatan & tujuan pemain: ${profile.notes.trim()}`
    : "";

  const contextBlock = `Profil game aktif: ${gameName} (${platformLabel}, Genre: ${genre}). ${notes}`.trim();

  const styleBlock = isVoiceLive
    ? "ATURAN SUARA WAJIB: Kamu WAJIB berbicara dan menjawab HANYA dalam Bahasa Indonesia yang alami, ramah, jelas, dan langsung ke inti (maksimal 2-3 kalimat per giliran) sambil memantau layar game pengguna. Jangan pernah berpindah ke bahasa lain kecuali menyebut nama item/skill asli di game."
    : "Jawab dalam Bahasa Indonesia yang jelas, ramah, dan langsung dapat dipraktikkan (atau ikuti bahasa pengguna jika pengguna menulis penuh dalam bahasa Inggris). Untuk sapaan ringan seperti 'halo', balas hangat dan singkat (1-2 kalimat). Saat melihat layar game:\n1. Baca HUD, minimap, bar HP/stamina, teks quest, inventory, atau error di layar dengan teliti.\n2. Berikan langkah taktis yang konkret dan bernomor.\n3. Jika pengguna berada di mode Game Dev/Studio dan meminta kode (seperti Luau, C#, atau GDScript), berikan blok kode modern lengkap beserta lokasi pemasangannya.";

  return [
    "Kamu adalah Asaw AI, pemandu dan pelatih AI ahli untuk semua jenis game (PC, Mobile, Konsol, serta pembuatan game).",
    contextBlock,
    styleBlock,
  ].join("\n\n");
}

export function buildAutoCoachInstruction(profile?: GameProfileContext): string {
  const gameName = profile?.name?.trim() || "game di layar";
  const platform = profile?.platform || "pc";
  const genre = profile?.genre?.trim() || "umum";
  const notes = profile?.notes?.trim() || "";

  return [
    `Kamu adalah Auto-Coach real-time untuk game "${gameName}" (Platform: ${platform}, Genre: ${genre}).`,
    notes ? `Fokus pemain: ${notes}` : "",
    "Tugasmu: periksa tangkapan layar terbaru dan tentukan apakah ada hal PENTING atau instruksi taktis langsung yang perlu diberitahukan kepada pemain TANPA diminta.",
    "Contoh momen penting: HP/darah rendah, musuh mendekat atau boss mechanic muncul, pemain tampak bingung di menu/quest, item/upgrade siap diambil, objective baru muncul, atau ada error merah di layar Studio.",
    "Jika layar hanya menu diam, layar loading biasa, atau sama saja dengan instruksi sebelumnya, set shouldSpeak = false.",
    "Jika shouldSpeak = true, tulis instruction dalam Bahasa Indonesia yang singkat, tegas, dan mudah dibaca di overlay (maksimal 180 karakter).",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function buildInGameNpcInstruction(params: {
  npcName: string;
  gameName: string;
  genre: string;
  gameContext: string;
  language: "id" | "en";
}): string {
  const langRule =
    params.language === "en"
      ? "Reply in friendly, concise English (max 2-3 short sentences, under 320 characters) suitable for an in-game Roblox NPC chat bubble."
      : "Jawab dalam bahasa Indonesia yang ramah, santai, dan singkat (maksimal 2-3 kalimat pendek, di bawah 320 karakter) agar pas dibaca di kotak dialog dalam game Roblox.";

  return [
    `Kamu adalah NPC pemandu resmi bernama "${params.npcName}" di dalam game Roblox berjudul "${params.gameName}" (Genre: ${params.genre}).`,
    params.gameContext
      ? `Informasi & aturan game dari kreator:\n${params.gameContext}`
      : "Bantu pemain memahami cara bermain, misi, kontrol dasar, dan berikan semangat.",
    langRule,
    "Jangan gunakan format markdown seperti ** atau ``` karena kotak chat Roblox hanya menampilkan teks biasa.",
  ].join("\n\n");
}

export function formatGeminiError(err: unknown): {
  status: number;
  message: string;
} {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();

  if (
    lower.includes("api_key_invalid") ||
    lower.includes("permission_denied") ||
    lower.includes("403")
  ) {
    return {
      status: 403,
      message:
        "API key Gemini tidak valid atau belum diatur. Periksa panel Settings > Secrets.",
    };
  }
  if (lower.includes("resource_exhausted") || lower.includes("429")) {
    return {
      status: 429,
      message:
        "Kuota tercapai atau model Taktis/Mendalam memerlukan API key berbayar di Settings > Secrets. Anda dapat memakai mode Kilat atau Standar terlebih dahulu.",
    };
  }
  if (lower.includes("not_found") || lower.includes("404")) {
    return {
      status: 404,
      message: "Model AI yang diminta tidak tersedia.",
    };
  }
  if (lower.includes("abort") || lower.includes("timeout")) {
    return {
      status: 504,
      message: "Respon AI melebihi batas waktu. Coba gunakan mode Kilat.",
    };
  }
  return {
    status: 500,
    message: raw || "Terjadi kesalahan saat memproses permintaan Gemini.",
  };
}
