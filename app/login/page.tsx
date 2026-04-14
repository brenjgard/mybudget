import Link from "next/link";

type LoginPageProps = {
  searchParams?: Promise<{
    error?: string;
    message?: string;
    next?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const next = params?.next && params.next.startsWith("/") ? params.next : "/dashboard";

  return (
    <main className="flex-1 bg-harbor-offwhite flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-3xl bg-white border border-slate-200 shadow-sm p-8 space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-bold text-harbor-navy">Log In</h1>
          <p className="text-sm text-harbor-navy/55">Sign in to access your Harbor.</p>
        </div>

        {params?.error && (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-harbor-red">{params.error}</p>
        )}

        {params?.message && (
          <p className="rounded-xl bg-harbor-teal-light px-4 py-3 text-sm text-harbor-navy">{params.message}</p>
        )}

        <form action="/auth/login" method="post" className="space-y-4">
          <input type="hidden" name="next" value={next} />

          <div>
            <label className="block text-xs text-slate-500 mb-1">Email</label>
            <input
              name="email"
              type="email"
              required
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 focus:outline-none focus:border-harbor-teal"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">Password</label>
            <input
              name="password"
              type="password"
              required
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 focus:outline-none focus:border-harbor-teal"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-xl bg-harbor-teal px-4 py-2.5 text-white font-medium hover:bg-harbor-teal/90 transition-colors"
          >
            Log In
          </button>
        </form>

        <p className="text-sm text-center text-harbor-navy/55">
          Need an account?{" "}
          <Link href="/signup" className="text-harbor-teal font-medium hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </main>
  );
}
