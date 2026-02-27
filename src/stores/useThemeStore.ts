import { create } from "zustand";

interface ThemeState {
  isDark: boolean;
  /** When true the store tracks the OS dark-mode preference automatically.
   *  Set to false as soon as the user explicitly toggles the theme. */
  followSystem: boolean;
  setIsDark: (value: boolean) => void;
  /** Called from the global matchMedia listener — only updates when
   *  `followSystem` is still true. */
  setIsDarkFromSystem: (value: boolean) => void;
  /** Manual toggle — sets `followSystem = false` so subsequent OS
   *  changes no longer override the user's choice. */
  toggleTheme: () => void;
}

function getSystemPrefersDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export const useThemeStore = create<ThemeState>()((set, get) => ({
  isDark: getSystemPrefersDark(),
  followSystem: true,

  setIsDark: (value: boolean) => set({ isDark: value, followSystem: false }),

  setIsDarkFromSystem: (value: boolean) => {
    if (get().followSystem) {
      set({ isDark: value });
    }
  },

  toggleTheme: () =>
    set((state) => ({ isDark: !state.isDark, followSystem: false })),
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

// Listen for system preference changes — only honoured while followSystem is true
if (typeof window !== "undefined") {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", (e: MediaQueryListEvent) => {
    useThemeStore.getState().setIsDarkFromSystem(e.matches);
  });
}
