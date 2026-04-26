import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { env } from "@/lib/env";
import { getSession } from "@/lib/auth";

const Body = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const { username, password } = parsed.data;

  if (username !== env.AUTH_USERNAME) {
    return NextResponse.json({ error: "invalid credentials" }, { status: 401 });
  }
  const ok = await bcrypt.compare(password, env.AUTH_PASSWORD_HASH);
  if (!ok) {
    return NextResponse.json({ error: "invalid credentials" }, { status: 401 });
  }

  const session = await getSession();
  session.user = { username, loggedInAt: Date.now() };
  await session.save();
  return NextResponse.json({ ok: true });
}
