import type { Config } from "@netlify/functions";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { pushSubscriptions, userData } from "../../db/schema.js";
import { configureWebPush } from "../lib/vapid.js";
import { localNow, tasksLeft } from "../lib/checklist.js";

// Sends the daily reminder to anyone whose reminder time has passed and who still has tasks left.
// Reminders are only sent within three hours of the chosen time, at most once per day.
export default async () => {
  const subs = await db.select().from(pushSubscriptions);
  if (subs.length === 0) return;
  const webpush = await configureWebPush();
  const stateCache = new Map<string, any>();

  for (const sub of subs) {
    const now = localNow(sub.timeZone);
    const late = now.minutes - sub.reminderMinutes;
    if (late < 0 || late > 180 || sub.lastSentDate === now.dateKey) continue;

    if (!stateCache.has(sub.userId)) {
      const [row] = await db.select().from(userData).where(eq(userData.userId, sub.userId));
      stateCache.set(sub.userId, row?.data ?? null);
    }
    const state = stateCache.get(sub.userId);
    if (!state) continue;
    const left = tasksLeft(state, now.dateKey, now.weekday);

    await db.update(pushSubscriptions).set({ lastSentDate: now.dateKey }).where(eq(pushSubscriptions.endpoint, sub.endpoint));
    if (left === 0) continue;

    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({
          title: "Daily checklist",
          body: left === 1 ? "1 task left today. You've got this." : `${left} tasks left today. You've got this.`,
        }),
      );
    } catch (err: any) {
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, sub.endpoint));
      } else {
        console.error("Push failed", err?.statusCode, err?.body);
      }
    }
  }
};

export const config: Config = {
  schedule: "*/15 * * * *",
};
