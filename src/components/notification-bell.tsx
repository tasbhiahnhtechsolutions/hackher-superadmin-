import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bell, CheckCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow } from "date-fns";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export function NotificationBell() {
  const { user } = useAuth();
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);

  const unread = items.filter((n) => !n.read_at).length;

  useEffect(() => {
    if (!user) return;
    let active = true;
    const load = async () => {
      const { data } = await supabase
        .from("notifications")
        .select("id,type,title,body,link,read_at,created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (active && data) setItems(data as Notification[]);
    };
    load();

    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => setItems((prev) => [payload.new as Notification, ...prev].slice(0, 50)),
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) =>
          setItems((prev) =>
            prev.map((n) =>
              n.id === (payload.new as Notification).id ? (payload.new as Notification) : n,
            ),
          ),
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [user]);

  const markAllRead = async () => {
    if (!user || unread === 0) return;
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .is("read_at", null);
    setItems((prev) =>
      prev.map((n) => (n.read_at ? n : { ...n, read_at: new Date().toISOString() })),
    );
  };

  const markOneRead = async (id: string) => {
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <div className="text-sm font-semibold">Notifications</div>
          <Button variant="ghost" size="sm" onClick={markAllRead} disabled={unread === 0}>
            <CheckCheck className="mr-1 h-3.5 w-3.5" /> Mark all read
          </Button>
        </div>
        <ScrollArea className="max-h-96">
          {items.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              You're all caught up.
            </div>
          ) : (
            <ul className="divide-y divide-border/60">
              {items.map((n) => {
                const Inner = (
                  <div
                    className={`flex gap-3 px-4 py-3 transition-colors hover:bg-muted/40 ${!n.read_at ? "bg-primary/[0.04]" : ""}`}
                  >
                    <div
                      className={`mt-1 h-2 w-2 shrink-0 rounded-full ${!n.read_at ? "bg-primary" : "bg-muted-foreground/30"}`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium leading-snug">{n.title}</div>
                      {n.body && (
                        <div className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                          {n.body}
                        </div>
                      )}
                      <div className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground/70">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                      </div>
                    </div>
                  </div>
                );
                return (
                  <li key={n.id} onClick={() => !n.read_at && markOneRead(n.id)}>
                    {n.link ? (
                      <Link to={n.link} onClick={() => setOpen(false)}>
                        {Inner}
                      </Link>
                    ) : (
                      Inner
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
        <div className="border-t border-border/60 px-4 py-2 text-center">
          <Link
            to="/notifications"
            onClick={() => setOpen(false)}
            className="text-xs text-primary hover:underline"
          >
            View all notifications
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
