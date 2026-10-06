// Small per-phone settings (language, chosen barangay, storage taps) in localStorage.
// Every read and write is guarded: private windows can throw, and the app must still render.
const PREFIX = "tp.";
const listeners = new Set<() => void>();

export function readSetting(key: string): string | null {
  try {
    return localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

export function writeSetting(key: string, value: string) {
  try {
    localStorage.setItem(PREFIX + key, value);
  } catch {
    // Storage blocked: the choice lasts for this visit only.
  }
  listeners.forEach((notify) => notify());
}

export function subscribeSetting(notify: () => void) {
  listeners.add(notify);
  const onStorage = (event: StorageEvent) => {
    if (event.key?.startsWith(PREFIX)) notify();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(notify);
    window.removeEventListener("storage", onStorage);
  };
}
