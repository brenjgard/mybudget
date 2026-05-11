import Link from "next/link";
import BetaRequestForm from "./BetaRequestForm";

type BetaPageProps = {
  searchParams?: Promise<{
    error?: string;
  }>;
};

export default async function BetaPage({ searchParams }: BetaPageProps) {
  const params = await searchParams;

  return (
    <main className="flex-1 bg-harbor-offwhite px-4 py-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 md:grid md:grid-cols-[1fr_420px] md:items-center">
        <section className="space-y-6">
          <div className="space-y-4">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-harbor-teal">Private Beta</p>
            <h1 className="max-w-2xl text-4xl font-bold leading-tight text-harbor-navy md:text-5xl">
              Harbor is in private beta
            </h1>
            <p className="max-w-xl text-base leading-7 text-harbor-navy/65">
              A calmer way to see your money week by week. We&apos;re inviting a small group of early testers while we shape the experience.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-harbor-navy transition-colors hover:border-harbor-teal hover:text-harbor-teal"
            >
              I already have access
            </Link>
          </div>
        </section>

        <section id="request-access" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5">
            <h2 className="text-lg font-bold text-harbor-navy">Request beta access</h2>
            <p className="mt-1 text-sm text-harbor-navy/55">Tell us where to send your invite.</p>
          </div>

          <BetaRequestForm initialError={params?.error} />
        </section>
      </div>
    </main>
  );
}
