"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";

type ToastKind = "success" | "error" | "info";
interface Toast { id: number; kind: ToastKind; message: string; }
interface ToastCtx { toast: (message: string, kind?: ToastKind) => void; }

const Ctx = createContext<ToastCtx>({ toast: () => {} });
let _id = 0;

const ICON = { success: CheckCircle2, error: AlertTriangle, info: Info };
const COLOR = { success: "var(--color-success)", error: "var(--color-danger)", info: "var(--color-info)" };

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const toast = useCallback(
    (message: string, kind: ToastKind = "success") => {
      const id = ++_id;
      setToasts((t) => [...t, { id, kind, message }]);
      setTimeout(() => remove(id), 3500);
    },
    [remove]
  );

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div className="no-print pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col gap-2" aria-live="polite" aria-atomic="false">
        {toasts.map((t) => {
          const Icon = ICON[t.kind];
          return (
            <div key={t.id} className="glass animate-scale-in pointer-events-auto flex items-center gap-2 rounded-lg px-3 py-2 text-sm shadow-md" role="status">
              <Icon size={16} style={{ color: COLOR[t.kind] }} />
              <span className="text-text">{t.message}</span>
              <button onClick={() => remove(t.id)} aria-label="Dismiss" className="ml-1 text-text-muted hover:text-text">
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() { return useContext(Ctx); }
