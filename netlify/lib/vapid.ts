import webpush from "web-push";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { appKeys } from "../../db/schema.js";

// The VAPID key pair is generated once and kept in the database.
export async function getVapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  const [row] = await db.select().from(appKeys).where(eq(appKeys.name, "vapid"));
  if (row) return JSON.parse(row.value);
  const keys = webpush.generateVAPIDKeys();
  await db.insert(appKeys).values({ name: "vapid", value: JSON.stringify(keys) }).onConflictDoNothing();
  const [saved] = await db.select().from(appKeys).where(eq(appKeys.name, "vapid"));
  return JSON.parse(saved.value);
}

export async function configureWebPush() {
  const keys = await getVapidKeys();
  webpush.setVapidDetails(process.env.URL || "https://markto.netlify.app", keys.publicKey, keys.privateKey);
  return webpush;
}
