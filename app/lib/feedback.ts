"use client";

import { createClient } from "./supabase/client";

type FeedbackInput = {
  message: string;
  pagePath: string;
  feedbackType?: string;
};

export async function submitFeedback({
  message,
  pagePath,
  feedbackType = "general",
}: FeedbackInput) {
  const supabase = createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    console.error("[Feedback] Could not load current user", userError);
  }

  const { error } = await supabase
    .from("feedback")
    .insert({
      user_id: user?.id ?? null,
      user_email: user?.email ?? null,
      message,
      page_path: pagePath,
      feedback_type: feedbackType,
      status: "new",
    });

  if (error) throw error;
}
