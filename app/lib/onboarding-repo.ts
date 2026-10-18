"use client";
import { createClient } from "./supabase/client";
import { scopedStorageKey } from "./local-storage-scope";
import { parseOnboarding } from "./onboarding-state";
import type { OnboardingState } from "./onboarding-state";

const KEY = "harbor_onboarding";
export async function getOnboardingState() {
  const { data, error } = await createClient().auth.getUser();
  if (error) throw error;
  return data.user ? parseOnboarding(data.user.user_metadata?.[KEY]) : parseOnboarding(JSON.parse(localStorage.getItem(scopedStorageKey(KEY)) ?? "null"));
}
export async function saveOnboardingState(state: OnboardingState) {
  const { data, error } = await createClient().auth.getUser();
  if (error) throw error;
  if (data.user) {
    const result = await createClient().auth.updateUser({ data: { [KEY]: state } });
    if (result.error) throw result.error;
  } else localStorage.setItem(scopedStorageKey(KEY), JSON.stringify(state));
  return state;
}
