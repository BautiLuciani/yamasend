"use client";

interface TopbarProps {
  userName: string;
  onOpenProfile: () => void;
}

export default function Topbar({ userName, onOpenProfile }: TopbarProps) {
  return (
    <div className="h-[50px] flex items-center gap-3 px-[18px] flex-shrink-0 border-b border-ys-border bg-[rgba(10,10,11,0.96)]">
      <div className="font-display text-[15px] font-bold flex items-center gap-[7px]">
        <span
          className="w-[7px] h-[7px] rounded-full bg-ys-red"
          style={{ boxShadow: "0 0 6px var(--ys-red)" }}
        />
        Yamas.AI
      </div>

      <div className="w-px h-4 bg-ys-border" />

      <div className="flex flex-col gap-[1px] leading-tight">
        <span className="text-[13px] font-semibold text-ys-muted">
          YamaSend
        </span>
        <span className="text-[9px] text-ys-dim uppercase tracking-[0.6px]">
          AI mass messaging
        </span>
      </div>
      <span className="text-[9px] text-ys-dim ml-1.5">v3.2</span>

      <div className="ml-auto">
        <button
          onClick={onOpenProfile}
          className="flex items-center gap-1.5 rounded-full border border-ys-border bg-ys-card px-3 py-1 text-xs text-ys-muted hover:border-ys-border2 transition-colors cursor-pointer"
        >
          👤 <strong className="text-ys-text">{userName}</strong>
        </button>
      </div>
    </div>
  );
}
