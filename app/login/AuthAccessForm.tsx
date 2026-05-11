"use client";

import { useState } from "react";
import Link from "next/link";

type AuthMode = "signin" | "signup";

export default function AuthAccessForm({
  error,
  message,
  next,
  initialMode,
}: {
  error?: string;
  message?: string;
  next: string;
  initialMode: AuthMode;
}) {
  const [mode, setMode] = useState<AuthMode>(initialMode);

  return (
    <div className="w-full max-w-md rounded-3xl bg-white border border-slate-200 shadow-sm p-8 space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-bold text-harbor-navy">
          {mode === "signin" ? "Welcome back to Harbor" : "You\u2019re approved. Create your Harbor account."}
        </h1>
        <p className="text-sm text-harbor-navy/55">
          {mode === "signin"
            ? "Sign in with the email approved for beta access."
            : "Use the approved email from your beta invite."}
        </p>
      </div>

      <div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1">
        <button
          type="button"
          onClick={() => setMode("signin")}
          className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            mode === "signin" ? "bg-white text-harbor-navy shadow-sm" : "text-harbor-navy/55 hover:text-harbor-navy"
          }`}
        >
          Sign In
        </button>
        <button
          type="button"
          onClick={() => setMode("signup")}
          className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            mode === "signup" ? "bg-white text-harbor-navy shadow-sm" : "text-harbor-navy/55 hover:text-harbor-navy"
          }`}
        >
          Create Account
        </button>
      </div>

      {error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-harbor-red">{error}</p>
      )}

      {message && (
        <p className="rounded-xl bg-harbor-teal-light px-4 py-3 text-sm text-harbor-navy">{message}</p>
      )}

      {mode === "signin" ? (
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
            Sign In
          </button>
        </form>
      ) : (
        <form action="/auth/signup" method="post" className="space-y-4">
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
              minLength={6}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 focus:outline-none focus:border-harbor-teal"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">Confirm Password</label>
            <input
              name="confirmPassword"
              type="password"
              required
              minLength={6}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 focus:outline-none focus:border-harbor-teal"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-xl bg-harbor-teal px-4 py-2.5 text-white font-medium hover:bg-harbor-teal/90 transition-colors"
          >
            Create Account
          </button>
        </form>
      )}

      <p className="text-sm text-center text-harbor-navy/55">
        Need access?{" "}
        <Link href="/beta" className="text-harbor-teal font-medium hover:underline">
          Request beta access
        </Link>
      </p>
    </div>
  );
}
