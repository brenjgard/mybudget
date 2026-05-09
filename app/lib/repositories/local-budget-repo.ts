"use client";

import { localRepo } from "../local-repo";
import type { AppSettings } from "../types";

export const localBudgetRepo = {
  loadSettings(): AppSettings | null {
    return localRepo.loadSettings();
  },

  saveSettings(settings: AppSettings): AppSettings {
    localRepo.saveSettings(settings);
    return settings;
  },
};
