import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { GamePlatform, GameProfile } from "../types/game";

interface GameProfileModalProps {
  isOpen: boolean;
  profiles: GameProfile[];
  activeProfileId: string;
  onClose: () => void;
  onSelectProfile: (profile: GameProfile) => void;
  onCreateProfile: (input: {
    name: string;
    platform: GamePlatform;
    genre: string;
    notes: string;
  }) => Promise<void>;
  onDeleteProfile: (id: string) => Promise<void>;
}

const QUICK_GAME_PRESETS: Array<{
  name: string;
  platform: GamePlatform;
  genre: string;
  notes: string;
}> = [
  {
    name: "Mobile Legends / MOBA",
    platform: "mobile",
    genre: "MOBA 5v5",
    notes: "Fokus counter build item, rotasi turtle/lord, dan positioning teamfight.",
  },
  {
    name: "Elden Ring / Action RPG",
    platform: "pc",
    genre: "Action RPG",
    notes: "Bantu baca pola serangan boss, rekomendasi stat/weapon, dan arah quest.",
  },
  {
    name: "Valorant / FPS Tactical",
    platform: "pc",
    genre: "Tactical Shooter",
    notes: "Saran ekonomi buy round, penempatan crosshair, dan penggunaan utility.",
  },
  {
    name: "Genshin Impact / Wuthering Waves",
    platform: "mobile",
    genre: "Open-World RPG",
    notes: "Rekomendasi rotasi tim, reaksi elemen, artifact/echo, dan puzzle.",
  },
  {
    name: "Minecraft (Java / Bedrock)",
    platform: "pc",
    genre: "Sandbox Survival",
    notes: "Resep crafting, mekanik redstone, farm efisien, dan persiapan Nether/End.",
  },
];

export function GameProfileModal({
  isOpen,
  profiles,
  activeProfileId,
  onClose,
  onSelectProfile,
  onCreateProfile,
  onDeleteProfile,
}: GameProfileModalProps) {
  const [name, setName] = useState("");
  const [platform, setPlatform] = useState<GamePlatform>("pc");
  const [genre, setGenre] = useState("Action / RPG");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      await onCreateProfile({
        name: name.trim(),
        platform,
        genre: genre.trim() || "Umum",
        notes: notes.trim(),
      });
      setName("");
      setNotes("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Kelola Profil Game"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
    >
      <div className="w-full max-w-2xl rounded-xl border border-white/12 bg-[#121722] overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/8 bg-[#0E131D] px-5 py-3.5">
          <div>
            <h2 className="text-base font-semibold text-white">
              Profil Game Aktif
            </h2>
            <p className="text-xs text-slate-400">
              Pilih atau buat profil agar AI memahami mekanik dan strategi game
              Anda.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup dialog"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[78vh] overflow-y-auto p-5 space-y-6">
          {/* Existing Profiles */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-slate-300">
              Daftar Profil Anda
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {profiles.map((p) => {
                const isActive = p.id === activeProfileId;
                return (
                  <div
                    key={p.id}
                    className={`flex items-start justify-between gap-2 rounded-lg border p-3 transition-colors ${
                      isActive
                        ? "border-[#00A2FF] bg-[#0D243B]/60"
                        : "border-white/10 bg-[#0E131D] hover:border-white/25"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onSelectProfile(p);
                        onClose();
                      }}
                      className="flex-1 text-left min-w-0"
                    >
                      <p className="text-sm font-semibold text-white truncate">
                        {p.name}
                      </p>
                      <p className="text-xs text-slate-400 truncate">
                        {p.platform.toUpperCase()} · {p.genre}
                      </p>
                    </button>
                    {profiles.length > 1 && (
                      <button
                        type="button"
                        aria-label={`Hapus ${p.name}`}
                        onClick={() => onDeleteProfile(p.id)}
                        className="p-1 text-slate-500 hover:text-red-400 shrink-0"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quick Presets */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-slate-300">
              Tambah Cepat Preset Populer
            </h3>
            <div className="flex flex-wrap gap-2">
              {QUICK_GAME_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  disabled={saving}
                  onClick={async () => {
                    setSaving(true);
                    try {
                      await onCreateProfile(preset);
                    } finally {
                      setSaving(false);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/12 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-white/10 whitespace-nowrap shrink-0"
                >
                  <Plus className="h-3.5 w-3.5 text-[#00A2FF]" />
                  <span>{preset.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Custom Profile Form (flat hairline divider) */}
          <form
            onSubmit={handleSubmit}
            className="border-t border-white/8 pt-5 space-y-3"
          >
            <h3 className="text-xs font-semibold text-white">
              Buat Profil Game Kustom
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                placeholder="Nama Game (mis. GTA V)"
                required
                className="rounded-lg border border-white/12 bg-[#090C12] px-3 py-2 text-xs text-white focus:border-[#00A2FF] focus:outline-none"
              />
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value as GamePlatform)}
                className="rounded-lg border border-white/12 bg-[#090C12] px-3 py-2 text-xs text-white focus:border-[#00A2FF] focus:outline-none"
              >
                <option value="pc">Game PC / Steam</option>
                <option value="mobile">Game Mobile</option>
                <option value="console">Game Konsol</option>
                <option value="studio">Game Dev / Studio</option>
              </select>
              <input
                type="text"
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                maxLength={60}
                placeholder="Genre (mis. RPG, FPS)"
                className="rounded-lg border border-white/12 bg-[#090C12] px-3 py-2 text-xs text-white focus:border-[#00A2FF] focus:outline-none"
              />
            </div>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={500}
              placeholder="Catatan khusus untuk AI (mis. target build, boss yang sedang dilawan, atau aturan server)..."
              className="w-full resize-none rounded-lg border border-white/12 bg-[#090C12] px-3 py-2 text-xs text-white focus:border-[#00A2FF] focus:outline-none"
            />
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving || !name.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#00A2FF] px-4 py-2 text-xs font-semibold text-[#06101B] transition-colors hover:bg-[#33B5FF] disabled:opacity-40 whitespace-nowrap shrink-0"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>{saving ? "Menyimpan..." : "Simpan Profil"}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
