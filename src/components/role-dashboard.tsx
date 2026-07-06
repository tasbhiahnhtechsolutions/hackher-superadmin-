import { TrendingUp } from "lucide-react";

interface KPI {
  label: string;
  value: React.ReactNode;
  trend?: React.ReactNode;
  tone?: "default" | "primary" | "success" | "warning";
}

interface Props {
  title: string;
  subtitle: string;
  kpis: KPI[];
}

const TONE: Record<NonNullable<KPI["tone"]>, string> = {
  default: "text-foreground",
  primary: "text-primary",
  success: "text-success",
  warning: "text-warning",
};

export function RoleDashboard({ title, subtitle, kpis }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-bold mb-1">{title}</h1>
        <p className="text-[13px] text-muted-foreground mb-6">{subtitle}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-7">
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            className="bg-card rounded-xl p-5 border border-border/60"
          >
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
              {kpi.label}
            </div>
            <div
              className={`mt-1 text-[26px] font-bold ${TONE[kpi.tone ?? "default"]}`}
            >
              {kpi.value}
            </div>
            {kpi.trend && (
              <div className="mt-1.5 text-xs">
                {kpi.trend}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
