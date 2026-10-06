// Confirmation toast that rises from the bottom edge (DESIGN.md, motion #6).
import { useCallback, useEffect, useState } from "react";
import { Icon } from "./Icon";

export function useToast(durationMs = 4000) {
  const [message, setMessage] = useState<string | null>(null);
  const [key, setKey] = useState(0);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), durationMs);
    return () => clearTimeout(timer);
  }, [message, key, durationMs]);

  const show = useCallback((text: string) => {
    setMessage(text);
    setKey((k) => k + 1);
  }, []);

  const toast = message ? (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex justify-center px-5" role="status" aria-live="polite">
      <div
        key={key}
        className="toast-in flex items-center gap-2.5 rounded-md bg-ink px-5 py-3.5 font-bold text-foam"
        style={{ boxShadow: "0 12px 28px -10px rgba(13, 46, 66, 0.5)" }}
      >
        <Icon name="check" />
        {message}
      </div>
    </div>
  ) : null;

  return { show, toast };
}
