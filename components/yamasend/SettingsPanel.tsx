"use client";

import { useRef } from "react";
import { useTheme } from "./ThemeContext";
import { useLang } from "./LangContext";

interface SettingsPanelProps {
  onBack: () => void;
}

export default function SettingsPanel({ onBack }: SettingsPanelProps) {
  const { theme, toggleTheme } = useTheme();
  const { lang, setLang, t } = useLang();
  const themeBtnRef = useRef<HTMLButtonElement>(null);

  function handleThemeToggle() {
    const rect = themeBtnRef.current?.getBoundingClientRect();
    const origin = rect
      ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
      : undefined;
    toggleTheme(origin);
  }

  return (
    <div className="flex flex-col gap-5">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-[12.5px] font-bold text-ys-muted cursor-pointer hover:text-ys-text transition-colors w-fit"
      >
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
          <path d="M10 3.5 5.5 8l4.5 4.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {t("settings_back")}
      </button>

      <div className="text-[15px] font-extrabold text-ys-text">
        {t("settings_title")}
      </div>

      {/* Tema */}
      <div className="flex items-center justify-between gap-3 border-t border-ys-border-softest pt-4">
        <div className="flex flex-col gap-0.5 min-w-0">
          <div className="text-[13.5px] font-bold text-ys-text">
            {t("settings_theme")}
          </div>
          <div className="text-[12px] text-ys-dim font-medium leading-[1.4]">
            {t("settings_theme_desc")}
          </div>
        </div>
        <button
          ref={themeBtnRef}
          onClick={handleThemeToggle}
          role="switch"
          aria-checked={theme === "dark"}
          aria-label={t("settings_theme")}
          className={`relative flex-none w-[52px] h-[30px] rounded-full cursor-pointer transition-colors duration-200 ${
            theme === "dark" ? "bg-ys-green" : "bg-ys-el2"
          }`}
        >
          <span
            className={`absolute top-[3px] w-6 h-6 rounded-full bg-white shadow-[0_1px_3px_rgba(16,24,20,0.25)] transition-transform duration-200 flex items-center justify-center ${
              theme === "dark" ? "translate-x-[25px]" : "translate-x-[3px]"
            }`}
          >
            {theme === "dark" ? (
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path d="M13.5 9.5A5.5 5.5 0 0 1 6.5 2.5a5.5 5.5 0 1 0 7 7Z" fill="#16211b" />
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="3" stroke="#c07a12" strokeWidth="1.4" />
                <path d="M8 1.8v1.6M8 12.6v1.6M2.2 8h1.6M12.2 8h1.6M4 4l1.1 1.1M10.9 10.9 12 12M12 4l-1.1 1.1M5.1 10.9 4 12" stroke="#c07a12" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            )}
          </span>
        </button>
      </div>

      {/* Idioma */}
      <div className="flex items-center justify-between gap-3 border-t border-ys-border-softest pt-4">
        <div className="flex flex-col gap-0.5 min-w-0">
          <div className="text-[13.5px] font-bold text-ys-text">
            {t("settings_language")}
          </div>
          <div className="text-[12px] text-ys-dim font-medium leading-[1.4]">
            {t("settings_language_desc")}
          </div>
        </div>
        <div className="flex-none flex gap-[3px] bg-ys-el2 rounded-[10px] p-[3px]">
          <button
            onClick={() => setLang("es")}
            className={`text-[12.5px] rounded-lg px-3 py-[7px] cursor-pointer transition-colors ${
              lang === "es"
                ? "font-bold text-ys-text bg-ys-card shadow-[0_1px_2px_rgba(16,24,20,0.07)]"
                : "font-semibold text-ys-dim"
            }`}
          >
            ES
          </button>
          <button
            onClick={() => setLang("en")}
            className={`text-[12.5px] rounded-lg px-3 py-[7px] cursor-pointer transition-colors ${
              lang === "en"
                ? "font-bold text-ys-text bg-ys-card shadow-[0_1px_2px_rgba(16,24,20,0.07)]"
                : "font-semibold text-ys-dim"
            }`}
          >
            EN
          </button>
        </div>
      </div>
    </div>
  );
}
