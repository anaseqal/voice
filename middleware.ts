import { NextRequest, NextResponse } from "next/server";

const PUBLIC = new Set<string>([
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/health",
  "/favicon.ico",
]);

const PUBLIC_PREFIXES = [
  "/api/callbacks/",
  "/api/files/",
  // Public-facing alias for /api/files/. Middleware runs before rewrites,
  // so without this the worker (and any external fetcher) gets redirected
  // to /login when downloading uploads/outputs/avatars.
  "/files/",
  // Worker-only admin endpoints (auth'd via CALLBACK_BEARER_TOKEN, not
  // session cookie).
  "/api/admin/",
  "/_next/",
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC.has(pathname) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const cookie = req.cookies.get("voice_session");
  if (!cookie) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
