"use client";

import type { Contact, ScoreTemp } from "@/lib/types";

interface ContactsTableProps {
  contacts: Contact[];
  selected: Set<string>;
  onToggleRow: (id: string) => void;
  onToggleAll: (checked: boolean) => void;
  modo24h: boolean;
}

function Badge({ score }: { score: ScoreTemp }) {
  if (score === "caliente")
    return (
      <span className="inline-flex rounded-full px-[7px] py-[2px] text-[10px] font-semibold bg-[rgba(255,61,61,.15)] text-[#ff7070]">
        🔥 cal
      </span>
    );
  if (score === "tibio")
    return (
      <span className="inline-flex rounded-full px-[7px] py-[2px] text-[10px] font-semibold bg-[rgba(245,158,11,.15)] text-ys-warn">
        🌡️ tib
      </span>
    );
  if (score === "frio")
    return (
      <span className="inline-flex rounded-full px-[7px] py-[2px] text-[10px] font-semibold bg-[rgba(59,130,246,.15)] text-ys-blue">
        ❄️ frío
      </span>
    );
  return (
    <span className="inline-flex rounded-full px-[7px] py-[2px] text-[10px] font-semibold bg-[rgba(113,113,122,.12)] text-ys-muted">
      —
    </span>
  );
}

export default function ContactsTable({
  contacts,
  selected,
  onToggleRow,
  onToggleAll,
  modo24h,
}: ContactsTableProps) {
  const visibleSelectable = contacts.filter((c) => !c.bloqueado || modo24h);
  const allChecked =
    visibleSelectable.length > 0 &&
    visibleSelectable.every((c) => selected.has(c.id));

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0 border-r border-ys-border">
      <div className="flex-1 overflow-y-auto min-h-0">
        <table className="w-full border-collapse table-fixed">
          <thead>
            <tr>
              <th className="sticky top-0 z-[2] bg-ys-el border-t border-b border-ys-border px-3 py-2 text-left w-[34px]">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={(e) => onToggleAll(e.target.checked)}
                  className="accent-ys-red w-3.5 h-3.5 cursor-pointer"
                />
              </th>
              {[
                { label: "Nombre", align: "text-left" },
                { label: "Tel", align: "text-left" },
                { label: "Score", align: "text-left" },
                { label: "Etapa", align: "text-left" },
                { label: "Msjs", align: "text-right" },
                { label: "Último", align: "text-right" },
              ].map(({ label, align }) => (
                <th
                  key={label}
                  className={`sticky top-0 z-[2] bg-ys-el border-t border-b border-ys-border px-3 py-2 ${align} text-[9px] font-semibold text-ys-dim uppercase tracking-[0.5px]`}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {contacts.map((c) => {
              const bloq = !modo24h && c.bloqueado;
              const isSel = selected.has(c.id) && !bloq;
              return (
                <tr
                  key={c.id}
                  onClick={() => !bloq && onToggleRow(c.id)}
                  className={`border-b border-ys-border hover:[&>td]:bg-white/[.02] ${
                    isSel ? "[&>td]:bg-ys-red-bg" : ""
                  } ${bloq ? "opacity-35 pointer-events-none" : "cursor-pointer"}`}
                >
                  <td className="px-3 py-[9px] align-middle">
                    <input
                      type="checkbox"
                      checked={isSel}
                      disabled={bloq}
                      onChange={() => onToggleRow(c.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="accent-ys-red w-3.5 h-3.5 cursor-pointer"
                    />
                  </td>
                  <td className="px-3 py-[9px] text-[13px] truncate">
                    {c.nombre ? (
                      <strong>{c.nombre}</strong>
                    ) : (
                      <span className="text-ys-muted">—</span>
                    )}
                  </td>
                  <td className="px-3 py-[9px] text-[13px] text-ys-muted truncate">
                    {c.tel || "—"}
                  </td>
                  <td className="px-3 py-[9px] text-[13px]">
                    <Badge score={c.score} />
                  </td>
                  <td className="px-3 py-[9px] text-[13px] text-ys-muted truncate">
                    {c.etapa}
                  </td>
                  <td className="px-3 py-[9px] text-[13px] text-ys-muted text-right truncate">
                    {c.mensajes}
                  </td>
                  <td className="px-3 py-[9px] text-[13px] text-ys-muted text-right truncate">
                    {c.ultimo}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
