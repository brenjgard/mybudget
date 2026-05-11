import { NextResponse } from "next/server";
import { requestBetaAccess, type BetaAccessRequestResult } from "../../lib/beta-access";

const MESSAGES: Record<BetaAccessRequestResult, string> = {
  requested: "Thanks, you\u2019re on the list.",
  already_requested: "You\u2019re already on the list. We\u2019ll reach out when access is ready.",
  already_approved: "Good news, this email is already approved. You can sign in.",
};

function wantsJson(request: Request) {
  return request.headers.get("accept")?.includes("application/json");
}

function jsonResult(result: BetaAccessRequestResult) {
  return NextResponse.json({ result, message: MESSAGES[result] });
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const name = String(formData.get("name") ?? "");
  const email = String(formData.get("email") ?? "");
  const note = String(formData.get("note") ?? "");

  try {
    const result = await requestBetaAccess({ name, email, note });

    if (wantsJson(request)) {
      return jsonResult(result);
    }

    if (result === "already_approved") {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("message", "Good news, this email is already approved. You can sign in.");
      return NextResponse.redirect(loginUrl, 303);
    }

    if (result === "already_requested") {
      const pendingUrl = new URL("/beta/pending", request.url);
      pendingUrl.searchParams.set("message", "You\u2019re already on the list. We\u2019ll reach out when access is ready.");
      return NextResponse.redirect(pendingUrl, 303);
    }
  } catch (error) {
    if (wantsJson(request)) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Could not submit your request." },
        { status: 400 },
      );
    }

    const betaUrl = new URL("/beta", request.url);
    betaUrl.searchParams.set("error", error instanceof Error ? error.message : "Could not submit your request.");
    return NextResponse.redirect(betaUrl, 303);
  }

  if (wantsJson(request)) {
    return jsonResult("requested");
  }

  return NextResponse.redirect(new URL("/beta/pending", request.url), 303);
}
