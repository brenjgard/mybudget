"use client";

import { useState } from "react";
import Link from "next/link";

type RequestResult = "requested" | "already_requested" | "already_approved";

type RequestResponse = {
  result?: RequestResult;
  message?: string;
  error?: string;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export default function BetaRequestForm({ initialError }: { initialError?: string }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState(initialError ?? "");
  const [messageKind, setMessageKind] = useState<"success" | "error">(initialError ? "error" : "success");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lockedEmail, setLockedEmail] = useState("");

  const normalizedEmail = normalizeEmail(email);
  const isLocked = Boolean(lockedEmail) && normalizedEmail === lockedEmail;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isLocked) return;

    setIsSubmitting(true);
    setMessage("");

    const formData = new FormData();
    formData.set("name", name);
    formData.set("email", normalizedEmail);
    formData.set("note", note);

    try {
      const response = await fetch("/auth/beta-request", {
        method: "POST",
        headers: { Accept: "application/json" },
        body: formData,
      });
      const payload = (await response.json()) as RequestResponse;

      if (!response.ok || payload.error) {
        setMessageKind("error");
        setMessage(payload.error ?? "Could not submit your request.");
        return;
      }

      setMessageKind("success");
      setMessage(payload.message ?? "Thanks, you\u2019re on the list.");
      setLockedEmail(normalizedEmail);
    } catch (error) {
      setMessageKind("error");
      setMessage(error instanceof Error ? error.message : "Could not submit your request.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleEmailChange(value: string) {
    setEmail(value);
    if (normalizeEmail(value) !== lockedEmail) {
      setMessage("");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {message && (
        <div
          className={`rounded-xl px-4 py-3 text-sm ${
            messageKind === "error" ? "bg-red-50 text-harbor-red" : "bg-harbor-teal-light text-harbor-navy"
          }`}
        >
          <p>{message}</p>
          {message.includes("already approved") && (
            <Link href="/login" className="mt-2 inline-block font-semibold text-harbor-teal hover:underline">
              Sign in
            </Link>
          )}
        </div>
      )}

      <div>
        <label className="mb-1 block text-xs text-slate-500">Name</label>
        <input
          name="name"
          type="text"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-harbor-navy focus:border-harbor-teal focus:outline-none"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs text-slate-500">Email</label>
        <input
          name="email"
          type="email"
          required
          value={email}
          onChange={(event) => handleEmailChange(event.target.value)}
          className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-harbor-navy focus:border-harbor-teal focus:outline-none"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs text-slate-500">Note</label>
        <textarea
          name="note"
          rows={4}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-harbor-navy focus:border-harbor-teal focus:outline-none"
        />
      </div>

      <button
        type="submit"
        disabled={isSubmitting || isLocked}
        className="w-full rounded-xl bg-harbor-teal px-4 py-2.5 font-medium text-white transition-colors hover:bg-harbor-teal/90 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {isSubmitting ? "Submitting..." : isLocked ? "Request received" : "Request Beta Access"}
      </button>
    </form>
  );
}
