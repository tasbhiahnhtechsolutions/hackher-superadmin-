import { ReactNode } from "react";
import { PageHeader, PageBody } from "@/components/page-header";

export function ComingSoon({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} />
      <PageBody>
        <div className="rounded-xl border border-dashed border-border/60 bg-card/50 p-12 text-center">
          <p className="text-sm text-muted-foreground">{children ?? "Wired to data — full UI ships next iteration."}</p>
        </div>
      </PageBody>
    </>
  );
}
