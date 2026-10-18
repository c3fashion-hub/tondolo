import type { SetupDraft } from "./setup.ts";

// Until sign-in exists (stage 2), the setup answers wait on this phone only.
const KEY = "tondolo.setupDraft.v1";

export function saveSetupDraft(draft: SetupDraft): void {
  try { sessionStorage.setItem(KEY, JSON.stringify(draft)); } catch { /* private mode: carry on without it */ }
}

export function loadSetupDraft(): SetupDraft | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SetupDraft) : null;
  } catch {
    return null;
  }
}
