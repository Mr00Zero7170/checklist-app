import type { Config } from "@netlify/functions";
import { getUser } from "@netlify/identity";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { userData } from "../../db/schema.js";

export default async (req: Request) => {
  const user = await getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  if (req.method === "GET") {
    const [row] = await db.select().from(userData).where(eq(userData.userId, user.id));
    return Response.json(row ? { data: row.data, updatedAt: row.updatedAt } : { data: null, updatedAt: 0 });
  }

  if (req.method === "PUT") {
    const body = await req.json().catch(() => null);
    if (!body || typeof body.data !== "object" || body.data === null || typeof body.updatedAt !== "number") {
      return new Response("Invalid body", { status: 400 });
    }
    // Last write wins, but never let an older copy overwrite a newer one.
    const [row] = await db.select().from(userData).where(eq(userData.userId, user.id));
    if (row && row.updatedAt > body.updatedAt) {
      return Response.json({ data: row.data, updatedAt: row.updatedAt }, { status: 409 });
    }
    await db
      .insert(userData)
      .values({ userId: user.id, data: body.data, updatedAt: body.updatedAt })
      .onConflictDoUpdate({ target: userData.userId, set: { data: body.data, updatedAt: body.updatedAt } });
    return Response.json({ ok: true, updatedAt: body.updatedAt });
  }

  return new Response("Method not allowed", { status: 405 });
};

export const config: Config = {
  path: "/api/sync",
  method: ["GET", "PUT"],
};
