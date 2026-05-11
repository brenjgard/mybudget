import Link from "next/link";

type BetaPendingPageProps = {
  searchParams?: Promise<{
    message?: string;
  }>;
};

export default async function BetaPendingPage({ searchParams }: BetaPendingPageProps) {
  const params = await searchParams;
  const message = params?.message ?? "We\u2019ll reach out when your access is ready.";

  return (
    <main className="flex-1 bg-harbor-offwhite px-4 py-10">
      <div className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col items-center justify-center text-center">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-harbor-teal">Private Beta</p>
          <h1 className="mt-4 text-3xl font-bold text-harbor-navy">Thanks, you&apos;re on the list.</h1>
          <p className="mt-3 text-sm leading-6 text-harbor-navy/60">
            {message}
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <Link
              href="/beta"
              className="rounded-xl bg-harbor-teal px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-harbor-teal/90"
            >
              Back to beta page
            </Link>
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-harbor-navy transition-colors hover:border-harbor-teal hover:text-harbor-teal"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}
