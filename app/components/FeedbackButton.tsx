"use client";

import { useEffect, useState } from "react";
import { submitFeedback } from "../lib/feedback";

export default function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  function resetForm() {
    setMessage("");
    setSaving(false);
    setSubmitted(false);
    setError("");
  }

  function handleClose() {
    setOpen(false);
    resetForm();
  }

  useEffect(() => {
    function openFeedback() {
      setOpen(true);
    }

    window.addEventListener("harbor:open-feedback", openFeedback);
    return () => window.removeEventListener("harbor:open-feedback", openFeedback);
  }, []);

  async function handleSubmit() {
    const trimmed = message.trim();
    if (!trimmed || saving) return;

    setSaving(true);
    setError("");

    try {
      await submitFeedback({
        message: trimmed,
        pagePath: window.location.pathname,
        feedbackType: "general",
      });
      setSubmitted(true);
      setMessage("");
    } catch (submitError) {
      console.error("[Feedback] Failed to submit feedback", submitError);
      setError("Could not send feedback. Please try again in a moment.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-8 right-8 z-30 hidden items-center gap-2 rounded-full bg-harbor-navy px-4 py-2.5 text-sm font-medium text-white shadow-lg transition-colors hover:bg-harbor-teal xl:flex"
          aria-label="Send feedback"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
          </svg>
          Feedback
        </button>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-harbor-navy/45 p-4 backdrop-blur-sm sm:items-center"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) handleClose();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="feedback-title"
            className="w-full max-w-md rounded-2xl border border-harbor-teal-light bg-white shadow-xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
              <div>
                <h2 id="feedback-title" className="text-lg font-bold text-harbor-navy">
                  Send feedback
                </h2>
                <p className="mt-1 text-sm text-harbor-navy/55">
                  Tell us what felt confusing, broken, or helpful.
                </p>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-harbor-navy"
                aria-label="Close feedback form"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {submitted ? (
              <div className="px-6 py-9 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-harbor-teal-light text-harbor-teal">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <p className="font-semibold text-harbor-navy">Thanks for the feedback.</p>
                <p className="mt-1 text-sm text-harbor-navy/55">Your note is saved and helps shape Harbor.</p>
                <button
                  type="button"
                  onClick={handleClose}
                  className="mt-5 rounded-lg bg-harbor-navy px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-harbor-navy/90"
                >
                  Close
                </button>
              </div>
            ) : (
              <>
                <div className="px-6 py-5">
                  <label className="block text-xs font-medium text-harbor-navy/70" htmlFor="feedback-message">
                    Feedback
                  </label>
                  <textarea
                    id="feedback-message"
                    rows={5}
                    placeholder="What should we know?"
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    className="mt-2 w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-harbor-navy placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-harbor-teal/30"
                  />
                  {error && (
                    <p className="mt-3 rounded-lg border border-harbor-red/20 bg-harbor-red/5 px-3 py-2 text-sm text-harbor-red">
                      {error}
                    </p>
                  )}
                </div>

                <div className="flex flex-col-reverse gap-2 px-6 pb-5 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={handleClose}
                    disabled={saving}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-harbor-navy/60 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSubmit()}
                    disabled={!message.trim() || saving}
                    className="rounded-lg bg-harbor-teal px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-harbor-teal/90 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {saving ? "Sending..." : "Send feedback"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
