import { Link } from "react-router-dom";
import { Construction, ArrowLeft } from "lucide-react";
import { useTranslation } from "@/i18n";

interface PlaceholderPageProps {
  titleKey: string;
}

export default function PlaceholderPage({ titleKey }: PlaceholderPageProps) {
  const { t } = useTranslation();

  return (
    <div className="h-full flex flex-col items-center justify-center bg-bg p-6 text-center">
      <div className="w-24 h-24 bg-primary/10 text-primary rounded-3xl flex items-center justify-center mb-8 shadow-sm">
        <Construction size={48} strokeWidth={1.5} />
      </div>

      <h1 className="text-3xl md:text-4xl font-extrabold text-text mb-4 tracking-tight">
        {t(titleKey, "Feature")}
      </h1>

      <p className="text-text-soft max-w-md mb-10 text-lg leading-relaxed">
        {t(
          "home.comingSoon",
          "This feature is currently under development and will be available in a future update.",
        )}
      </p>

      <Link
        to="/"
        className="btn btn-primary inline-flex items-center gap-2 px-6 py-3 text-base font-medium transition-transform hover:-translate-y-0.5"
      >
        <ArrowLeft size={18} />
        <span>{t("app.nav.home", "Back to Home")}</span>
      </Link>
    </div>
  );
}
