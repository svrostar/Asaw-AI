import "dotenv/config";
import http from "node:http";
import path from "node:path";
import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import { Modality, ThinkingLevel, Type } from "@google/genai";
import type { LiveServerMessage } from "@google/genai";
import {
  buildAutoCoachInstruction,
  buildInGameNpcInstruction,
  buildUniversalGameInstruction,
  createGeminiClient,
  formatGeminiError,
  resolveGeminiModel,
} from "./server/gemini.ts";
import type {
  GamePlatform,
  GameProfileContext,
  ModelTier,
} from "./server/gemini.ts";
import { requireAuth } from "./src/middleware/auth.ts";
import type { AuthRequest } from "./src/middleware/auth.ts";
import {
  addChatMessage,
  createChatSession,
  createGameProfile,
  createVoiceTranscript,
  deleteChatSession,
  deleteGameProfile,
  deleteSnapshot,
  deleteVoiceTranscript,
  getOrCreateUser,
  listChatSessions,
  listGameProfiles,
  listSessionMessages,
  listSnapshots,
  listVoiceTranscripts,
  saveSnapshot,
} from "./src/db/queries.ts";

const PORT = Number(process.env.PORT) || 3000;

interface ChatMessageInput {
  role: "user" | "assistant";
  text: string;
}

interface AnalyzeRequestBody {
  messages?: ChatMessageInput[];
  imageBase64?: string;
  imageMimeType?: string;
  modelTier?: ModelTier;
  gameProfile?: GameProfileContext;
}

interface AutoCoachRequestBody {
  imageBase64?: string;
  imageMimeType?: string;
  gameProfile?: GameProfileContext;
  lastAdvice?: string;
}

interface TranscribeRequestBody {
  audioBase64?: string;
  mimeType?: string;
  languageHint?: string;
}

interface TtsRequestBody {
  text?: string;
}

