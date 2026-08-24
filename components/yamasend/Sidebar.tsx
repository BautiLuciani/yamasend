"use client";

import { useState } from "react";
import Image from "next/image";
import type { AppSection } from "@/lib/types";
import { useLang } from "./LangContext";

interface SidebarProps {
  active: AppSection;
  onNavigate: (section: AppSection) => void;
  userName: string;
  planLabel: string;
  onLogout: () => void;
  onOpenMyProfile: () => void;
}

const NAV_ITEMS: { key: AppSection; labelKey: "nav_dashboard" | "nav_contacts" | "nav_groups" | "nav_templates" | "nav_campaigns" | "nav_ai"; icon: (color: string) => React.ReactNode }[] = [
  {
    key: "dashboard",
    labelKey: "nav_dashboard",
    icon: (c) => (
      <svg width="17" height="17" viewBox="0 0 16 16" fill="none">
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
      <svg width="17" height="17" viewBox="0 0 16 16" fill="none">
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
      <svg width="17" height="17" viewBox="0 0 16 16" fill="none">
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
      <svg width="17" height="17" viewBox="0 0 16 16" fill="none">
        <rect x="2.5" y="2.5" width="11" height="11" rx="2" stroke={c} strokeWidth="1.5" />
        <path d="M2.5 6h11M6 6v7.5" stroke={c} strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    key: "campanas",
    labelKey: "nav_campaigns",
    icon: (c) => (
      <svg width="17" height="17" viewBox="0 0 16 16" fill="none">
        <path d="M2.5 6.5v3l7 3.5v-10l-7 3.5Z" stroke={c} strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M12 6v4" stroke={c} strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    key: "ia",
    labelKey: "nav_ai",
    icon: (c) => (
      <svg width="17" height="17" viewBox="0 0 16 16" fill="none">
        <path d="m8 2 1.6 3.6L13 7l-3.4 1.4L8 12 6.4 8.4 3 7l3.4-1.4L8 2Z" stroke={c} strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
    ),
  },
];

export default function Sidebar({
  active,
  onNavigate,
  userName,
  planLabel,
  onLogout,
  onOpenMyProfile,
}: SidebarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { t } = useLang();
  const initials = userName
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="hidden md:flex w-[248px] flex-none bg-ys-card border-r border-ys-border px-3.5 pt-[22px] pb-[18px] flex-col gap-[26px] sticky top-0 h-screen z-30">
      <div className="flex items-center px-2">
        <Image
          src="/brand/logo-sidebar.png"
          alt="YamaSend"
          width={196}
          height={78}
          className="w-[196px] h-auto object-contain"
          priority
        />
      </div>

      <div className="flex flex-col gap-[3px]">
        {NAV_ITEMS.map((item) => {
          const isActive = active === item.key;
          return (
            <button
              key={item.key}
              onClick={() => onNavigate(item.key)}
              className={`relative flex items-center gap-[11px] px-3 py-2.5 rounded-[10px] text-sm font-semibold transition-colors cursor-pointer text-left ${
                isActive
                  ? "bg-ys-green-bg text-ys-green-text"
                  : "text-ys-muted hover:bg-ys-el2 hover:text-ys-text"
              }`}
            >
              {item.icon(isActive ? "#12B76A" : "currentColor")}
              {t(item.labelKey)}
            </button>
          );
        })}
      </div>

      <div className="mt-auto relative">
        {menuOpen && (
          <div className="absolute bottom-[calc(100%+8px)] left-0 right-0 bg-ys-card border border-ys-border rounded-xl p-1.5 shadow-[0_12px_28px_rgba(16,24,20,0.12)] flex flex-col gap-0.5 z-20">
            <button
              onClick={() => {
                setMenuOpen(false);
                onOpenMyProfile();
              }}
              className="flex items-center gap-2.5 px-[11px] py-2.5 rounded-lg text-[13.5px] font-semibold text-[#3f4844] cursor-pointer hover:bg-ys-el2 transition-colors text-left w-full"
            >
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="5.5" r="2.6" stroke="currentColor" strokeWidth="1.5" />
                <path d="M3 13.5c0-2.4 2.2-3.8 5-3.8s5 1.4 5 3.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              {t("profile_my_profile")}
            </button>
            <div className="flex items-center gap-2.5 px-[11px] py-2.5 rounded-lg text-[13.5px] font-semibold text-[#3f4844] cursor-not-allowed opacity-60">
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.5" />
                <path d="M8 1.8v1.6M8 12.6v1.6M2.2 8h1.6M12.2 8h1.6M4 4l1.1 1.1M10.9 10.9 12 12M12 4l-1.1 1.1M5.1 10.9 4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              {t("profile_settings")}
            </div>
            <div className="h-px bg-ys-border-softest my-1 mx-1.5" />
            <button
              onClick={onLogout}
              className="flex items-center gap-2.5 px-[11px] py-2.5 rounded-lg text-[13.5px] font-semibold text-ys-orange cursor-pointer hover:bg-ys-warn-bg transition-colors text-left"
            >
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                <path d="M6.5 2.5H4a1.5 1.5 0 0 0-1.5 1.5v8A1.5 1.5 0 0 0 4 13.5h2.5M10 5l3 3-3 3M13 8H6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {t("nav_logout")}
            </button>
          </div>
        )}
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="w-full border-t border-ys-border-softest pt-3.5 mt-3.5 flex items-center gap-2.5 cursor-pointer rounded-[10px] hover:bg-[#f7f9f8] transition-colors text-left"
        >
          <div className="w-[34px] h-[34px] ml-1 rounded-full bg-ys-green-bg text-ys-green-text text-[12.5px] font-extrabold flex items-center justify-center flex-shrink-0">
            {initials || "?"}
          </div>
          <div className="flex flex-col gap-px min-w-0">
            <div className="text-[13.5px] font-bold text-ys-text truncate">{userName}</div>
            <div className="text-xs text-ys-dim font-medium truncate">{planLabel}</div>
          </div>
          <svg className="ml-auto mr-2 flex-shrink-0" width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="m4.5 10 3.5-3.5L11.5 10" stroke="#9aa19c" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
