import { User } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  Unsubscribe,
  updateDoc,
  where,
} from "firebase/firestore";
import { auth, db } from "./firebase";
import {
  ChatMessage,
  ChatSessionItem,
  GamePlatform,
  GameProfile,
  VoiceTranscriptItem,
} from "../types/game";

export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error("Firestore Error: ", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

function makeSafeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 9);
  return `${prefix}_${Date.now()}_${rand}`.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function sanitizeIdRef(value: string | null | undefined): string {
  if (!value) return "";
  const cleaned = value.trim().slice(0, 128);
  return /^[a-zA-Z0-9_-]+$/.test(cleaned) ? cleaned : "";
}

function toMillis(val: unknown): number {
  if (val instanceof Timestamp) return val.toMillis();
  if (val && typeof val === "object" && "toMillis" in val) {
    return (val as { toMillis: () => number }).toMillis();
  }
  return 0;
}

function formatTimestamp(val: unknown): string {
  const ms = toMillis(val);
  if (!ms) {
    return new Date().toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return new Date(ms).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

const DEFAULT_SEED_PROFILES: Array<{
  id: string;
  name: string;
  platform: GamePlatform;
  genre: string;
  notes: string;
}> = [
  {
    id: "default_pc",
    name: "Game PC / Konsol Umum",
    platform: "pc",
    genre: "Action / RPG",
    notes: "Bantu strategi bertarung, build item, quest, dan navigasi menu.",
  },
  {
    id: "default_mobile",
    name: "Game Mobile (MOBA / RPG)",
    platform: "mobile",
    genre: "MOBA / Strategy",
    notes: "Bantu build item, rotasi objektif, dan posisi tim.",
  },
  {
    id: "default_studio",
    name: "Game Dev / Roblox Studio",
    platform: "studio",
    genre: "Scripting & Design",
    notes: "Bantu debugging error, kode Luau/C#, UI, dan optimasi game.",
  },
];

export async function ensureFirebaseUserRecord(user: User): Promise<void> {
  const userPath = `users/${user.uid}`;
  const userRef = doc(db, "users", user.uid);
  const displayName = (user.displayName || "Pemain").slice(0, 100);
  const photoURL = (user.photoURL || "").slice(0, 500);

  let isNewUser = false;
  try {
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      isNewUser = true;
      await setDoc(userRef, {
        uid: user.uid,
        displayName,
        photoURL,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(userRef, {
        displayName,
        photoURL,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, userPath);
  }

  if (user.email) {
    const privatePath = `users/${user.uid}/private/info`;
    const privateRef = doc(db, "users", user.uid, "private", "info");
    try {
      const privSnap = await getDoc(privateRef);
      if (!privSnap.exists()) {
        await setDoc(privateRef, {
          ownerId: user.uid,
          email: user.email.slice(0, 254),
          updatedAt: serverTimestamp(),
        });
      } else {
        await updateDoc(privateRef, {
          email: user.email.slice(0, 254),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, privatePath);
    }
  }

  if (isNewUser) {
    for (const seed of DEFAULT_SEED_PROFILES) {
      const profilePath = `users/${user.uid}/profiles/${seed.id}`;
      try {
        await setDoc(doc(db, "users", user.uid, "profiles", seed.id), {
          ownerId: user.uid,
          name: seed.name.slice(0, 80),
          platform: seed.platform,
          genre: seed.genre.slice(0, 60),
          notes: seed.notes.slice(0, 500),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, profilePath);
      }
    }
  }
}

export function subscribeGameProfiles(
  uid: string,
  onData: (profiles: GameProfile[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = `users/${uid}/profiles`;
  const q = query(collection(db, "users", uid, "profiles"), where("ownerId", "==", uid));
  return onSnapshot(
    q,
    (snapshot) => {
      const rows = snapshot.docs
        .map((d) => {
          const data = d.data();
          return {
            id: d.id,
            name: String(data.name || "Game"),
            platform: (data.platform as GamePlatform) || "pc",
            genre: String(data.genre || "Umum"),
            notes: String(data.notes || ""),
            _sort: toMillis(data.createdAt),
          };
        })
        .sort((a, b) => b._sort - a._sort)
        .map(({ _sort: _ignored, ...rest }) => rest);
      onData(rows);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );
}

export function subscribeChatSessions(
  uid: string,
  onData: (sessions: ChatSessionItem[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = `users/${uid}/sessions`;
  const q = query(collection(db, "users", uid, "sessions"), where("ownerId", "==", uid));
  return onSnapshot(
    q,
    (snapshot) => {
      const rows = snapshot.docs
        .map((d) => {
          const data = d.data();
          return {
            id: d.id,
            profileId: String(data.profileId || ""),
            title: String(data.title || "Sesi Chat"),
            updatedAt: formatTimestamp(data.updatedAt || data.createdAt),
            _sort: toMillis(data.updatedAt) || toMillis(data.createdAt),
          };
        })
        .sort((a, b) => b._sort - a._sort)
        .map(({ _sort: _ignored, ...rest }) => rest);
      onData(rows);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );
}

export function subscribeSessionMessages(
  uid: string,
  sessionId: string,
  onData: (messages: ChatMessage[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = `users/${uid}/sessions/${sessionId}/messages`;
  const q = query(
    collection(db, "users", uid, "sessions", sessionId, "messages"),
    where("ownerId", "==", uid)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const rows = snapshot.docs
        .map((d) => {
          const data = d.data();
          return {
            id: d.id,
            role: data.role === "assistant" ? ("assistant" as const) : ("user" as const),
            text: String(data.text || ""),
            channel:
              (data.channel as ChatMessage["channel"]) || "text",
            modelUsed: data.modelUsed ? String(data.modelUsed) : undefined,
            timestamp: formatTimestamp(data.createdAt),
            _sort: toMillis(data.createdAt),
          };
        })
        .sort((a, b) => a._sort - b._sort)
        .map(({ _sort: _ignored, ...rest }) => rest);
      onData(rows);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );
}

export function subscribeVoiceTranscripts(
  uid: string,
  onData: (transcripts: VoiceTranscriptItem[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = `users/${uid}/transcripts`;
  const q = query(
    collection(db, "users", uid, "transcripts"),
    where("ownerId", "==", uid)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const rows = snapshot.docs
        .map((d) => {
          const data = d.data();
          return {
            id: d.id,
            transcriptText: String(data.transcriptText || ""),
            durationMs: Number(data.durationMs || 0),
            createdAt: formatTimestamp(data.createdAt),
            _sort: toMillis(data.createdAt),
          };
        })
        .sort((a, b) => b._sort - a._sort)
        .map(({ _sort: _ignored, ...rest }) => rest);
      onData(rows);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );
}

export async function createFirestoreGameProfile(
  uid: string,
  input: {
    name: string;
    platform: GamePlatform;
    genre: string;
    notes: string;
  }
): Promise<GameProfile> {
  const profileId = makeSafeId("gp");
  const path = `users/${uid}/profiles/${profileId}`;
  const cleanName = input.name.trim().slice(0, 80) || "Game Baru";
  const cleanGenre = input.genre.trim().slice(0, 60) || "Umum";
  const cleanNotes = input.notes.trim().slice(0, 500);

  try {
    await setDoc(doc(db, "users", uid, "profiles", profileId), {
      ownerId: uid,
      name: cleanName,
      platform: input.platform,
      genre: cleanGenre,
      notes: cleanNotes,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return {
      id: profileId,
      name: cleanName,
      platform: input.platform,
      genre: cleanGenre,
      notes: cleanNotes,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteFirestoreGameProfile(
  uid: string,
  profileId: string
): Promise<void> {
  const path = `users/${uid}/profiles/${profileId}`;
  try {
    await deleteDoc(doc(db, "users", uid, "profiles", profileId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function createFirestoreChatSession(
  uid: string,
  input: { title: string; profileId?: string }
): Promise<ChatSessionItem> {
  const sessionId = makeSafeId("ses");
  const path = `users/${uid}/sessions/${sessionId}`;
  const cleanTitle = input.title.trim().slice(0, 120) || "Sesi Baru";
  const cleanProfileId = sanitizeIdRef(input.profileId);

  try {
    await setDoc(doc(db, "users", uid, "sessions", sessionId), {
      ownerId: uid,
      title: cleanTitle,
      profileId: cleanProfileId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return {
      id: sessionId,
      profileId: cleanProfileId,
      title: cleanTitle,
      updatedAt: formatTimestamp(null),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function addFirestoreChatMessage(
  uid: string,
  sessionId: string,
  msg: {
    role: "user" | "assistant";
    text: string;
    channel: "text" | "voice" | "transcribe" | "autocoach";
    modelUsed?: string;
  }
): Promise<void> {
  const cleanText = msg.text.trim().slice(0, 16000);
  if (!cleanText) return;
  const messageId = makeSafeId("msg");
  const msgPath = `users/${uid}/sessions/${sessionId}/messages/${messageId}`;

  try {
    await setDoc(
      doc(db, "users", uid, "sessions", sessionId, "messages", messageId),
      {
        ownerId: uid,
        sessionId,
        role: msg.role,
        text: cleanText,
        channel: msg.channel,
        modelUsed: (msg.modelUsed || "").slice(0, 80),
        createdAt: serverTimestamp(),
      }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, msgPath);
  }

  const sessionPath = `users/${uid}/sessions/${sessionId}`;
  try {
    await updateDoc(doc(db, "users", uid, "sessions", sessionId), {
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, sessionPath);
  }
}

export async function createFirestoreVoiceTranscript(
  uid: string,
  input: {
    profileId?: string;
    transcriptText: string;
    durationMs: number;
  }
): Promise<VoiceTranscriptItem> {
  const transcriptId = makeSafeId("tr");
  const path = `users/${uid}/transcripts/${transcriptId}`;
  const cleanText = input.transcriptText.trim().slice(0, 4000);
  const cleanDuration = Math.max(0, Math.min(3600000, Math.round(input.durationMs)));
  const cleanProfileId = sanitizeIdRef(input.profileId);

  try {
    await setDoc(doc(db, "users", uid, "transcripts", transcriptId), {
      ownerId: uid,
      profileId: cleanProfileId,
      transcriptText: cleanText,
      durationMs: cleanDuration,
      createdAt: serverTimestamp(),
    });
    return {
      id: transcriptId,
      transcriptText: cleanText,
      durationMs: cleanDuration,
      createdAt: formatTimestamp(null),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteFirestoreVoiceTranscript(
  uid: string,
  transcriptId: string
): Promise<void> {
  const path = `users/${uid}/transcripts/${transcriptId}`;
  try {
    await deleteDoc(doc(db, "users", uid, "transcripts", transcriptId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
