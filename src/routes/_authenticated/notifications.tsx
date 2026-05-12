import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCheck, Inbox } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/notifications")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/login" });
  },
  component: NotificationsPage,
});

interface N { id: string; type: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string; }

function NotificationsPage() {
  const [items, setItems] = useState<N[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data } = await supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(200);
    setItems((data as N[]) ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const markAll = async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", u.user.id).is("read_at", null);
    load();
  };

  // Group by day
  const groups = new Map<string, N[]>();
  for (const n of items) {
    const day = new Date(n.created_at).toDateString();
    const arr = groups.get(day) ?? [];
    arr.push(n);
    groups.set(day, arr);
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Notifications" description="All your alerts and updates in one place." action={
        <Button onClick={markAll} variant="outline" size="sm"><CheckCheck className="mr-2 h-4 w-4" /> Mark all read</Button>
      } />
      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : items.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-muted-foreground">
          <Inbox className="mx-auto mb-3 h-8 w-8 opacity-50" />
          No notifications yet.
        </CardContent></Card>
      ) : (
        <div className="space-y-6">
          {Array.from(groups.entries()).map(([day, list]) => (
            <div key={day}>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{day}</div>
              <Card><CardContent className="p-0">
                <ul className="divide-y divide-border/60">
                  {list.map((n) => (
                    <li key={n.id} className={`flex gap-3 px-4 py-3 ${!n.read_at ? "bg-primary/[0.04]" : ""}`}>
                      <div className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${!n.read_at ? "bg-primary" : "bg-muted-foreground/30"}`} />
                      <div className="flex-1">
                        <div className="text-sm font-medium">{n.title}</div>
                        {n.body && <div className="mt-0.5 text-sm text-muted-foreground">{n.body}</div>}
                        <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                          <span>{formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}</span>
                          {n.link && <Link to={n.link} className="text-primary hover:underline">View</Link>}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent></Card>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
