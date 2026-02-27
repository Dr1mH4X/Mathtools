import { useState } from "react";
import { NavLink, Link } from "react-router-dom";
import { Menu, X, Moon, Sun, Globe, Github } from "lucide-react";
import { useTranslation } from "@/i18n";
import { useThemeStore } from "@/stores/useThemeStore";

const navLinks = [
  { path: "/", labelKey: "app.nav.home", fallback: "Home" },
  {
    path: "/revolution",
    labelKey: "app.nav.revolution",
    fallback: "Revolution",
  },
  { path: "/matrix", labelKey: "app.nav.matrix", fallback: "Matrix" },
  { path: "/graphing", labelKey: "app.nav.graphing", fallback: "Graphing" },
  {
    path: "/derivatives",
    labelKey: "app.nav.derivatives",
    fallback: "Derivatives",
  },
  { path: "/geometry", labelKey: "app.nav.geometry", fallback: "Geometry" },
  {
    path: "/statistics",
    labelKey: "app.nav.statistics",
    fallback: "Statistics",
  },
];

export default function AppHeader() {
  const { t, locale, setLocale } = useTranslation();
  const { isDark, toggleTheme } = useThemeStore();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const toggleLocale = () => {
    setLocale(locale === "en" ? "zh" : "en");
  };

  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-bg/80 backdrop-blur-md">
      <div className="flex h-14 items-center px-4 md:px-6">
        <Link
          to="/"
          className="flex items-center gap-2 mr-6"
          onClick={closeMobileMenu}
        >
          {/* Logo: centered italic "x" on primary rounded square */}
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
            <span
              className="text-white font-bold text-xl leading-none select-none"
              style={{
                fontFamily: "Georgia, 'Times New Roman', serif",
                fontStyle: "italic",
              }}
            >
              x
            </span>
          </div>
          <span className="font-bold text-lg tracking-tight hide-mobile">
            MathTools
          </span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-1 flex-1 overflow-x-auto hide-scrollbar">
          {navLinks.map((link) => (
            <NavLink
              key={link.path}
              to={link.path}
              className={({ isActive }) =>
                `nav-link whitespace-nowrap px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? "nav-link-active bg-primary/10 text-primary"
                    : "text-text-soft hover:text-text hover:bg-bg-soft"
                }`
              }
            >
              {t(link.labelKey, link.fallback)}
            </NavLink>
          ))}
        </nav>

        {/* Right Actions */}
        <div className="flex items-center gap-2 ml-auto">
          <a
            href="https://github.com/Dr1mH4X/Mathtools"
            target="_blank"
            rel="noreferrer"
            className="header-btn p-2 rounded-md text-text-soft hover:text-text hover:bg-bg-soft transition-colors"
            title="GitHub"
          >
            <Github size={20} />
          </a>

          {/* Language toggle: Globe icon from lucide-react */}
          <button
            onClick={toggleLocale}
            className="header-btn p-2 rounded-md text-text-soft hover:text-text hover:bg-bg-soft transition-colors"
            title={t("app.header.language", "Language")}
          >
            <Globe size={20} />
          </button>

          <button
            onClick={toggleTheme}
            className="header-btn p-2 rounded-md text-text-soft hover:text-text hover:bg-bg-soft transition-colors"
            title={t("app.header.theme", "Toggle Theme")}
          >
            {isDark ? <Sun size={20} /> : <Moon size={20} />}
          </button>

          {/* Mobile Menu Toggle */}
          <button
            className="md:hidden p-2 rounded-md text-text-soft hover:text-text hover:bg-bg-soft transition-colors"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile Nav */}
      {isMobileMenuOpen && (
        <div className="md:hidden border-t border-border bg-bg absolute top-14 left-0 w-full shadow-lg flex flex-col py-2">
          {navLinks.map((link) => (
            <NavLink
              key={link.path}
              to={link.path}
              onClick={closeMobileMenu}
              className={({ isActive }) =>
                `mobile-nav-link px-4 py-3 text-sm font-medium transition-colors ${
                  isActive
                    ? "active bg-primary/10 text-primary border-l-4 border-primary"
                    : "text-text-soft hover:text-text hover:bg-bg-soft border-l-4 border-transparent"
                }`
              }
            >
              {t(link.labelKey, link.fallback)}
            </NavLink>
          ))}
        </div>
      )}
    </header>
  );
}
