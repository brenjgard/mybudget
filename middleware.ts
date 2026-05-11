import { NextResponse, type NextRequest } from "next/server";
import { isApprovedBetaUserWithClient } from "./app/lib/beta-access";
import { updateSession } from "./app/lib/supabase/middleware";

const PUBLIC_PATHS = ["/beta", "/beta/pending", "/login", "/signup"];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.includes(pathname) || pathname.startsWith("/auth/");
}

function isAuthEntryPath(pathname: string) {
  return PUBLIC_PATHS.includes(pathname);
}

function withCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie);
  });

  return to;
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const { response, user, supabase } = await updateSession(request);
  const isPublic = isPublicPath(pathname);
  const isAuthEntry = isAuthEntryPath(pathname);

  if (!user && !isPublic) {
    const betaUrl = new URL("/beta", request.url);
    betaUrl.searchParams.set("next", `${pathname}${search}`);
    return withCookies(response, NextResponse.redirect(betaUrl));
  }

  if (user) {
    const email = user.email?.trim().toLowerCase();
    let isApproved = false;

    try {
      isApproved = email ? await isApprovedBetaUserWithClient(supabase, email) : false;
    } catch {
      isApproved = false;
    }

    if (!isApproved && pathname !== "/beta/pending" && !pathname.startsWith("/auth/")) {
      return withCookies(response, NextResponse.redirect(new URL("/beta/pending", request.url)));
    }

    if (isApproved && (isAuthEntry || pathname === "/beta" || pathname === "/beta/pending")) {
      return withCookies(response, NextResponse.redirect(new URL("/dashboard", request.url)));
    }
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
