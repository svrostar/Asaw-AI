import { and, desc, eq } from "drizzle-orm";
import { db } from "./index.ts";
import {
  chatMessages,
  chatSessions,
  gameProfiles,
  screenSnapshots,
  users,
  voiceTranscripts,
} from "./schema.ts";

export async function getOrCreateUser(
  uid: string,
  email: string,
  displayName?: string | null
) {
  try {
    const result = await db
      .insert(users)
      .values({
        uid,
        email,
        displayName: displayName ?? null,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email,
          displayName: displayName ?? null,
        },
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error("Failed to upsert user:", error);
    throw new Error("Gagal menyinkronkan akun pengguna.", { cause: error });
  }
}

export async function listGameProfiles(userUid: string) {
  try {
    const rows = await db
      .select()
      .from(gameProfiles)
      .where(eq(gameProfiles.userUid, userUid))
      .orderBy(desc(gameProfiles.createdAt));

    if (rows.length === 0) {
      const defaults = await db
        .insert(gameProfiles)
        .values([
          {
            userUid,
            name: "Game PC / Konsol Umum",
            platform: "pc",
            genre: "Action / RPG",
            notes: "Bantu strategi bertarung, build item, quest, dan navigasi menu.",
          },
          {
            userUid,
            name: "Game Mobile (MOBA / RPG)",
            platform: "mobile",
            genre: "MOBA / Strategy",
            notes: "Bantu pemilihan build, rotasi lane, objektif, dan posisi tim.",
          },
          {
            userUid,
            name: "Roblox & Roblox Studio",
            platform: "studio",
            genre: "Sandbox / Luau Dev",
            notes: "Bantu scripting Luau, debugging Output, Explorer, dan gameplay Roblox.",
          },
        ])
        .returning();
      return defaults;
    }

    return rows;
  } catch (error) {
    console.error("Failed to list game profiles:", error);
    throw new Error("Gagal memuat profil game.", { cause: error });
  }
}

export async function createGameProfile(
  userUid: string,
  input: { name: string; platform: string; genre: string; notes: string }
) {
  try {
    const rows = await db
      .insert(gameProfiles)
      .values({
        userUid,
        name: input.name,
        platform: input.platform,
        genre: input.genre,
        notes: input.notes,
      })
      .returning();
    return rows[0];
  } catch (error) {
    console.error("Failed to create game profile:", error);
    throw new Error("Gagal menyimpan profil game baru.", { cause: error });
  }
}

export async function deleteGameProfile(userUid: string, profileId: number) {
  try {
    await db
      .delete(gameProfiles)
      .where(
        and(eq(gameProfiles.id, profileId), eq(gameProfiles.userUid, userUid))
      );
  } catch (error) {
    console.error("Failed to delete game profile:", error);
    throw new Error("Gagal menghapus profil game.", { cause: error });
  }
}

export async function listChatSessions(userUid: string) {
  try {
    return await db
      .select()
      .from(chatSessions)
      .where(eq(chatSessions.userUid, userUid))
      .orderBy(desc(chatSessions.updatedAt))
      .limit(25);
  } catch (error) {
    console.error("Failed to list chat sessions:", error);
    throw new Error("Gagal memuat riwayat sesi chat.", { cause: error });
  }
}

export async function createChatSession(
  userUid: string,
  input: { title: string; profileId?: number | null }
) {
  try {
    const rows = await db
      .insert(chatSessions)
      .values({
        userUid,
        profileId: input.profileId ?? null,
        title: input.title,
      })
      .returning();
    return rows[0];
  } catch (error) {
    console.error("Failed to create chat session:", error);
    throw new Error("Gagal membuat sesi chat baru.", { cause: error });
  }
}

export async function deleteChatSession(userUid: string, sessionId: number) {
  try {
    await db
      .delete(chatSessions)
      .where(
        and(eq(chatSessions.id, sessionId), eq(chatSessions.userUid, userUid))
      );
  } catch (error) {
    console.error("Failed to delete chat session:", error);
    throw new Error("Gagal menghapus sesi chat.", { cause: error });
  }
}

export async function listSessionMessages(userUid: string, sessionId: number) {
  try {
    const owned = await db
      .select({ id: chatSessions.id })
      .from(chatSessions)
      .where(
        and(eq(chatSessions.id, sessionId), eq(chatSessions.userUid, userUid))
      )
      .limit(1);

    if (owned.length === 0) {
      return [];
    }

    return await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, sessionId))
      .orderBy(chatMessages.createdAt);
  } catch (error) {
    console.error("Failed to list messages:", error);
    throw new Error("Gagal memuat pesan percakapan.", { cause: error });
  }
}

