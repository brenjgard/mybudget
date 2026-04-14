import { NextResponse } from "next/server";
import { createClient } from "../../lib/supabase/server";

export async function POST(request: Request) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    const signupUrl = new URL("/signup", request.url);
    signupUrl.searchParams.set("error", error.message);
    return NextResponse.redirect(signupUrl);
  }

  if (!data.session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("message", "Check your email to confirm your account.");
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.redirect(new URL("/dashboard", request.url));
}
