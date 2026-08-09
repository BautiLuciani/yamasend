"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/types";

interface AiChatBarProps {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  modo24h: boolean;
  fullHeight?: boolean;
}

export default function AiChatBar({
  messages,
  onSend,
  modo24h,
  fullHeight = false,
}: AiChatBarProps) {
  const [value, setValue] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  function handleSend() {
    const text = value.trim();
    if (!text) return;
    onSend(text);
    setValue("");
  }

  return (
    <div
      className={`border-t border-ys-border ${fullHeight ? "flex-1 flex flex-col min-h-0" : "flex-shrink-0"}`}
    >
      <div
        ref={scrollRef}
        className={`overflow-y-auto flex flex-col gap-1 px-[18px] py-2 bg-ys-el border-b box-border scroll-smooth ${
          fullHeight
            ? "flex-1 min-h-0"
            : "h-[115px] min-h-[115px] max-h-[115px]"
        } ${
          modo24h
            ? "border-2 border-ys-green shadow-[0_0_8px_rgba(34,197,94,.2)]"
            : "border-ys-border"
        }`}
      >
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex w-full ${m.type === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] px-2.5 py-1 rounded-md text-xs leading-tight break-words whitespace-pre-wrap ${
                m.type === "user"
                  ? "bg-ys-red text-white"
                  : m.type === "error"
                    ? "bg-ys-red-bg text-[#ff6b6b] border border-[rgba(255,61,61,.2)]"
                    : "bg-ys-card border border-ys-border"
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}
      </div>
      <div className="bg-ys-el2 px-[18px] py-[7px] flex items-center gap-2">
        <span
          className="flex-shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold text-ys-red"
          style={{ borderColor: "var(--ys-warn)" }}
        >
          AI
        </span>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Preguntale a la AI..."
          className="flex-1 rounded-md border border-ys-border bg-ys-card px-3 py-[7px] text-[13px] outline-none focus:border-[rgba(255,61,61,.4)] transition-colors"
        />
        <button
          onClick={handleSend}
          className="flex-shrink-0 rounded-md bg-[#222226] text-ys-red px-3.5 py-[7px] text-sm hover:bg-[#2a2a2e] transition-colors cursor-pointer"
        >
          ↑
        </button>
      </div>
    </div>
  );
}