export async function addChatMessage(
  userUid: string,
  input: {
    sessionId: number;
    role: string;
    text: string;
    modelUsed?: string | null;
    channel: string;
    thumbnailDataUrl?: string | null;
  }
) {
  try {
    const owned = await db
      .select({ id: chatSessions.id })
      .from(chatSessions)
      .where(
        and(
          eq(chatSessions.id, input.sessionId),
          eq(chatSessions.userUid, userUid)
        )
      )
      .limit(1);

    if (owned.length === 0) {
      throw new Error("Sesi chat tidak ditemukan.");
    }

    const rows = await db
      .insert(chatMessages)
      .values({
        sessionId: input.sessionId,
        role: input.role,
        text: input.text,
        modelUsed: input.modelUsed ?? null,
        channel: input.channel,
        thumbnailDataUrl: input.thumbnailDataUrl ?? null,
      })
      .returning();

    await db
      .update(chatSessions)
      .set({ updatedAt: new Date() })
      .where(eq(chatSessions.id, input.sessionId));

    return rows[0];
  } catch (error) {
    console.error("Failed to save chat message:", error);
    throw new Error("Gagal menyimpan pesan percakapan.", { cause: error });
  }
}

export async function listVoiceTranscripts(userUid: string) {
  try {
    return await db
      .select()
      .from(voiceTranscripts)
      .where(eq(voiceTranscripts.userUid, userUid))
      .orderBy(desc(voiceTranscripts.createdAt))
      .limit(40);
  } catch (error) {
    console.error("Failed to list voice transcripts:", error);
    throw new Error("Gagal memuat log transkrip suara.", { cause: error });
  }
}

export async function createVoiceTranscript(
  userUid: string,
  input: {
    profileId?: number | null;
    transcriptText: string;
    durationMs: number;
  }
) {
  try {
    const rows = await db
      .insert(voiceTranscripts)
      .values({
        userUid,
        profileId: input.profileId ?? null,
        transcriptText: input.transcriptText,
        durationMs: input.durationMs,
      })
      .returning();
    return rows[0];
  } catch (error) {
    console.error("Failed to save voice transcript:", error);
    throw new Error("Gagal menyimpan transkrip suara.", { cause: error });
  }
}

export async function deleteVoiceTranscript(userUid: string, id: number) {
  try {
    await db
      .delete(voiceTranscripts)
      .where(
        and(eq(voiceTranscripts.id, id), eq(voiceTranscripts.userUid, userUid))
      );
  } catch (error) {
    console.error("Failed to delete voice transcript:", error);
    throw new Error("Gagal menghapus transkrip suara.", { cause: error });
  }
}

export async function listSnapshots(userUid: string) {
  try {
    return await db
      .select()
      .from(screenSnapshots)
      .where(eq(screenSnapshots.userUid, userUid))
      .orderBy(desc(screenSnapshots.createdAt))
      .limit(12);
  } catch (error) {
    console.error("Failed to list snapshots:", error);
    throw new Error("Gagal memuat snapshot tersimpan.", { cause: error });
  }
}

export async function saveSnapshot(
  userUid: string,
  input: {
    profileId?: number | null;
    dataUrl: string;
    width: number;
    height: number;
    source: string;
  }
) {
  try {
    const rows = await db
      .insert(screenSnapshots)
      .values({
        userUid,
        profileId: input.profileId ?? null,
        dataUrl: input.dataUrl,
        width: input.width,
        height: input.height,
        source: input.source,
      })
      .returning();
    return rows[0];
  } catch (error) {
    console.error("Failed to save snapshot:", error);
    throw new Error("Gagal menyimpan snapshot.", { cause: error });
  }
}

export async function deleteSnapshot(userUid: string, id: number) {
  try {
    await db
      .delete(screenSnapshots)
      .where(
        and(eq(screenSnapshots.id, id), eq(screenSnapshots.userUid, userUid))
      );
  } catch (error) {
    console.error("Failed to delete snapshot:", error);
    throw new Error("Gagal menghapus snapshot.", { cause: error });
  }
}
