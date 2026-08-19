"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: (origin?: { x: number; y: number }) => void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

const STORAGE_KEY = "yamasend-theme";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return "light";
    const stored = window.localStorage.getItem(STORAGE_KEY) as Theme | null;
    if (stored === "light" || stored === "dark") return stored;
    if (window.matchMedia("(prefers-color-scheme: dark)").matches) return "dark";
    return "light";
  });

  // Sincroniza el atributo data-theme y localStorage cada vez que cambia el
  // tema. El primer paint ya lo resuelve el script inline en layout.tsx, así
  // que no hace falta esperar a un "mounted" para aplicar esto.
  useEffect(() => {
    const el = document.documentElement;
    if (theme === "dark") {
      el.setAttribute("data-theme", "dark");
    } else {
      el.removeAttribute("data-theme");
    }
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = (origin?: { x: number; y: number }) => {
    const next: Theme = theme === "dark" ? "light" : "dark";

    if (!document.startViewTransition) {
      setTheme(next);
      return;
    }

    const transition = document.startViewTransition(() => setTheme(next));
    transition.ready.then(() => {
      if (origin) {
        // Reveal circular desde el punto donde se hizo click (ej. el switch).
        const { x, y } = origin;
        const endRadius = Math.hypot(
          Math.max(x, window.innerWidth - x),
          Math.max(y, window.innerHeight - y),
        );
        document.documentElement.animate(
          {
            clipPath: [
              `circle(0px at ${x}px ${y}px)`,
              `circle(${endRadius}px at ${x}px ${y}px)`,
            ],
          },
          {
            duration: 600,
            easing: "cubic-bezier(0.76, 0, 0.24, 1)",
            pseudoElement: "::view-transition-new(root)",
          },
        );
        return;
      }

      document.documentElement.animate(
        { clipPath: ["inset(0 0 100% 0)", "inset(0)"] },
        {
          duration: 600,
          easing: "cubic-bezier(0.76, 0, 0.24, 1)",
          pseudoElement: "::view-transition-new(root)",
        },
      );
    });
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme debe usarse dentro de ThemeProvider");
  return ctx;
}
