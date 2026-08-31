"use client";

import { useState } from "react";
import type { AppUser } from "@/lib/types";
import SettingsPanel from "./SettingsPanel";
import { useLang } from "./LangContext";

interface ProfileDrawerProps {
  open: boolean;
  user: AppUser;
  view: "profile" | "settings";
  onViewChange: (view: "profile" | "settings") => void;
  onClose: () => void;
  onLogout: () => void;
  onOpenMyProfile: () => void;
}

function isTrial(trialEnd: string, now: number): boolean {
  const end = new Date(trialEnd).getTime();
  const in7 = now + 7 * 24 * 60 * 60 * 1000;
  return end > now && end <= in7;
}

export default function ProfileDrawer({
  open,
  user,
  view,
  onViewChange,
  onClose,
  onLogout,
  onOpenMyProfile,
}: ProfileDrawerProps) {
  const [now] = useState(() => Date.now());
  const { t } = useLang();
  const trial = isTrial(user.trialEnd, now);
  const planLabel = "Individual";
  const daysLeft = Math.max(
    0,
    Math.ceil((new Date(user.trialEnd).getTime() - now) / 86400000),
  );
  const initials = user.contactoNombre
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  function handleClose() {
    onClose();
    // pequeño delay para que no se vea el salto de vista durante la
    // animación de cierre del drawer
    setTimeout(() => onViewChange("profile"), 200);
  }

  return (
    <>
      <div
        onClick={handleClose}
        className={`fixed inset-0 bg-black/[.34] z-[8000] transition-opacity ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      />
      <div
        className={`fixed top-0 right-0 h-full w-full max-w-[380px] bg-ys-card border-l border-ys-border z-[8001] flex flex-col shadow-[var(--shadow-modal)] transition-transform duration-200 ease-[cubic-bezier(.4,0,.2,1)] ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="px-5 pt-5 pb-4 border-b border-ys-border-soft flex items-start gap-3">
          <div className="w-11 h-11 rounded-full bg-ys-green-bg text-ys-green-text text-sm font-extrabold flex items-center justify-center flex-shrink-0">
            {initials || "?"}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-extrabold text-ys-text truncate">
              {user.contactoNombre}
            </div>
            <div className="text-[12.5px] text-ys-muted font-medium mt-0.5 truncate">
              {user.contactoEmail}
            </div>
            {user.ventasTel && (
              <div className="font-mono text-[11.5px] text-ys-dim mt-0.5 truncate">
                {user.ventasTel}
              </div>
            )}
          </div>
          <button
            onClick={handleClose}
            className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-ys-dimmer hover:bg-ys-el2 hover:text-ys-text transition-colors cursor-pointer text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
          {view === "settings" ? (
            <SettingsPanel onBack={() => onViewChange("profile")} />
          ) : (
            <>
              <div className="flex flex-col gap-1.5">
                <div className="text-[11px] font-extrabold tracking-[0.06em] uppercase text-ys-dimmer">
                  {t("profile_subscription")}
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full text-[12px] font-bold px-3 py-1.5 bg-ys-green-bg text-ys-green-text">
                    {trial ? "Trial · " : ""}
                    {planLabel}
                  </span>
                  {!trial && (
                    <span className="text-xs text-ys-muted font-semibold">
                      {t("profile_active")}
                    </span>
                  )}
                </div>
              </div>

              {trial && (
                <div className="flex gap-2.5">
                  <div className="rounded-xl border border-ys-border bg-[#fbfcfb] px-3.5 py-3 text-center flex-none">
                    <div className="font-mono text-2xl font-medium text-ys-green leading-none">
                      {daysLeft}
                    </div>
                    <div className="text-[11px] text-ys-dim font-semibold mt-1.5 whitespace-nowrap">
                      {t("profile_days_left")}
                    </div>
                  </div>
                  <div className="rounded-xl border border-ys-border bg-[#fbfcfb] px-3.5 py-3 flex flex-col justify-center">
                    <div className="text-[12.5px] text-ys-muted font-medium leading-[1.45]">
                      {t("profile_trial_cta")}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-0.5 border-t border-ys-border-softest pt-3.5">
                <button
                  onClick={onOpenMyProfile}
                  className="flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg text-[13.5px] font-semibold text-[#3f4844] cursor-pointer hover:bg-ys-el2 transition-colors text-left w-full"
                >
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="5.5" r="2.6" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M3 13.5c0-2.4 2.2-3.8 5-3.8s5 1.4 5 3.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  {t("profile_my_profile")}
                </button>
                <div className="flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg text-[13.5px] font-semibold text-[#3f4844] cursor-not-allowed opacity-60">
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M8 1.8v1.6M8 12.6v1.6M2.2 8h1.6M12.2 8h1.6M4 4l1.1 1.1M10.9 10.9 12 12M12 4l-1.1 1.1M5.1 10.9 4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  {t("profile_settings")}
                </div>
              </div>
            </>
          )}
        </div>

        {view === "profile" && (
          <div className="px-5 py-3.5 border-t border-ys-border-soft">
            <button
              onClick={onLogout}
              className="w-full flex items-center justify-center gap-2 text-[13.5px] font-bold text-ys-orange border border-ys-border rounded-[10px] py-2.5 cursor-pointer transition-colors hover:bg-ys-warn-bg"
            >
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                <path d="M6.5 2.5H4a1.5 1.5 0 0 0-1.5 1.5v8A1.5 1.5 0 0 0 4 13.5h2.5M10 5l3 3-3 3M13 8H6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {t("nav_logout")}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
