type SupabaseLikeClient = {
  from: (table: string) => {
    select: (columns: string) => {
      limit: (count: number) => PromiseLike<{
        data: { email?: string | null }[] | null;
        error: { message?: string; code?: string; details?: string } | null;
      }>;
    };
  };
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

  const { data, error } = await supabase
    .from("approved_beta_users")
    .select("email")
    .limit(1000);

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
