"use client";

import { useLang } from "./LangContext";

interface LogoutModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export default function LogoutModal({ open, onClose, onConfirm }: LogoutModalProps) {
  const { t } = useLang();

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[9000] bg-[rgba(16,24,20,0.4)] flex items-center justify-center px-6 py-8"
      style={{ animation: "ys-fade .16s ease both" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[420px] bg-ys-card rounded-[18px] px-7 pt-[26px] pb-[22px] flex flex-col gap-4 shadow-[var(--shadow-modal)]"
        style={{ animation: "ys-modal .19s cubic-bezier(.4,0,.2,1) both" }}
      >
        <div className="flex flex-col gap-1.5">
          <div className="text-lg font-extrabold tracking-[-0.02em] text-ys-text">
            {t("logout_title")}
          </div>
          <div className="text-[13.5px] text-ys-muted font-medium leading-[1.5]">
            {t("logout_desc")}
          </div>
        </div>
        <div className="flex justify-end gap-2.5">
          <button
            onClick={onClose}
            className="text-[13.5px] font-bold text-[#3f4844] border border-ys-border rounded-[10px] px-[18px] py-2.5 cursor-pointer transition-colors hover:bg-[#f7f9f8]"
          >
            {t("logout_cancel")}
          </button>
          <button
            onClick={onConfirm}
            className="text-[13.5px] font-bold text-ys-orange bg-ys-orange-bg border border-ys-warn-bg rounded-[10px] px-[18px] py-2.5 cursor-pointer transition-colors hover:opacity-90"
          >
            {t("logout_confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
