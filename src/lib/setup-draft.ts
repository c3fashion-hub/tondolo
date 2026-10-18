import type { SetupDraft } from "./setup.ts";

// Until sign-in exists (stage 2), the setup answers wait on this phone only, then are cleared once the wedding is saved.
const KEY = "tondolo.setupDraft.v1";

export function saveSetupDraft(draft: SetupDraft): void {
  try { localStorage.setItem(KEY, JSON.stringify(draft)); } catch { /* private mode: carry on without it */ }
}

export function loadSetupDraft(): SetupDraft | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SetupDraft) : null;
  } catch {
    return null;
  }
}

export function clearSetupDraft(): void {
  try { localStorage.removeItem(KEY); } catch { /* nothing to clear */ }
}
