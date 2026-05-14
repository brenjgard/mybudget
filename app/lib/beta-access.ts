import { createClient } from "./supabase/server";
import { createAdminClient } from "./supabase/admin";
import {
  isApprovedBetaUserWithClient,
  isDuplicateEmailError,
  normalizeEmail,
  type SupabaseLikeClient,
} from "./beta-access-core";

type BetaAccessRequest = {
  name: string;
  email: string;
  note?: string;
};

export type BetaAccessRequestResult = "requested" | "already_requested" | "already_approved";

export async function isApprovedBetaUser(email: string) {
  const supabase = createAdminClient() ?? await createClient();
  const result = await isApprovedBetaUserWithClient(supabase as unknown as SupabaseLikeClient, email);
  if (result.error) throw result.error;
  return result.approved;
}

export async function requestBetaAccess({ name, email, note }: BetaAccessRequest): Promise<BetaAccessRequestResult> {
  const normalizedEmail = normalizeEmail(email);
  if (!name.trim() || !normalizedEmail) {
    throw new Error("Name and email are required.");
  }

  const supabase = createAdminClient() ?? await createClient();

  const approval = await isApprovedBetaUserWithClient(supabase as unknown as SupabaseLikeClient, normalizedEmail);
  if (approval.error) throw approval.error;
  if (approval.approved) {
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
