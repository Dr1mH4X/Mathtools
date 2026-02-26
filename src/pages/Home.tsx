import { Link } from "react-router-dom";
import {
  Box,
  Grid3X3,
  LineChart,
  TrendingUp,
  Shapes,
  BarChart3,
  ArrowRight,
} from "lucide-react";
import { useTranslation } from "@/i18n";

const tools = [
  {
    id: "revolution",
    path: "/revolution",
    icon: Box,
    titleKey: "home.tools.revolution.title",
    descKey: "home.tools.revolution.desc",
    color: "text-blue-500",
    bg: "bg-blue-500/10",
    disabled: false,
  },
  {
    id: "matrix",
    path: "/matrix",
    icon: Grid3X3,
    titleKey: "home.tools.matrix.title",
    descKey: "home.tools.matrix.desc",
    color: "text-green-500",
    bg: "bg-green-500/10",
    disabled: true,
  },
  {
    id: "graphing",
    path: "/graphing",
    icon: LineChart,
    titleKey: "home.tools.graphing.title",
    descKey: "home.tools.graphing.desc",
    color: "text-purple-500",
    bg: "bg-purple-500/10",
    disabled: true,
  },
  {
    id: "derivatives",
    path: "/derivatives",
    icon: TrendingUp,
    titleKey: "home.tools.derivatives.title",
    descKey: "home.tools.derivatives.desc",
    color: "text-orange-500",
    bg: "bg-orange-500/10",
    disabled: true,
  },
  {
    id: "geometry",
    path: "/geometry",
    icon: Shapes,
    titleKey: "home.tools.geometry.title",
    descKey: "home.tools.geometry.desc",
    color: "text-pink-500",
    bg: "bg-pink-500/10",
    disabled: true,
  },
  {
    id: "statistics",
    path: "/statistics",
    icon: BarChart3,
    titleKey: "home.tools.statistics.title",
    descKey: "home.tools.statistics.desc",
    color: "text-teal-500",
    bg: "bg-teal-500/10",
    disabled: true,
  },
];

export default function Home() {
  const { t } = useTranslation();

  return (
    <div className="h-full overflow-y-auto bg-bg">
      <div className="max-w-6xl mx-auto px-4 py-12 md:py-20">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-6xl font-extrabold mb-6 tracking-tight hero-title-gradient">
            {t("home.hero.title", "Interactive Math Tools")}
          </h1>
          <p className="text-lg md:text-xl text-text-soft max-w-2xl mx-auto leading-relaxed">
            {t(
              "home.hero.subtitle",
              "Visualize, calculate, and explore mathematical concepts with our suite of powerful tools.",
            )}
          </p>
        </div>

        {/* Tools Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tools.map((tool) => {
            const Icon = tool.icon;
            const isPlaceholder = tool.disabled;

            const CardContent = (
              <div
                className={`card p-6 h-full flex flex-col border border-border bg-bg-soft ${
                  isPlaceholder
                    ? "opacity-60 grayscale cursor-not-allowed"
                    : "hover:-translate-y-1 hover:shadow-card transition-all duration-300 cursor-pointer"
                }`}
              >
                <div className="flex items-center gap-4 mb-4">
                  <div className={`p-3 rounded-xl ${tool.bg} ${tool.color}`}>
                    <Icon size={28} />
                  </div>
                  <h2 className="text-xl font-bold text-text">
                    {t(tool.titleKey, tool.id)}
                  </h2>
                </div>
                <p className="text-text-soft flex-1 leading-relaxed">
                  {t(tool.descKey, `Description for ${tool.id}`)}
                </p>
                <div className="mt-6 flex items-center text-sm font-medium">
                  {isPlaceholder ? (
                    <span className="text-text-soft bg-bg px-3 py-1 rounded-full border border-border">
                      {t("common.comingSoon", "Coming Soon")}
                    </span>
                  ) : (
                    <span className="text-primary flex items-center gap-1 group-hover:gap-2 transition-all">
                      {t("common.tryNow", "Try Now")} <ArrowRight size={16} />
                    </span>
                  )}
                </div>
              </div>
            );

            return isPlaceholder ? (
              <div key={tool.id}>{CardContent}</div>
            ) : (
              <Link to={tool.path} key={tool.id} className="block group">
                {CardContent}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
