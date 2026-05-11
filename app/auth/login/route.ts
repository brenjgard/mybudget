import { NextResponse } from "next/server";
import { isApprovedBetaUserWithClient } from "../../lib/beta-access";
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

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", error.message);
    loginUrl.searchParams.set("next", next);
    return NextResponse.redirect(loginUrl, 303);
  }

  let isApproved = false;
  try {
    isApproved = await isApprovedBetaUserWithClient(supabase, email);
  } catch {
    isApproved = false;
  }

  if (!isApproved) {
    return NextResponse.redirect(new URL("/beta/pending", request.url), 303);
  }

  return NextResponse.redirect(new URL(next, request.url), 303);
}
