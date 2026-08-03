"use client";

import type { AppUser } from "@/lib/types";

interface ProfileDrawerProps {
  open: boolean;
  user: AppUser;
  onClose: () => void;
  onLogout: () => void;
}

const PLAN_LABELS: Record<string, string> = {
  starter: "Starter",
  pro: "Pro",
  uso: "Por mensaje",
};

const PLAN_STYLES: Record<string, string> = {
  starter: "bg-[rgba(59,130,246,.1)] border-[rgba(59,130,246,.3)] text-[#60a5fa]",
  pro: "bg-[rgba(168,85,247,.1)] border-[rgba(168,85,247,.3)] text-[#c084fc]",
  uso: "bg-[rgba(251,191,36,.1)] border-[rgba(251,191,36,.3)] text-[#fbbf24]",
};

function isTrial(trialEnd: string): boolean {
  const end = new Date(trialEnd);
  const now = new Date();
  const in7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  return end > now && end <= in7;
}

export default function ProfileDrawer({
  open,
  user,
  onClose,
  onLogout,
}: ProfileDrawerProps) {
  const trial = isTrial(user.trialEnd);
  const planLabel = PLAN_LABELS[user.plan] || user.plan;
  const planStyle = trial
    ? "bg-ys-green-bg border-[rgba(34,197,94,.3)] text-ys-green"
    : PLAN_STYLES[user.plan];

  const daysLeft = Math.max(
    0,
    Math.ceil((new Date(user.trialEnd).getTime() - Date.now()) / 86400000),
  );

  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 bg-black/50 backdrop-blur-[2px] z-[8000] transition-opacity ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      />
      <div
        className={`fixed top-0 right-0 h-full w-[380px] bg-ys-card border-l border-ys-border2 z-[8001] flex flex-col transition-transform duration-200 ease-[cubic-bezier(.4,0,.2,1)] ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="px-[18px] pt-3.5 pb-3 border-b border-ys-border flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-ys-red-bg border-[1.5px] border-[rgba(255,61,61,.3)] flex items-center justify-center text-base flex-shrink-0">
            👤
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-display text-[15px] font-bold truncate">
              {user.contactoNombre}
            </div>
            <div className="text-[11px] text-ys-muted mt-px truncate">
              {user.contactoEmail}
            </div>
            {user.ventasTel && (
              <div className="text-[11px] text-ys-dim mt-px">
                📱 {user.ventasTel}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 text-ys-muted hover:bg-ys-el hover:text-ys-text rounded-md p-1 transition-colors cursor-pointer"
          >
            <svg
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-[18px] pb-4">
          <div className="pt-3">
            <div className="text-[9px] font-semibold text-ys-dim uppercase tracking-[0.6px] mb-1.5">
              Suscripción
            </div>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold font-display ${planStyle}`}
            >
              {trial ? "⏳ Trial · " : ""}
              {planLabel}
            </span>
            <div className="text-xs text-ys-muted mt-2">
              {!trial && "✓ Activo"}
            </div>
          </div>

          {trial && (
            <div className="pt-3">
              <div className="flex gap-2 mb-4">
                <div className="rounded-lg border border-ys-border bg-ys-el px-2.5 py-2.5 text-center flex-none">
                  <div className="font-display text-[30px] font-bold text-ys-green leading-none">
                    {daysLeft}
                  </div>
                  <div className="text-[11px] text-ys-muted mt-[3px]">
                    días restantes
                  </div>
                </div>
                <div className="rounded-lg border border-ys-border bg-ys-el px-2.5 py-2.5 flex flex-col justify-center">
                  <div className="text-[11px] text-ys-muted">
                    Elegí tu plan para continuar con acceso completo.
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="px-[18px] py-2.5 border-t border-ys-border">
          <button
            onClick={onLogout}
            className="w-full rounded-lg border border-[rgba(255,61,61,.2)] text-ys-muted py-2.5 text-[13px] flex items-center justify-center gap-2 hover:bg-ys-red-bg hover:text-ys-red hover:border-[rgba(255,61,61,.4)] transition-colors cursor-pointer"
          >
            <svg
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Cerrar sesión
          </button>
        </div>
      </div>
    </>
  );
}