interface RobloxGuideBody {
  message?: string;
  playerName?: string;
  npcName?: string;
  gameName?: string;
  genre?: string;
  gameContext?: string;
  language?: "id" | "en";
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "20mb" }));

  // Allow CORS on /api/roblox-guide for Roblox HttpService & web testing
  app.use("/api/roblox-guide", (_req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (_req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });

  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      hasApiKey: Boolean(process.env.GEMINI_API_KEY),
    });
  });

  // ============================================================================
  // Cloud SQL Persistence Routes (Authenticated with Firebase ID Token)
  // ============================================================================
  app.get("/api/db/bootstrap", requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const email = req.user!.email || `${uid}@user.local`;
      const displayName = req.user!.name || null;

      const user = await getOrCreateUser(uid, email, displayName);
      const [profiles, sessions, transcripts, snapshots] = await Promise.all([
        listGameProfiles(uid),
        listChatSessions(uid),
        listVoiceTranscripts(uid),
        listSnapshots(uid),
      ]);

      res.json({ user, profiles, sessions, transcripts, snapshots });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Database error";
      res.status(500).json({ error: msg });
    }
  });

  app.post("/api/db/profiles", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { name, platform, genre, notes } = req.body ?? {};
      if (!name || typeof name !== "string") {
        res.status(400).json({ error: "Nama game wajib diisi." });
        return;
      }
      const created = await createGameProfile(req.user!.uid, {
        name: name.trim(),
        platform: typeof platform === "string" ? platform : "pc",
        genre: typeof genre === "string" && genre.trim() ? genre.trim() : "Umum",
        notes: typeof notes === "string" ? notes.trim() : "",
      });
      res.json(created);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Gagal menyimpan profil.";
      res.status(500).json({ error: msg });
    }
  });

  app.delete("/api/db/profiles/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        res.status(400).json({ error: "ID profil tidak valid." });
        return;
      }
      await deleteGameProfile(req.user!.uid, id);
      res.json({ ok: true });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Gagal menghapus profil.";
      res.status(500).json({ error: msg });
    }
  });

  app.post("/api/db/sessions", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { title, profileId } = req.body ?? {};
      const created = await createChatSession(req.user!.uid, {
        title: typeof title === "string" && title.trim() ? title.trim() : "Sesi Baru",
        profileId: typeof profileId === "number" ? profileId : null,
      });
      res.json(created);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Gagal membuat sesi.";
      res.status(500).json({ error: msg });
    }
  });

  app.delete("/api/db/sessions/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        res.status(400).json({ error: "ID sesi tidak valid." });
        return;
      }
      await deleteChatSession(req.user!.uid, id);
      res.json({ ok: true });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Gagal menghapus sesi.";
      res.status(500).json({ error: msg });
    }
  });

  app.get("/api/db/sessions/:id/messages", requireAuth, async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        res.status(400).json({ error: "ID sesi tidak valid." });
        return;
      }
      const rows = await listSessionMessages(req.user!.uid, id);
      res.json(rows);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Gagal memuat pesan.";
      res.status(500).json({ error: msg });
    }
  });

  app.post("/api/db/sessions/:id/messages", requireAuth, async (req: AuthRequest, res) => {
    try {
      const sessionId = Number(req.params.id);
      if (!Number.isFinite(sessionId)) {
        res.status(400).json({ error: "ID sesi tidak valid." });
        return;
      }
      const { role, text, modelUsed, channel, thumbnailDataUrl } = req.body ?? {};
      const saved = await addChatMessage(req.user!.uid, {
        sessionId,
        role: role === "assistant" ? "assistant" : "user",
        text: typeof text === "string" ? text : "",
        modelUsed: typeof modelUsed === "string" ? modelUsed : null,
        channel: typeof channel === "string" ? channel : "text",
        thumbnailDataUrl:
          typeof thumbnailDataUrl === "string" ? thumbnailDataUrl : null,
      });
      res.json(saved);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Gagal menyimpan pesan.";
      res.status(500).json({ error: msg });
    }
  });

  app.post("/api/db/transcripts", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { profileId, transcriptText, durationMs } = req.body ?? {};
      if (!transcriptText || typeof transcriptText !== "string") {
        res.status(400).json({ error: "Teks transkrip wajib diisi." });
        return;
      }
      const saved = await createVoiceTranscript(req.user!.uid, {
        profileId: typeof profileId === "number" ? profileId : null,
        transcriptText: transcriptText.trim(),
        durationMs: typeof durationMs === "number" ? durationMs : 0,
      });
      res.json(saved);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Gagal menyimpan transkrip.";
      res.status(500).json({ error: msg });
    }
  });

  app.delete("/api/db/transcripts/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        res.status(400).json({ error: "ID transkrip tidak valid." });
        return;
      }
      await deleteVoiceTranscript(req.user!.uid, id);
      res.json({ ok: true });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Gagal menghapus transkrip.";
      res.status(500).json({ error: msg });
    }
  });

  app.post("/api/db/snapshots", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { profileId, dataUrl, width, height, source } = req.body ?? {};
      if (!dataUrl || typeof dataUrl !== "string") {
        res.status(400).json({ error: "Data gambar snapshot diperlukan." });
        return;
      }
      const saved = await saveSnapshot(req.user!.uid, {
        profileId: typeof profileId === "number" ? profileId : null,
        dataUrl,
        width: typeof width === "number" ? width : 0,
        height: typeof height === "number" ? height : 0,
        source: typeof source === "string" ? source : "screen",
      });
      res.json(saved);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Gagal menyimpan snapshot.";
      res.status(500).json({ error: msg });
    }
  });

  app.delete("/api/db/snapshots/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        res.status(400).json({ error: "ID snapshot tidak valid." });
        return;
      }
      await deleteSnapshot(req.user!.uid, id);
      res.json({ ok: true });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Gagal menghapus snapshot.";
      res.status(500).json({ error: msg });
    }
  });

  // ============================================================================
  // Gemini AI Endpoints
  // ============================================================================

  // 1. Multi-model Streaming Chat & Screen Analysis
  app.post("/api/analyze", async (req, res) => {
    const body = (req.body ?? {}) as AnalyzeRequestBody;
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const modelTier: ModelTier = body.modelTier ?? "fast";
    const modelName = resolveGeminiModel(modelTier);

    if (messages.length === 0 && !body.imageBase64) {
      res.status(400).json({ error: "Pesan atau tangkapan layar diperlukan." });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const sendEvent = (payload: Record<string, unknown>) => {
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      }
    };

    sendEvent({ status: "connected", model: modelName });

    const abortController = new AbortController();
    const timeoutMs = modelTier === "fast" ? 18000 : 45000;
    const timeoutId = setTimeout(() => {
      abortController.abort(new Error("Request timeout"));
    }, timeoutMs);

    res.on("close", () => {
      clearTimeout(timeoutId);
      if (!res.writableEnded) {
        abortController.abort();
      }
    });

    try {
      const ai = createGeminiClient();

      const historyContents = messages.slice(-12).map((msg, idx, arr) => {
        const isLastUser = idx === arr.length - 1 && msg.role === "user";
        const parts: Array<
          { text: string } | { inlineData: { mimeType: string; data: string } }
        > = [];

        if (isLastUser && body.imageBase64) {
          parts.push({
            inlineData: {
              mimeType: body.imageMimeType || "image/jpeg",
              data: body.imageBase64,
            },
          });
        }

        parts.push({
          text:
            msg.text.trim() ||
            "Tolong analisis layar game saya ini dan bantu apa yang perlu dilakukan.",
        });

        return {
          role: msg.role === "assistant" ? "model" : "user",
          parts,
        };
      });

      if (historyContents.length === 0 && body.imageBase64) {
        historyContents.push({
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType: body.imageMimeType || "image/jpeg",
                data: body.imageBase64,
              },
            },
            { text: "Tolong analisis layar game saya ini." },
          ],
        });
      }

      const systemInstruction = buildUniversalGameInstruction(
        body.gameProfile,
        false
      );

      const config: Record<string, unknown> = {
        systemInstruction,
        abortSignal: abortController.signal,
      };

      if (modelTier === "standard") {
        config.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
      } else if (modelTier === "tactical") {
        config.thinkingConfig = { thinkingLevel: ThinkingLevel.MEDIUM };
      } else if (modelTier === "deep") {
        config.thinkingConfig = { thinkingLevel: ThinkingLevel.HIGH };
      }

      const stream = await ai.models.generateContentStream({
        model: modelName,
        contents: historyContents,
        config,
      });

      let emittedAnyText = false;
      for await (const chunk of stream) {
        if (chunk.text) {
          emittedAnyText = true;
          sendEvent({ text: chunk.text, model: modelName });
        }
      }

      if (!emittedAnyText) {
        sendEvent({
          text: "Halo! Saya siap membantu game yang sedang Anda mainkan atau kembangkan. Ada bagian mana yang ingin dicek?",
          model: modelName,
        });
      }

      clearTimeout(timeoutId);
      sendEvent({ done: true, model: modelName });
      res.end();
    } catch (err) {
      clearTimeout(timeoutId);
      console.error("[/api/analyze] error:", err);
      const formatted = formatGeminiError(err);
      sendEvent({ error: formatted.message, status: formatted.status });
      res.end();
    }
  });

  // 2. Ultra-Fast Proactive Auto-Coach (gemini-3.1-flash-lite structured JSON)
  app.post("/api/auto-coach", async (req, res) => {
    const body = (req.body ?? {}) as AutoCoachRequestBody;
    if (!body.imageBase64) {
      res.status(400).json({ error: "Frame layar dibutuhkan untuk Auto-Coach." });
      return;
    }

    try {
      const ai = createGeminiClient();
      const lastAdviceNote = body.lastAdvice
        ? `Instruksi terakhir yang sudah diberikan: "${body.lastAdvice}". Jangan ulangi saran yang sama jika situasinya masih sama.`
        : "Belum ada instruksi sebelumnya.";

      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-lite",
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: body.imageMimeType || "image/jpeg",
                data: body.imageBase64,
              },
            },
            {
              text: `${lastAdviceNote}\nPeriksa layar game sekarang dan tentukan apakah pemain butuh instruksi cepat.`,
            },
          ],
        },
        config: {
          systemInstruction: buildAutoCoachInstruction(body.gameProfile),
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              shouldSpeak: {
                type: Type.BOOLEAN,
                description:
                  "True hanya jika ada hal penting, bahaya, atau instruksi baru yang berguna.",
              },
              urgency: {
                type: Type.STRING,
                description: "Salah satu dari: info, important, alert",
              },
              instruction: {
                type: Type.STRING,
                description:
                  "Instruksi singkat Bahasa Indonesia maksimal 180 karakter.",
              },
            },
            required: ["shouldSpeak", "urgency", "instruction"],
          },
        },
      });

      const raw = (response.text ?? "{}").trim();
      const parsed = JSON.parse(raw) as {
        shouldSpeak?: boolean;
        urgency?: string;
        instruction?: string;
      };

      res.json({
        shouldSpeak: Boolean(parsed.shouldSpeak && parsed.instruction?.trim()),
        urgency:
          parsed.urgency === "alert" || parsed.urgency === "important"
            ? parsed.urgency
            : "info",
        instruction: (parsed.instruction || "").trim(),
      });
    } catch (err) {
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // 3. Microphone Audio Transcription (gemini-3.5-transcribe)
  app.post("/api/transcribe", async (req, res) => {
    const body = (req.body ?? {}) as TranscribeRequestBody;
    if (!body.audioBase64) {
      res.status(400).json({ error: "Data audio diperlukan untuk transkripsi." });
      return;
    }

    try {
      const ai = createGeminiClient();
      const response = await ai.models.generateContent({
        model: "gemini-3.5-transcribe",
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: body.mimeType || "audio/webm",
                data: body.audioBase64,
              },
            },
            {
              text: "Transkripsikan rekaman suara ini secara akurat sesuai ucapan aslinya (Bahasa Indonesia atau istilah game/Inggris yang diucapkan). Kembalikan hanya teks transkrip tanpa catatan tambahan.",
            },
          ],
        },
      });

      const transcript = (response.text || "").trim();
      res.json({ transcript });
    } catch (err) {
      console.error("[/api/transcribe] error:", err);
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // 4. Fast Indonesian Voice Readout for Auto-Coach (gemini-3.8-flash-lite-tts)
  app.post("/api/tts", async (req, res) => {
    const body = (req.body ?? {}) as TtsRequestBody;
    const text = (body.text || "").trim();
    if (!text) {
      res.status(400).json({ error: "Teks diperlukan." });
      return;
    }

    try {
      const ai = createGeminiClient("v1beta");
      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash-lite-tts",
        contents: [
          {
            role: "user",
            parts: [
              {
                text,
                speechMetadata: {
                  style:
                    "Pelatih game berbahasa Indonesia yang ramah, jelas, bertempo cepat dan natural",
                },
              },
            ],
          },
        ],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: "Zephyr" },
            },
          },
        },
      });

      const base64Audio =
        response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) {
        res.status(500).json({ error: "Audio tidak dihasilkan." });
        return;
      }

      res.json({ audioBase64: base64Audio, mimeType: "audio/wav" });
    } catch (err) {
      console.error("[/api/tts] error:", err);
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // 5. In-Game Roblox NPC Endpoint (preserved from earlier version)
  app.post("/api/roblox-guide", async (req, res) => {
    const body = (req.body ?? {}) as RobloxGuideBody;
    const message = (body.message || "").trim();
    if (!message) {
      res.status(400).json({ error: "Pesan pertanyaan diperlukan." });
      return;
    }

    try {
      const ai = createGeminiClient();
      const playerPrefix = body.playerName
        ? `Pemain (${body.playerName}) bertanya: `
        : "";
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-lite",
        contents: `${playerPrefix}${message}`,
        config: {
          systemInstruction: buildInGameNpcInstruction({
            npcName: body.npcName || "Pemandu AI",
            gameName: body.gameName || "Game Roblox",
            genre: body.genre || "Petualangan",
            gameContext: body.gameContext || "",
            language: body.language === "en" ? "en" : "id",
          }),
        },
      });

      const reply =
        response.text?.trim() ||
        "Maaf, aku sedang memproses pertanyaanmu. Coba tanyakan sekali lagi ya!";
      res.json({ reply });
    } catch (err) {
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // ============================================================================
  // HTTP + WebSocket Server (Gemini Live API - Indonesian Voice + Screen 1 FPS)
  // ============================================================================
  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });
  const viteHmrNoopWss =
    process.env.NODE_ENV !== "production"
      ? new WebSocketServer({ noServer: true })
      : null;

  if (viteHmrNoopWss) {
    viteHmrNoopWss.on("connection", (ws) => {
      try {
        ws.send(JSON.stringify({ type: "connected" }));
      } catch {
        // Ignore send errors on closing socket
      }
    });
  }

  server.on("upgrade", (request, socket, head) => {
    const pathname = request.url ? request.url.split("?")[0] : "";
    const wsProtocol = request.headers["sec-websocket-protocol"] || "";
    if (pathname === "/ws/live") {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    } else if (viteHmrNoopWss && wsProtocol.includes("vite-hmr")) {
      viteHmrNoopWss.handleUpgrade(request, socket, head, (ws) => {
        viteHmrNoopWss.emit("connection", ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on("connection", (clientWs, request) => {
    const urlObj = new URL(
      request.url || "/ws/live",
      `http://${request.headers.host || "localhost"}`
    );

    const gameProfile: GameProfileContext = {
      name: urlObj.searchParams.get("game") || "Game Umum",
      platform:
        (urlObj.searchParams.get("platform") as GamePlatform) || "pc",
      genre: urlObj.searchParams.get("genre") || "Umum",
      notes: urlObj.searchParams.get("notes") || "",
    };

    let closed = false;
    let isSessionOpen = false;

    const safeSend = (payload: Record<string, unknown>) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify(payload));
      }
    };

    let ai;
    try {
      ai = createGeminiClient();
    } catch (err) {
      const formatted = formatGeminiError(err);
      safeSend({ type: "error", message: formatted.message });
      clientWs.close();
      return;
    }

    const connectTimer = setTimeout(() => {
      if (!isSessionOpen && !closed) {
        safeSend({
          type: "error",
          message:
            "Koneksi suara Live API melebihi batas waktu. Coba lagi atau gunakan transkrip mikrofon.",
        });
        clientWs.close();
      }
    }, 12000);

    const sessionPromise = ai.live
      .connect({
        model: "gemini-3.8-live",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: "Zephyr" },
            },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction: buildUniversalGameInstruction(gameProfile, true),
        },
        callbacks: {
          onopen: () => {
            clearTimeout(connectTimer);
            isSessionOpen = true;
            safeSend({ type: "ready" });
          },
          onmessage: (message: LiveServerMessage) => {
            const content = message.serverContent;
            if (!content) return;

            if (content.inputTranscription?.text) {
              safeSend({
                type: "inputTranscript",
                text: content.inputTranscription.text,
              });
            }

            if (content.outputTranscription?.text) {
              safeSend({
                type: "outputTranscript",
                text: content.outputTranscription.text,
              });
            }

            for (const part of content.modelTurn?.parts ?? []) {
              if (part.inlineData?.data) {
                safeSend({
                  type: "audio",
                  data: part.inlineData.data,
                });
              }
            }

            if (content.interrupted) {
              safeSend({ type: "interrupted" });
            }

            if (content.turnComplete) {
              safeSend({ type: "turnComplete" });
            }
          },
          onerror: (err: unknown) => {
            clearTimeout(connectTimer);
            console.error("[/ws/live] Gemini Live error:", err);
            const formatted = formatGeminiError(err);
            safeSend({ type: "error", message: formatted.message });
          },
          onclose: () => {
            clearTimeout(connectTimer);
            isSessionOpen = false;
            if (!closed) {
              safeSend({ type: "closed" });
            }
          },
        },
      })
      .catch((err) => {
        clearTimeout(connectTimer);
        console.error("[/ws/live] connect failed:", err);
        const formatted = formatGeminiError(err);
        safeSend({ type: "error", message: formatted.message });
        clientWs.close();
        return null;
      });

    clientWs.on("message", async (rawData) => {
      if (closed || !isSessionOpen) return;
      try {
        const parsed = JSON.parse(rawData.toString()) as {
          type?: string;
          data?: string;
          text?: string;
        };
        const session = await sessionPromise;
        if (!session || closed || !isSessionOpen) return;

        if (parsed.type === "audio" && parsed.data) {
          session.sendRealtimeInput({
            audio: {
              data: parsed.data,
              mimeType: "audio/pcm;rate=16000",
            },
          });
        } else if (parsed.type === "video" && parsed.data) {
          session.sendRealtimeInput({
            video: {
              data: parsed.data,
              mimeType: "image/jpeg",
            },
          });
        } else if (parsed.type === "text" && parsed.text) {
          session.sendRealtimeInput({
            text: parsed.text,
          });
        }
      } catch (err) {
        const formatted = formatGeminiError(err);
        safeSend({ type: "error", message: formatted.message });
      }
    });

    clientWs.on("close", async () => {
      closed = true;
      isSessionOpen = false;
      clearTimeout(connectTimer);
      try {
        const session = await sessionPromise;
        session?.close();
      } catch {
        // Ignore cleanup errors
      }
    });
  });

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    // Disable Vite HMR/WS in middlewareMode so @vite/client never spawns failing WebSockets
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), "dist");
    app.use(express.static(distDir));
    app.get("*", (req, res) => {
      if (req.path.startsWith("/api/")) {
        res.status(404).json({ error: "Endpoint tidak ditemukan." });
        return;
      }
      res.sendFile(path.join(distDir, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Asaw AI server listening on http://localhost:${PORT}`);
  });
}

startServer();
