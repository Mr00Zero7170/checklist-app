import type { Config, Context } from "@netlify/functions";
import { getUser } from "@netlify/identity";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { pushSubscriptions } from "../../db/schema.js";
import { getVapidKeys } from "../lib/vapid.js";

export default async (req: Request, context: Context) => {
  const action = context.params.action;

  if (action === "key" && req.method === "GET") {
    const { publicKey } = await getVapidKeys();
    return Response.json({ publicKey });
  }

  const user = await getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const body = await req.json().catch(() => null);

  if (action === "subscribe" && req.method === "POST") {
    const sub = body?.subscription;
    const minutes = Number(body?.reminderMinutes);
    const timeZone = String(body?.timeZone || "UTC");
    if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth || !(minutes >= 0 && minutes < 1440)) {
      return new Response("Invalid body", { status: 400 });
    }
    try {
      new Intl.DateTimeFormat("en-US", { timeZone });
    } catch {
      return new Response("Invalid time zone", { status: 400 });
    }
    const values = {
      endpoint: sub.endpoint,
      userId: user.id,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      reminderMinutes: Math.floor(minutes),
      timeZone,
    };
    await db
      .insert(pushSubscriptions)
      .values(values)
      .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: values });
    return Response.json({ ok: true });
  }

  if (action === "unsubscribe" && req.method === "POST") {
    if (!body?.endpoint) return new Response("Invalid body", { status: 400 });
    const [row] = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, body.endpoint));
    if (row && row.userId === user.id) {
      await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, body.endpoint));
    }
    return Response.json({ ok: true });
  }

  return new Response("Not found", { status: 404 });
};

export const config: Config = {
  path: "/api/push/:action",
};
