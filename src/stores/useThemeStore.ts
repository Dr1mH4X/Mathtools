import { create } from "zustand";

interface ThemeState {
  isDark: boolean;
  setIsDark: (value: boolean) => void;
  toggleTheme: () => void;
}

function getSystemPrefersDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export const useThemeStore = create<ThemeState>()((set) => ({
  isDark: getSystemPrefersDark(),
  setIsDark: (value: boolean) => set({ isDark: value }),
  toggleTheme: () => set((state) => ({ isDark: !state.isDark })),
}));

// Apply theme to DOM whenever it changes
useThemeStore.subscribe((state) => {
  if (typeof document === "undefined") return;
  if (state.isDark) {
    document.documentElement.setAttribute("data-theme", "dark");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
});

// Apply initial theme immediately on module load
if (typeof document !== "undefined") {
  const initial = useThemeStore.getState().isDark;
  if (initial) {
    document.documentElement.setAttribute("data-theme", "dark");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}

// Listen for system preference changes and always follow them
if (typeof window !== "undefined") {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", (e: MediaQueryListEvent) => {
    useThemeStore.getState().setIsDark(e.matches);
  });
}
