import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { PageHeader, PageBody } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, Tag } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/affiliate/my-code")({
  component: MyCodePage,
});

function MyCodePage() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["my-promo", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("promo_codes")
        .select("*")
        .eq("affiliate_id", user!.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  return (
    <>
      <PageHeader title="My Promo Code" subtitle="Share this code with your audience — it's yours and unique." />
      <PageBody>
        {isLoading ? (
          <div className="text-muted-foreground">Loading…</div>
        ) : !data ? (
          <div className="rounded-xl border border-border/60 bg-card p-8 text-center text-muted-foreground">
            Your promo code is being generated. Please refresh in a moment, or contact your manager.
          </div>
        ) : (
          <div className="rounded-2xl border border-border/60 bg-card p-8 shadow-card max-w-xl">
            <div className="flex items-center gap-3 text-xs uppercase tracking-wider text-muted-foreground">
              <Tag className="h-3.5 w-3.5" /> Your assigned code
            </div>
            <div className="mt-4 flex items-center gap-3">
              <div className="font-mono text-4xl font-bold tracking-tight text-primary">{data.code}</div>
              <Badge variant={data.status === "active" ? "default" : "secondary"}>{data.status}</Badge>
            </div>
            <div className="mt-6 grid grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">Customer discount</div>
                <div className="mt-1 text-lg font-semibold">{Number(data.discount_percent)}%</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Total uses</div>
                <div className="mt-1 text-lg font-semibold">{data.usage_count}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Status</div>
                <div className="mt-1 text-lg font-semibold capitalize">{data.status}</div>
              </div>
            </div>
            <Button
              className="mt-6"
              onClick={() => {
                navigator.clipboard.writeText(data.code);
                toast.success("Promo code copied");
              }}
            >
              <Copy className="mr-2 h-4 w-4" /> Copy code
            </Button>
          </div>
        )}
      </PageBody>
    </>
  );
}
