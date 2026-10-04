import { pgTable, text, jsonb, bigint, integer, timestamp } from "drizzle-orm/pg-core";

// One row per signed-in user: the whole checklist state as JSON.
export const userData = pgTable("user_data", {
  userId: text("user_id").primaryKey(),
  data: jsonb().notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});

// Web push subscriptions used for the daily reminder.
export const pushSubscriptions = pgTable("push_subscriptions", {
  endpoint: text().primaryKey(),
  userId: text("user_id").notNull(),
  p256dh: text().notNull(),
  auth: text().notNull(),
  reminderMinutes: integer("reminder_minutes").notNull(),
  timeZone: text("time_zone").notNull(),
  lastSentDate: text("last_sent_date"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Server-generated values such as the VAPID key pair.
export const appKeys = pgTable("app_keys", {
  name: text().primaryKey(),
  value: text().notNull(),
});
