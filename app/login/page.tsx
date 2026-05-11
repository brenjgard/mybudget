import AuthAccessForm from "./AuthAccessForm";

type LoginPageProps = {
  searchParams?: Promise<{
    error?: string;
    message?: string;
    mode?: string;
    next?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const next = params?.next && params.next.startsWith("/") ? params.next : "/dashboard";
  const initialMode = params?.mode === "signup" ? "signup" : "signin";

  return (
    <main className="flex-1 bg-harbor-offwhite flex items-center justify-center p-4">
      <AuthAccessForm
        error={params?.error}
        message={params?.message}
        next={next}
        initialMode={initialMode}
      />
    </main>
  );
}
