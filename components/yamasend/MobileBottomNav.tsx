"use client";

export type MobileTab = "inicio" | "contactos" | "campana" | "chat";

interface MobileBottomNavProps {
  active: MobileTab;
  onChange: (tab: MobileTab) => void;
  selectedCount: number;
}

const TABS: { key: MobileTab; label: string; icon: string }[] = [
  { key: "inicio", label: "Inicio", icon: "🏠" },
  { key: "contactos", label: "Contactos", icon: "👥" },
  { key: "campana", label: "Campaña", icon: "📤" },
  { key: "chat", label: "AI chat", icon: "🤖" },
];

export default function MobileBottomNav({
  active,
  onChange,
  selectedCount,
}: MobileBottomNavProps) {
  return (
    <div className="flex md:hidden border-t border-ys-border bg-ys-el2 flex-shrink-0">
      {TABS.map((tab) => {
        const isActive = active === tab.key;
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className={`relative flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] transition-colors cursor-pointer ${
              isActive ? "text-ys-red" : "text-ys-muted"
            }`}
          >
            <span className="text-base leading-none">{tab.icon}</span>
            <span className="leading-none">{tab.label}</span>
            {tab.key === "contactos" && selectedCount > 0 && (
              <span className="absolute top-1 right-[22%] min-w-[15px] h-[15px] px-[3px] rounded-full bg-ys-red text-white text-[9px] font-semibold flex items-center justify-center leading-none">
                {selectedCount}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
