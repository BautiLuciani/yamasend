"use client";

interface ContactsPaginationProps {
  page: number;
  totalPages: number;
  totalItems: number;
  perPage: number;
  onChange: (page: number) => void;
  compact?: boolean;
}

function buildPageList(page: number, totalPages: number): (number | "ellipsis")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages = new Set<number>([1, totalPages, page, page - 1, page + 1]);
  const sorted = Array.from(pages)
    .filter((p) => p >= 1 && p <= totalPages)
    .sort((a, b) => a - b);

  const result: (number | "ellipsis")[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) {
      result.push("ellipsis");
    }
    result.push(sorted[i]);
  }
  return result;
}

export default function ContactsPagination({
  page,
  totalPages,
  totalItems,
  perPage,
  onChange,
  compact = false,
}: ContactsPaginationProps) {
  if (totalItems === 0) return null;

  const start = (page - 1) * perPage + 1;
  const end = Math.min(page * perPage, totalItems);
  const pageList = buildPageList(page, totalPages);

  return (
    <div
      className={`flex-none flex items-center justify-between gap-3 border-t border-ys-border-soft ${
        compact ? "px-4 py-3 flex-wrap" : "px-6 py-3.5"
      }`}
    >
      <div className="text-[12.5px] text-ys-dim font-medium whitespace-nowrap">
        {start}–{end} de {totalItems}
      </div>

      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
          aria-label="Página anterior"
          className="w-8 h-8 flex items-center justify-center rounded-[9px] border border-ys-border text-ys-text transition-colors hover:bg-ys-bg disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:bg-transparent cursor-pointer"
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <path d="M10 3.5 5.5 8l4.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {!compact &&
          pageList.map((p, i) =>
            p === "ellipsis" ? (
              <span key={`e-${i}`} className="w-8 h-8 flex items-center justify-center text-[12.5px] text-ys-dim">
                …
              </span>
            ) : (
              <button
                key={p}
                onClick={() => onChange(p)}
                className={`w-8 h-8 flex items-center justify-center rounded-[9px] text-[12.5px] font-bold transition-colors cursor-pointer ${
                  p === page
                    ? "bg-ys-green text-white"
                    : "text-ys-text hover:bg-ys-bg"
                }`}
              >
                {p}
              </button>
            ),
          )}

        {compact && (
          <span className="px-2 text-[12.5px] font-semibold text-ys-text whitespace-nowrap">
            {page} / {totalPages}
          </span>
        )}

        <button
          onClick={() => onChange(page + 1)}
          disabled={page >= totalPages}
          aria-label="Página siguiente"
          className="w-8 h-8 flex items-center justify-center rounded-[9px] border border-ys-border text-ys-text transition-colors hover:bg-ys-bg disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:bg-transparent cursor-pointer"
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <path d="m6 3.5 4.5 4.5L6 12.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
