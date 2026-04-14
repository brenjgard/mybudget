"use client";

import { useState } from "react";
import { localRepo, type FeedbackType } from "../lib/local-repo";

const TYPE_CONFIG: Record<FeedbackType, { label: string; emoji: string; color: string }> = {
  bug:        { label: "Bug",        emoji: "🐛", color: "text-harbor-red bg-harbor-red/10 border-harbor-red/30" },
  suggestion: { label: "Suggestion", emoji: "💡", color: "text-harbor-teal bg-harbor-teal/10 border-harbor-teal/30" },
  praise:     { label: "Praise",     emoji: "⭐", color: "text-amber-500 bg-amber-50 border-amber-200" },
  other:      { label: "Other",      emoji: "💬", color: "text-slate-500 bg-slate-100 border-slate-200" },
};

export default function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<FeedbackType>("suggestion");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit() {
    if (!message.trim()) return;

    // Save locally
    localRepo.saveFeedback({
      type,
      message: message.trim(),
      email: email.trim(),
      submittedAt: new Date().toISOString(),
    });

    // Open mailto as delivery mechanism
    const subject = encodeURIComponent(`[Harbor Alpha] ${TYPE_CONFIG[type].label}: ${message.slice(0, 60)}${message.length > 60 ? "…" : ""}`);
    const body = encodeURIComponent(
      `Type: ${TYPE_CONFIG[type].label}\n\nFeedback:\n${message.trim()}${email ? `\n\nFrom: ${email}` : ""}\n\n---\nHarbor Alpha Feedback · ${new Date().toLocaleString()}`
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;

    setSubmitted(true);
    setTimeout(() => {
      setOpen(false);
      setSubmitted(false);
      setMessage("");
      setEmail("");
      setType("suggestion");
    }, 2500);
  }

  function handleClose() {
    setOpen(false);
    setSubmitted(false);
    setMessage("");
    setEmail("");
    setType("suggestion");
  }

  return (
    <>
      {/* Floating trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2 bg-harbor-navy text-white px-4 py-2.5 rounded-full shadow-lg hover:bg-harbor-teal transition-colors text-sm font-medium"
        aria-label="Send feedback"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
        </svg>
        Feedback
      </button>

      {/* Modal */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onMouseDown={(e) => { if (e.target === e.currentTarget) handleClose(); }}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-auto flex flex-col">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <div>
                <h2 className="text-harbor-navy font-bold text-lg">Send Feedback</h2>
                <p className="text-harbor-navy/50 text-xs mt-0.5">Alpha · Your input shapes Harbor</p>
              </div>
              <button
                onClick={handleClose}
                className="text-slate-400 hover:text-harbor-navy transition-colors p-1.5 rounded-lg hover:bg-slate-100"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            {submitted ? (
              <div className="px-6 py-10 flex flex-col items-center gap-3 text-center">
                <div className="w-14 h-14 rounded-full bg-harbor-teal-light flex items-center justify-center text-2xl">⚓</div>
                <p className="text-harbor-navy font-bold text-base">Thanks for the feedback!</p>
                <p className="text-harbor-navy/50 text-sm">Your message is anchored. It means a lot during alpha.</p>
              </div>
            ) : (
              <>
                <div className="px-6 py-5 flex flex-col gap-4">

                  {/* Type selector */}
                  <div>
                    <label className="text-harbor-navy/70 text-xs font-medium block mb-2">Type</label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {(Object.keys(TYPE_CONFIG) as FeedbackType[]).map((t) => {
                        const cfg = TYPE_CONFIG[t];
                        return (
                          <button
                            key={t}
                            onClick={() => setType(t)}
                            className={`flex flex-col items-center gap-1 py-2.5 px-2 rounded-xl border text-xs font-medium transition-all ${
                              type === t
                                ? cfg.color + " border-opacity-100"
                                : "text-slate-400 bg-white border-slate-200 hover:border-slate-300"
                            }`}
                          >
                            <span className="text-base">{cfg.emoji}</span>
                            {cfg.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Message */}
                  <div>
                    <label className="text-harbor-navy/70 text-xs font-medium block mb-1.5">
                      {type === "bug" ? "What happened? What did you expect?" : type === "suggestion" ? "What would make Harbor better?" : type === "praise" ? "What do you love?" : "What's on your mind?"}
                    </label>
                    <textarea
                      rows={4}
                      placeholder="Tell us anything…"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-harbor-navy placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-harbor-teal/30 resize-none"
                    />
                  </div>

                  {/* Optional email */}
                  <div>
                    <label className="text-harbor-navy/70 text-xs font-medium block mb-1.5">Your email <span className="text-slate-400 font-normal">(optional — only if you want a reply)</span></label>
                    <input
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-harbor-navy placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-harbor-teal/30"
                    />
                  </div>

                  <p className="text-harbor-navy/35 text-xs">
                    Submitting will open your email client with your feedback pre-filled. Your feedback is also saved locally on this device.
                  </p>
                </div>

                {/* Footer */}
                <div className="px-6 pb-5 flex gap-3">
                  <button
                    onClick={handleClose}
                    className="flex-1 py-2.5 border border-slate-200 rounded-lg text-sm font-medium text-harbor-navy/60 hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={!message.trim()}
                    className="flex-1 py-2.5 bg-harbor-teal text-white rounded-lg text-sm font-medium hover:bg-harbor-teal/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Send Feedback
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
