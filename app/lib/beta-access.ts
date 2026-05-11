import { createClient } from "./supabase/server";

type BetaAccessClient = Awaited<ReturnType<typeof createClient>>;

type BetaAccessRequest = {
  name: string;
  email: string;
  note?: string;
};

export type BetaAccessRequestResult = "requested" | "already_requested" | "already_approved";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isDuplicateEmailError(error: { code?: string; message?: string; details?: string }) {
  const text = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  return error.code === "23505" || text.includes("duplicate key") || text.includes("beta_access_requests_email_unique");
}

export async function isApprovedBetaUserWithClient(supabase: Pick<BetaAccessClient, "from">, email: string) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return false;

  const { data, error } = await supabase
    .from("approved_beta_users")
    .select("email")
    .limit(1000);

  if (error) throw error;
  return (data ?? []).some((user) => normalizeEmail(String(user.email ?? "")) === normalizedEmail);
}

export async function isApprovedBetaUser(email: string) {
  const supabase = await createClient();
  return isApprovedBetaUserWithClient(supabase, email);
}

export async function requestBetaAccess({ name, email, note }: BetaAccessRequest): Promise<BetaAccessRequestResult> {
  const normalizedEmail = normalizeEmail(email);
  if (!name.trim() || !normalizedEmail) {
    throw new Error("Name and email are required.");
  }

  const supabase = await createClient();

  if (await isApprovedBetaUserWithClient(supabase, normalizedEmail)) {
    return "already_approved";
  }

  const { data: existingRequests, error: existingRequestError } = await supabase
    .from("beta_access_requests")
    .select("email")
    .limit(1000);

  if (existingRequestError) throw existingRequestError;
  if ((existingRequests ?? []).some((request) => normalizeEmail(String(request.email ?? "")) === normalizedEmail)) {
    return "already_requested";
  }

  const { error } = await supabase
    .from("beta_access_requests")
    .insert({
      name: name.trim(),
      email: normalizedEmail,
      note: note?.trim() || null,
    });

  if (error) {
    if (isDuplicateEmailError(error)) return "already_requested";
    throw error;
  }

  return "requested";
}
