export type SupabaseLikeClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => PromiseLike<{
          data: { email?: string | null } | null;
          error: { message?: string; code?: string; details?: string } | null;
        }>;
      };
      limit: (count: number) => PromiseLike<{
        data: { email?: string | null }[] | null;
        error: { message?: string; code?: string; details?: string } | null;
      }>;
    };
  };
  rpc?: (fn: string, args: { candidate_email: string }) => PromiseLike<{
    data: boolean | null;
    error: { message?: string; code?: string; details?: string } | null;
  }>;
};

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function getSupabaseProjectHost() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return "missing";

  try {
    return new URL(url).host;
  } catch {
    return "invalid";
  }
}

export async function isApprovedBetaUserWithClient(supabase: SupabaseLikeClient, email: string) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return { approved: false, normalizedEmail, count: 0, error: null };
  }

  const table = "approved_beta_users";

  if (process.env.NODE_ENV === "development") {
    console.info("[beta-approval-check]", {
      normalizedEmail,
      table,
      supabaseHost: getSupabaseProjectHost(),
    });
  }

  const exactResult = await supabase
    .from(table)
    .select("email")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (process.env.NODE_ENV === "development") {
    console.info("[beta-approval-check:exact-result]", {
      normalizedEmail,
      table,
      data: exactResult.data,
      error: exactResult.error,
    });
  }

  const rpcResult = supabase.rpc
    ? await supabase.rpc("is_approved_beta_email", { candidate_email: normalizedEmail })
    : null;

  if (process.env.NODE_ENV === "development") {
    console.info("[beta-approval-check:rpc-result]", {
      normalizedEmail,
      function: "is_approved_beta_email",
      data: rpcResult?.data ?? null,
      error: rpcResult?.error ?? null,
    });
  }

  if (rpcResult && !rpcResult.error && rpcResult.data === true) {
    return { approved: true, normalizedEmail, count: 1, error: null };
  }

  if (exactResult.error) {
    return { approved: false, normalizedEmail, count: 0, error: exactResult.error };
  }

  if (exactResult.data?.email) {
    return { approved: true, normalizedEmail, count: 1, error: null };
  }

  // Fallback catches legacy rows with mixed case or accidental whitespace.
  const { data, error } = await supabase
    .from(table)
    .select("email")
    .limit(1000);

  if (process.env.NODE_ENV === "development") {
    console.info("[beta-approval-check:fallback-result]", {
      normalizedEmail,
      table,
      count: data?.length ?? 0,
      error,
    });
  }

  if (error) {
    return { approved: false, normalizedEmail, count: 0, error };
  }

  const rows = data ?? [];
  const approved = rows.some((user) => normalizeEmail(String(user.email ?? "")) === normalizedEmail);
  return { approved, normalizedEmail, count: rows.length, error: null };
}

export function isDuplicateEmailError(error: { code?: string; message?: string; details?: string }) {
  const text = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  return error.code === "23505" || text.includes("duplicate key") || text.includes("beta_access_requests_email_unique");
}
