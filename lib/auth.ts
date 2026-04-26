import { cookies } from "next/headers";
import { getIronSession, type SessionOptions } from "iron-session";
import { redirect } from "next/navigation";
import { env } from "./env";

export type Session = {
  user?: { username: string; loggedInAt: number };
};

export const sessionOptions: SessionOptions = {
  password: env.SESSION_PASSWORD,
  cookieName: "voice_session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  },
};

export async function getSession() {
  return getIronSession<Session>(await cookies(), sessionOptions);
}

export async function requireSession(): Promise<NonNullable<Session["user"]>> {
  const session = await getSession();
  if (!session.user) redirect("/login");
  return session.user;
}

export async function requireSessionOrJson(): Promise<
  NonNullable<Session["user"]> | Response
> {
  const session = await getSession();
  if (!session.user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  return session.user;
}
