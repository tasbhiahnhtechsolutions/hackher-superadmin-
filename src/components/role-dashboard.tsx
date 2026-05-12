import { TrendingUp } from "lucide-react";

interface KPI {
  label: string;
  value: string;
  trend?: string;
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
    <div className="space-y-8 p-6 md:p-10">
      <div>
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="rounded-xl border border-border/60 bg-card p-5 shadow-card">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {kpi.label}
            </div>
            <div className={`mt-2 text-3xl font-semibold tracking-tight ${TONE[kpi.tone ?? "default"]}`}>
              {kpi.value}
            </div>
            {kpi.trend && (
              <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                <TrendingUp className="h-3 w-3" /> {kpi.trend}
              </div>
            )}
          </div>
        ))}
      </div>

    </div>
  );
}
