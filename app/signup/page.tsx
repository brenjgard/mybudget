import Link from "next/link";

type SignupPageProps = {
  searchParams?: Promise<{
    error?: string;
  }>;
};

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const params = await searchParams;

  return (
    <main className="flex-1 bg-harbor-offwhite flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-3xl bg-white border border-slate-200 shadow-sm p-8 space-y-6 text-center">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-harbor-navy">Account creation is invite-only</h1>
          <p className="text-sm text-harbor-navy/60">
            Harbor is in private beta. Request access first, then sign in with the email approved for beta access.
          </p>
        </div>

        {params?.error && (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-harbor-red">{params.error}</p>
        )}

        <div className="flex flex-col gap-3">
          <Link
            href="/beta"
            className="rounded-xl bg-harbor-teal px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-harbor-teal/90"
          >
            Request beta access
          </Link>
          <Link
            href="/login?mode=signup"
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-harbor-navy transition-colors hover:border-harbor-teal hover:text-harbor-teal"
          >
            Create approved account
          </Link>
        </div>
      </div>
    </main>
  );
}
