import { NextResponse } from "next/server";
import { getSupabaseProjectHost, isApprovedBetaUserWithClient, normalizeEmail } from "../../lib/beta-access-core";
import { createClient } from "../../lib/supabase/server";

function getNextPath(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.startsWith("/")) {
    return "/dashboard";
  }

  if (value === "/beta" || value === "/beta/pending" || value.startsWith("/login") || value.startsWith("/signup")) {
    return "/dashboard";
  }

  return value;
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = getNextPath(formData.get("next"));

  const cookieResponse = NextResponse.next();
  const supabase = await createClient(cookieResponse);
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  function redirectWithAuthCookies(url: URL) {
    const response = NextResponse.redirect(url, 303);
    cookieResponse.cookies.getAll().forEach((cookie) => {
      response.cookies.set(cookie);
    });
    return response;
  }

  if (error) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", error.message);
    loginUrl.searchParams.set("next", next);
    console.info("[beta-login]", {
      host: request.headers.get("host"),
      supabaseHost: getSupabaseProjectHost(),
      email: normalizeEmail(email),
      signedIn: false,
      error: error.message,
      redirect: "/login",
    });
    return redirectWithAuthCookies(loginUrl);
  }

  const approval = await isApprovedBetaUserWithClient(supabase, email);
  const isApproved = approval.approved && !approval.error;
  const redirectPath = isApproved ? next : "/beta/pending";

  console.info("[beta-login]", {
    host: request.headers.get("host"),
    supabaseHost: getSupabaseProjectHost(),
    email: approval.normalizedEmail,
    signedIn: true,
    approved: isApproved,
    approvedRowsVisible: approval.count,
    approvalError: approval.error?.message ?? null,
    redirect: redirectPath,
  });

  if (!isApproved) {
    return redirectWithAuthCookies(new URL("/beta/pending", request.url));
  }

  return redirectWithAuthCookies(new URL(next, request.url));
}
