import { NextResponse } from "next/server";
import { isApprovedBetaUser } from "../../lib/beta-access";
import { createClient } from "../../lib/supabase/server";

export async function POST(request: Request) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  function signupUrlWithError(message: string) {
    const signupUrl = new URL("/login", request.url);
    signupUrl.searchParams.set("mode", "signup");
    signupUrl.searchParams.set("error", message);
    return signupUrl;
  }

  if (password !== confirmPassword) {
    return NextResponse.redirect(signupUrlWithError("Passwords do not match."), 303);
  }

  let isApproved = false;
  try {
    isApproved = await isApprovedBetaUser(email);
  } catch {
    isApproved = false;
  }

  if (!isApproved) {
    return NextResponse.redirect(signupUrlWithError("You\u2019re not approved yet. Request beta access first."), 303);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    return NextResponse.redirect(signupUrlWithError(error.message), 303);
  }

  if (!data.session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("message", "Check your email to confirm your account.");
    return NextResponse.redirect(loginUrl, 303);
  }

  return NextResponse.redirect(new URL("/dashboard", request.url), 303);
}
