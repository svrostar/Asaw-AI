import { relations } from "drizzle-orm";
import {
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  uid: text("uid").notNull().unique(),
  email: text("email").notNull(),
  displayName: text("display_name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const gameProfiles = pgTable("game_profiles", {
  id: serial("id").primaryKey(),
  userUid: text("user_uid")
    .references(() => users.uid, { onDelete: "cascade" })
    .notNull(),
  name: text("name").notNull(),
  platform: text("platform").notNull(), // 'pc' | 'mobile' | 'console' | 'studio'
  genre: text("genre").notNull(),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const chatSessions = pgTable("chat_sessions", {
  id: serial("id").primaryKey(),
  userUid: text("user_uid")
    .references(() => users.uid, { onDelete: "cascade" })
    .notNull(),
  profileId: integer("profile_id").references(() => gameProfiles.id, {
    onDelete: "set null",
  }),
  title: text("title").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const chatMessages = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id")
    .references(() => chatSessions.id, { onDelete: "cascade" })
    .notNull(),
  role: text("role").notNull(), // 'user' | 'assistant'
  text: text("text").notNull(),
  modelUsed: text("model_used"),
  channel: text("channel").notNull().default("text"), // 'text' | 'voice' | 'transcribe' | 'autocoach'
  thumbnailDataUrl: text("thumbnail_data_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const voiceTranscripts = pgTable("voice_transcripts", {
  id: serial("id").primaryKey(),
  userUid: text("user_uid")
    .references(() => users.uid, { onDelete: "cascade" })
    .notNull(),
  profileId: integer("profile_id").references(() => gameProfiles.id, {
    onDelete: "set null",
  }),
  transcriptText: text("transcript_text").notNull(),
  durationMs: integer("duration_ms").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const screenSnapshots = pgTable("screen_snapshots", {
  id: serial("id").primaryKey(),
  userUid: text("user_uid")
    .references(() => users.uid, { onDelete: "cascade" })
    .notNull(),
  profileId: integer("profile_id").references(() => gameProfiles.id, {
    onDelete: "set null",
  }),
  dataUrl: text("data_url").notNull(),
  width: integer("width").notNull().default(0),
  height: integer("height").notNull().default(0),
  source: text("source").notNull().default("screen"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  gameProfiles: many(gameProfiles),
  chatSessions: many(chatSessions),
  voiceTranscripts: many(voiceTranscripts),
  screenSnapshots: many(screenSnapshots),
}));

export const gameProfilesRelations = relations(
  gameProfiles,
  ({ one, many }) => ({
    user: one(users, {
      fields: [gameProfiles.userUid],
      references: [users.uid],
    }),
    chatSessions: many(chatSessions),
  })
);

export const chatSessionsRelations = relations(
  chatSessions,
  ({ one, many }) => ({
    user: one(users, {
      fields: [chatSessions.userUid],
      references: [users.uid],
    }),
    profile: one(gameProfiles, {
      fields: [chatSessions.profileId],
      references: [gameProfiles.id],
    }),
    messages: many(chatMessages),
  })
);

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  session: one(chatSessions, {
    fields: [chatMessages.sessionId],
    references: [chatSessions.id],
  }),
}));
