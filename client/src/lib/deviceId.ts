// A random ID persisted in this browser, used only to help detect obvious
// self-referral (same browser signing up twice for referral credits). This
// is NOT true device fingerprinting — it's just a local marker that goes
// away if someone clears their browser storage or uses a different browser.
// Good enough to catch the common case without collecting anything invasive.
const STORAGE_KEY = "mafia_device_id";

export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = (crypto?.randomUUID?.() as string) || Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  } catch {
    // localStorage unavailable (private browsing, etc.) — fall back to a
    // per-session value; referral fraud-checks just get a bit less accurate.
    return "unavailable";
  }
}
