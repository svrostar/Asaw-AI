import { useState } from "react";
import {
  Check,
  Code2,
  Copy,
  Download,
  MessageSquare,
  Send,
} from "lucide-react";
import {
  generateClientLocalScriptSource,
  generateRbxmxXml,
  generateServerScriptSource,
  RobloxNpcConfig,
} from "../utils/rbxmxGenerator";

const GENRE_OPTIONS = [
  "Obby / Parkour",
  "Simulator / Tycoon",
  "RPG / Petualangan",
  "Roleplay / Town",
  "Survival / Horror",
  "Mini-Games",
];

interface SimMessage {
  id: string;
  sender: string;
  text: string;
  isNpc: boolean;
}

export function RobloxPackageBuilder() {
  const defaultOrigin =
    typeof window !== "undefined" ? window.location.origin : "";

  const [config, setConfig] = useState<RobloxNpcConfig>({
    npcName: "Pemandu AI",
    gameName: "Petualangan Nusantara",
    genre: "Obby / Parkour",
    language: "id",
    welcomeText:
      "Halo! Aku Pemandu AI. Tanyakan cara bermain, misi, atau rahasia di game ini ya!",
    gameKnowledge:
      "Tekan Space untuk melompat, Shift untuk berlari cepat. Kumpulkan koin emas untuk membuka checkpoint dan beli speed boost di Toko.",
    endpointUrl: `${defaultOrigin}/api/roblox-guide`,
  });

  const [simMessages, setSimMessages] = useState<SimMessage[]>([
    {
      id: "welcome",
      sender: "Pemandu AI",
      text: "Halo! Aku Pemandu AI. Coba ketik pertanyaan seperti yang akan ditanyakan pemain di game Roblox Anda.",
      isNpc: true,
    },
  ]);
  const [simInput, setSimInput] = useState("");
  const [simLoading, setSimLoading] = useState(false);

  const [codeTab, setCodeTab] = useState<"server" | "client">("server");
  const [copiedCode, setCopiedCode] = useState(false);
  const [downloadedNotice, setDownloadedNotice] = useState(false);

  const handleDownloadRbxmx = () => {
    const xml = generateRbxmxXml(config);
    const blob = new Blob([xml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const safeFileName =
      config.npcName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "") || "ai_pemandu";
    link.href = url;
    link.download = `asaw_ai_${safeFileName}.rbxmx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);

    setDownloadedNotice(true);
    window.setTimeout(() => setDownloadedNotice(false), 3000);
  };

  const activeScriptSource =
    codeTab === "server"
      ? generateServerScriptSource(config)
      : generateClientLocalScriptSource(config);

  const handleCopyScript = async () => {
    try {
      await navigator.clipboard.writeText(activeScriptSource);
      setCopiedCode(true);
      window.setTimeout(() => setCopiedCode(false), 1800);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleSimulateSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = simInput.trim();
    if (!trimmed || simLoading) return;

    const userMsg: SimMessage = {
      id: `${Date.now()}-u`,
      sender: "Pemain",
      text: trimmed,
      isNpc: false,
    };
    setSimMessages((prev) => [...prev, userMsg]);
    setSimInput("");
    setSimLoading(true);

    try {
      const res = await fetch("/api/roblox-guide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          playerName: "PemainUji",
          npcName: config.npcName,
          gameName: config.gameName,
          genre: config.genre,
          gameContext: config.gameKnowledge,
          language: config.language,
        }),
      });
      const data = (await res.json()) as { reply?: string; error?: string };
      setSimMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-n`,
          sender: config.npcName || "Pemandu AI",
          text:
            data.reply ||
            data.error ||
            "Maaf, belum bisa menjawab sekarang.",
          isNpc: true,
        },
      ]);
    } catch {
      setSimMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-e`,
          sender: config.npcName || "Pemandu AI",
          text: "Gagal menghubungi server simulator.",
          isNpc: true,
        },
      ]);
    } finally {
      setSimLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl space-y-1.5">
          <h2 className="text-xl font-bold text-white">
            Tambahkan AI Pemandu ke Dalam Game Roblox Anda
          </h2>
          <p className="text-sm leading-relaxed text-slate-400">
            Atur identitas dan pengetahuan game Anda, uji coba percakapan NPC
            langsung di sini, lalu unduh file{" "}
            <span className="font-mono text-slate-200">.rbxmx</span> yang bisa
            langsung ditarik masuk ke{" "}
            <strong className="text-slate-200">Roblox Studio</strong>.
          </p>
        </div>

        <button
          type="button"
          onClick={handleDownloadRbxmx}
          className="inline-flex items-center gap-2 rounded-lg bg-[#00A2FF] px-5 py-2.5 text-sm font-semibold text-[#06101B] transition-colors hover:bg-[#33B5FF] whitespace-nowrap shrink-0"
        >
          <Download className="h-4 w-4" />
          <span>
            {downloadedNotice
              ? "Paket .rbxmx Terunduh"
              : "Download Paket AI (.rbxmx)"}
          </span>
        </button>
      </div>

      {/* Configurator + Live Simulator Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left: Game & NPC Config Form */}
        <div className="lg:col-span-7 rounded-xl border border-white/10 bg-[#121722] p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-white/8 pb-3">
            <h3 className="text-sm font-semibold text-white">
              Pengaturan NPC Pemandu & Konteks Game
            </h3>
            <span className="text-xs text-slate-400">
              HttpService + Cadangan Lokal
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="space-y-1.5 block">
              <span className="text-xs font-medium text-slate-300">
                Nama NPC Pemandu
              </span>
              <input
                type="text"
                value={config.npcName}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, npcName: e.target.value }))
                }
                className="w-full rounded-lg border border-white/12 bg-[#090C12] px-3 py-2 text-sm text-white focus:border-[#00A2FF] focus:outline-none"
                placeholder="Pemandu AI"
              />
            </label>

            <label className="space-y-1.5 block">
              <span className="text-xs font-medium text-slate-300">
                Nama Game Roblox
              </span>
              <input
                type="text"
                value={config.gameName}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, gameName: e.target.value }))
                }
                className="w-full rounded-lg border border-white/12 bg-[#090C12] px-3 py-2 text-sm text-white focus:border-[#00A2FF] focus:outline-none"
                placeholder="Nama Game Anda"
              />
            </label>

            <label className="space-y-1.5 block">
              <span className="text-xs font-medium text-slate-300">
                Genre Game
              </span>
              <select
                value={config.genre}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, genre: e.target.value }))
                }
                className="w-full rounded-lg border border-white/12 bg-[#090C12] px-3 py-2 text-sm text-white focus:border-[#00A2FF] focus:outline-none"
              >
                {GENRE_OPTIONS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1.5 block">
              <span className="text-xs font-medium text-slate-300">
                Bahasa NPC
              </span>
              <select
                value={config.language}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    language: e.target.value === "en" ? "en" : "id",
                  }))
                }
                className="w-full rounded-lg border border-white/12 bg-[#090C12] px-3 py-2 text-sm text-white focus:border-[#00A2FF] focus:outline-none"
              >
                <option value="id">Bahasa Indonesia</option>
                <option value="en">English</option>
              </select>
            </label>
          </div>

          <label className="space-y-1.5 block">
            <span className="text-xs font-medium text-slate-300">
              Pesan Sapaan Awal di Game
            </span>
            <input
              type="text"
              value={config.welcomeText}
              onChange={(e) =>
                setConfig((prev) => ({ ...prev, welcomeText: e.target.value }))
              }
              className="w-full rounded-lg border border-white/12 bg-[#090C12] px-3 py-2 text-sm text-white focus:border-[#00A2FF] focus:outline-none"
            />
          </label>

          <label className="space-y-1.5 block">
            <span className="text-xs font-medium text-slate-300">
              Pengetahuan Game (Kontrol, Misi, Cara Dapat Koin, Tips)
            </span>
            <textarea
              rows={3}
              value={config.gameKnowledge}
              onChange={(e) =>
                setConfig((prev) => ({
                  ...prev,
                  gameKnowledge: e.target.value,
                }))
              }
              className="w-full resize-none rounded-lg border border-white/12 bg-[#090C12] px-3 py-2 text-sm text-white focus:border-[#00A2FF] focus:outline-none"
              placeholder="Contoh: Tekan E untuk bicara dengan pedagang, kumpulkan 50 permata untuk membuka Pulau Es..."
            />
          </label>

          {/* 3-Step Installation Guide (flat hairline divider, no nested card) */}
          <div className="border-t border-white/8 pt-4 space-y-2">
            <p className="text-xs font-semibold text-white">
              Cara Memasang ke Roblox Studio:
            </p>
            <ol className="space-y-1 text-xs leading-relaxed text-slate-400">
              <li>
                <span className="font-mono text-[#00A2FF]">1.</span> Unduh file{" "}
                <span className="font-mono text-slate-200">.rbxmx</span> lalu
                tarik (*Drag & Drop*) ke dalam jendela{" "}
                <strong className="text-slate-200">Roblox Studio</strong> (atau
                klik kanan Workspace &gt; <em>Insert from File</em>).
              </li>
              <li>
                <span className="font-mono text-[#00A2FF]">2.</span> Agar NPC
                terhubung penuh dengan AI Gemini, buka{" "}
                <strong className="text-slate-200">
                  Game Settings &gt; Security
                </strong>{" "}
                lalu aktifkan{" "}
                <strong className="text-slate-200">Allow HTTP Requests</strong>.
                (Jika belum aktif, NPC otomatis memakai jawaban cadangan lokal).
              </li>
              <li>
                <span className="font-mono text-[#00A2FF]">3.</span> Tekan{" "}
                <strong className="text-slate-200">Play (F5)</strong>, dekati{" "}
                <span className="font-mono text-slate-200">NPC_Pemandu</span>{" "}
                atau klik tombol{" "}
                <strong className="text-slate-200">Tanya Pemandu AI</strong> di
                pojok kanan bawah!
              </li>
            </ol>
          </div>
        </div>

        {/* Right: Live In-Browser NPC Simulator */}
        <div className="lg:col-span-5 flex flex-col rounded-xl border border-white/10 bg-[#121722] overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/8 bg-[#0E131D] px-4 py-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-[#00A2FF]" />
              <h3 className="text-sm font-semibold text-white">
                Uji Coba Simulator NPC
              </h3>
            </div>
            <span className="text-xs text-slate-400">Pratinjau Dalam Game</span>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-4 min-h-[260px] max-h-[340px]">
            {simMessages.map((msg) => (
              <div
                key={msg.id}
                className={`rounded-lg px-3 py-2 text-xs leading-relaxed ${
                  msg.isNpc
                    ? "border border-white/8 bg-[#161D2B] text-slate-100"
                    : "border border-[#00A2FF]/30 bg-[#0D243B] text-slate-100 ml-6"
                }`}
              >
                <span className="font-semibold text-[#7DD3FC]">
                  {msg.sender}:{" "}
                </span>
                <span>{msg.text}</span>
              </div>
            ))}
            {simLoading && (
              <p className="text-xs text-slate-400">
                {config.npcName} sedang mengetik...
              </p>
            )}
          </div>

          <form
            onSubmit={handleSimulateSend}
            className="flex items-center gap-2 border-t border-white/8 bg-[#0E131D] p-3"
          >
            <input
              type="text"
              value={simInput}
              onChange={(e) => setSimInput(e.target.value)}
              placeholder="Coba tanya sebagai pemain..."
              className="flex-1 rounded-lg border border-white/12 bg-[#090C12] px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:border-[#00A2FF] focus:outline-none"
            />
            <button
              type="submit"
              disabled={simLoading || !simInput.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#00A2FF] px-3.5 py-2 text-xs font-semibold text-[#06101B] transition-colors hover:bg-[#33B5FF] disabled:opacity-40 whitespace-nowrap shrink-0"
            >
              <Send className="h-3.5 w-3.5" />
              <span>Tes</span>
            </button>
          </form>
        </div>
      </div>

      {/* Script Preview & Manual Copy Box */}
      <div className="rounded-xl border border-white/10 bg-[#0B0E14] overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 bg-[#121722] px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Code2 className="h-4 w-4 text-[#00A2FF]" />
            <span className="text-xs font-semibold text-white">
              Isi Script Luau di Dalam Paket
            </span>
            <div className="ml-2 flex items-center gap-1 rounded-md border border-white/10 bg-[#090C12] p-0.5">
              <button
                type="button"
                onClick={() => setCodeTab("server")}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  codeTab === "server"
                    ? "bg-[#1D273B] text-white"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                PemanduServerScript
              </button>
              <button
                type="button"
                onClick={() => setCodeTab("client")}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  codeTab === "client"
                    ? "bg-[#1D273B] text-white"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                PemanduClientUI (LocalScript)
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={handleCopyScript}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/12 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-white/10 whitespace-nowrap shrink-0"
          >
            {copiedCode ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-400" />
                <span>Tersalin</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5 text-slate-400" />
                <span>Salin Script</span>
              </>
            )}
          </button>
        </div>

        <pre className="max-h-56 overflow-auto p-4 font-mono text-xs leading-relaxed text-slate-300">
          {activeScriptSource}
        </pre>
      </div>
    </div>
  );
}
