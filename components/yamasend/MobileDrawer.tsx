"use client";

import Image from "next/image";
import type { AppSection } from "@/lib/types";
import { useLang } from "./LangContext";

interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
  active: AppSection;
  onNavigate: (section: AppSection) => void;
  userName: string;
  planLabel: string;
  onLogout: () => void;
}

const NAV_ITEMS: { key: AppSection; labelKey: "nav_dashboard" | "nav_contacts" | "nav_groups" | "nav_templates" | "nav_campaigns" | "nav_ai"; icon: (color: string) => React.ReactNode }[] = [
  {
    key: "dashboard",
    labelKey: "nav_dashboard",
    icon: (c) => (
      <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
        <rect x="2" y="2" width="5" height="5" rx="1.5" stroke={c} strokeWidth="1.5" />
        <rect x="9" y="2" width="5" height="5" rx="1.5" stroke={c} strokeWidth="1.5" />
        <rect x="2" y="9" width="5" height="5" rx="1.5" stroke={c} strokeWidth="1.5" />
        <rect x="9" y="9" width="5" height="5" rx="1.5" stroke={c} strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    key: "contactos",
    labelKey: "nav_contacts",
    icon: (c) => (
      <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
        <circle cx="6" cy="5.5" r="2.5" stroke={c} strokeWidth="1.5" />
        <path d="M2 13.5c0-2.2 1.8-3.5 4-3.5s4 1.3 4 3.5" stroke={c} strokeWidth="1.5" strokeLinecap="round" />
        <path d="M11 4.2a2.5 2.5 0 0 1 0 4.6M12.5 13.5c0-1.5-.5-2.6-1.4-3.2" stroke={c} strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    key: "grupos",
    labelKey: "nav_groups",
    icon: (c) => (
      <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
        <circle cx="5.2" cy="6" r="2.2" stroke={c} strokeWidth="1.5" />
        <circle cx="10.8" cy="6" r="2.2" stroke={c} strokeWidth="1.5" />
        <path d="M1.8 13c0-1.9 1.5-3 3.4-3s3.4 1.1 3.4 3M7.4 13c0-1.9 1.5-3 3.4-3s3.4 1.1 3.4 3" stroke={c} strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    key: "templates",
    labelKey: "nav_templates",
    icon: (c) => (
      <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
        <rect x="2.5" y="2.5" width="11" height="11" rx="2" stroke={c} strokeWidth="1.5" />
        <path d="M2.5 6h11M6 6v7.5" stroke={c} strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    key: "campanas",
    labelKey: "nav_campaigns",
    icon: (c) => (
      <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
        <path d="M2.5 6.5v3l7 3.5v-10l-7 3.5Z" stroke={c} strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M12 6v4" stroke={c} strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    key: "ia",
    labelKey: "nav_ai",
    icon: (c) => (
      <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
        <path d="m8 2 1.6 3.6L13 7l-3.4 1.4L8 12 6.4 8.4 3 7l3.4-1.4L8 2Z" stroke={c} strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
    ),
  },
];

export default function MobileDrawer({
  open,
  onClose,
  active,
  onNavigate,
  userName,
  planLabel,
  onLogout,
}: MobileDrawerProps) {
  const { t } = useLang();
  const initials = userName
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[90] bg-black/40"
      style={{ animation: "ys-fade .16s ease both" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[85%] max-w-[320px] h-[100dvh] bg-ys-card border-r border-ys-border-softest flex flex-col gap-[18px] overflow-auto"
        style={{
          padding:
            "calc(16px + env(safe-area-inset-top)) 14px calc(16px + env(safe-area-inset-bottom))",
          animation: "ys-drawer .2s cubic-bezier(.4,0,.2,1) both",
        }}
      >
        <div className="flex items-center gap-2.5">
          <Image
            src="/brand/logo-sidebar.png"
            alt="YamaSend"
            width={160}
            height={64}
            className="h-[30px] w-auto max-w-[160px] object-contain"
          />
          <button
            onClick={onClose}
            aria-label="Cerrar menú"
            className="ml-auto w-11 h-11 rounded-[11px] flex items-center justify-center cursor-pointer"
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="#535b56" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="flex flex-col gap-[3px]">
          {NAV_ITEMS.map((item) => {
            const isActive = active === item.key;
            return (
              <button
                key={item.key}
                onClick={() => {
                  onNavigate(item.key);
                  onClose();
                }}
                className={`relative flex items-center gap-3 px-3 py-[13px] rounded-[10px] text-[15px] font-semibold transition-colors cursor-pointer text-left ${
                  isActive
                    ? "bg-ys-green-bg text-ys-green-text"
                    : "text-ys-muted"
                }`}
              >
                {item.icon(isActive ? "#12B76A" : "currentColor")}
                {t(item.labelKey)}
              </button>
            );
          })}
        </div>

        <div className="mt-auto border-t border-ys-border-softest pt-3.5 flex flex-col gap-[3px]">
          <div className="flex items-center gap-[11px] px-3 pt-2 pb-3">
            <div className="w-[38px] h-[38px] rounded-full bg-ys-green-bg text-ys-green-text text-[13px] font-extrabold flex items-center justify-center flex-shrink-0">
              {initials || "?"}
            </div>
            <div className="flex flex-col gap-px min-w-0">
              <div className="text-sm font-bold text-ys-text truncate">{userName}</div>
              <div className="text-[12.5px] text-ys-dim font-medium truncate">{planLabel}</div>
            </div>
          </div>
          <div className="flex items-center gap-[11px] px-3 py-3 rounded-[10px] text-sm font-semibold text-[#3f4844] cursor-not-allowed opacity-60">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="5.5" r="2.6" stroke="currentColor" strokeWidth="1.5" />
              <path d="M3 13.5c0-2.4 2.2-3.8 5-3.8s5 1.4 5 3.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            Mi perfil
          </div>
          <div className="flex items-center gap-[11px] px-3 py-3 rounded-[10px] text-sm font-semibold text-[#3f4844] cursor-not-allowed opacity-60">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.5" />
              <path d="M8 1.8v1.6M8 12.6v1.6M2.2 8h1.6M12.2 8h1.6M4 4l1.1 1.1M10.9 10.9 12 12M12 4l-1.1 1.1M5.1 10.9 4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            {t("profile_settings")}
          </div>
          <button
            onClick={onLogout}
            className="flex items-center gap-[11px] px-3 py-3 rounded-[10px] text-sm font-semibold text-ys-orange cursor-pointer text-left"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M6.5 2.5H4a1.5 1.5 0 0 0-1.5 1.5v8A1.5 1.5 0 0 0 4 13.5h2.5M10 5l3 3-3 3M13 8H6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {t("nav_logout")}
          </button>
        </div>
      </div>
    </div>
  );
}
