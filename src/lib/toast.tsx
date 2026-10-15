import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

type ToastAction = { label: string; onClick: () => void };
type Toast = { id: number; message: string; tone: "info" | "error"; action?: ToastAction; until: number };
type ShowToast = (message: string, opts?: { action?: ToastAction; tone?: Toast["tone"] }) => void;

const ToastContext = createContext<ShowToast>(() => {});
const UNDO_MS = 5000;

function Countdown({ until }: { until: number }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, []);
  return <span className="font-label text-[13px]">{Math.max(0, Math.ceil((until - Date.now()) / 1000))} s</span>;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const show = useCallback<ShowToast>(
    (message, opts) => {
      const id = nextId.current++;
      const ms = opts?.action ? UNDO_MS : 4000;
      setToasts((t) => [...t.slice(-2), { id, message, tone: opts?.tone ?? "info", action: opts?.action, until: Date.now() + ms }]);
      setTimeout(() => dismiss(id), ms);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[84px] z-50 flex flex-col items-center gap-3 px-4 lg:bottom-10"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex max-w-lg items-center gap-5 px-[18px] py-3 text-base lg:text-[17px] ${
              t.tone === "error"
                ? "rotate-1 bg-red text-white shadow-toast"
                : t.action
                  ? "-rotate-1 bg-yellow text-onpaper shadow-toast"
                  : "bg-ink text-paper shadow-[inset_0_0_0_2px_var(--color-paper),var(--shadow-toast)]"
            }`}
          >
            <span className="flex-1">
              {t.tone === "error" && "✕ "}
              {t.message}
            </span>
            {t.action && (
              <>
                <button
                  className="cursor-pointer bg-onpaper px-3.5 py-1.5 font-label text-[15px] text-yellow uppercase"
                  onClick={() => {
                    t.action!.onClick();
                    dismiss(t.id);
                  }}
                >
                  {t.action.label}
                </button>
                <Countdown until={t.until} />
              </>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
