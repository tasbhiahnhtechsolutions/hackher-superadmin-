import { ReactNode, useState } from "react";
import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuth, ROLE_LABELS, type AppRole } from "@/lib/auth";
import {
  LayoutDashboard, Users, UserCog, Tag, CreditCard, Wallet,
  FileBarChart, ScrollText, Settings, LogOut, ChevronDown,
  ShieldAlert, Activity, TrendingUp, Menu,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { NotificationBell } from "@/components/notification-bell";

interface NavItem { to: string; label: string; icon: typeof Users; }

const NAV_BY_ROLE: Record<AppRole, NavItem[]> = {
  super_admin: [
    { to: "/admin", label: "Dashboard", icon: LayoutDashboard },
    { to: "/admin/sams", label: "Super Admin Managers", icon: UserCog },
    { to: "/admin/users", label: "Users & Roles", icon: Users },
    { to: "/admin/plans", label: "Subscription Plans", icon: CreditCard },
    { to: "/admin/promo-codes", label: "Promo Codes", icon: Tag },
    { to: "/admin/payouts", label: "Payouts", icon: Wallet },
    { to: "/admin/reports", label: "Reports", icon: FileBarChart },
    { to: "/admin/analytics", label: "Analytics", icon: TrendingUp },
    { to: "/admin/fraud", label: "Fraud Review", icon: ShieldAlert },
    { to: "/admin/system", label: "System Health", icon: Activity },
    { to: "/admin/audit-logs", label: "Audit Logs", icon: ScrollText },
    { to: "/admin/emails", label: "Email Delivery", icon: ScrollText },
    { to: "/admin/settings", label: "Settings", icon: Settings },
  ],
  sam: [
    { to: "/sam", label: "Dashboard", icon: LayoutDashboard },
    { to: "/sam/managers", label: "Managers", icon: UserCog },
    { to: "/sam/affiliates", label: "Affiliates", icon: Users },
    { to: "/sam/promo-codes", label: "Promo Codes", icon: Tag },
    { to: "/sam/payouts", label: "Payouts", icon: Wallet },
    { to: "/sam/reports", label: "Reports", icon: FileBarChart },
  ],
  manager: [
    { to: "/manager", label: "Dashboard", icon: LayoutDashboard },
    { to: "/manager/affiliates", label: "Affiliates", icon: Users },
    { to: "/manager/promo-codes", label: "Promo Codes", icon: Tag },
    { to: "/manager/subscribers", label: "Subscribers", icon: CreditCard },
    { to: "/manager/reports", label: "Reports", icon: FileBarChart },
  ],
  affiliate: [
    { to: "/affiliate", label: "Dashboard", icon: LayoutDashboard },
    { to: "/affiliate/my-code", label: "My Promo Code", icon: Tag },
    { to: "/affiliate/analytics", label: "Campaign Analytics", icon: TrendingUp },
    { to: "/affiliate/earnings", label: "Earnings", icon: Wallet },
    { to: "/affiliate/subscribers", label: "Subscribers", icon: Users },
  ],
  customer: [],
};

export function AppShell({ children }: { children?: ReactNode }) {
  const { profile, role, signOut } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const items = role ? NAV_BY_ROLE[role] : [];
  const [mobileOpen, setMobileOpen] = useState(false);

  const navList = (
    <nav className="flex-1 space-y-1 p-3">
      {items.map((item) => {
        const active = pathname === item.to || pathname.startsWith(item.to + "/");
        return (
          <Link key={item.to} to={item.to} onClick={() => setMobileOpen(false)}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
              active ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
            }`}>
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/login" });
  };

  const initials = (profile?.full_name || profile?.email || "?")
    .split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* Sidebar */}
      <aside className="hidden w-64 flex-col border-r border-border/60 bg-sidebar md:flex">
        <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-5">
          <div className="h-8 w-8 rounded-lg bg-gradient-brand shadow-glow" />
          <div className="flex flex-col">
            <span className="text-sm font-semibold leading-none">HackHer<span className="text-primary">.ai</span></span>
            <span className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">Affiliate Portal</span>
          </div>
        </div>
        {navList}
        <div className="border-t border-sidebar-border p-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-sidebar-accent/60">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-brand text-xs font-semibold text-primary-foreground">
                  {initials}
                </div>
                <div className="flex-1 overflow-hidden">
                  <div className="truncate text-sm font-medium">{profile?.full_name ?? profile?.email}</div>
                  <div className="truncate text-xs text-muted-foreground">{role ? ROLE_LABELS[role] : ""}</div>
                </div>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>{profile?.email}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut}>
                <LogOut className="mr-2 h-4 w-4" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex h-16 items-center justify-between border-b border-border/60 bg-background/80 px-4 md:px-6 backdrop-blur">
          <div className="flex items-center gap-2 md:hidden">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon"><Menu className="h-5 w-5" /></Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-64 bg-sidebar">
                <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-5">
                  <div className="h-8 w-8 rounded-lg bg-gradient-brand" />
                  <span className="text-sm font-semibold">HackHer<span className="text-primary">.ai</span></span>
                </div>
                {navList}
              </SheetContent>
            </Sheet>
            <span className="font-semibold text-sm">HackHer.ai</span>
          </div>
          <div className="hidden md:block" />
          <div className="flex items-center gap-1">
            <NotificationBell />
            <Button variant="ghost" size="sm" onClick={handleSignOut} className="md:hidden">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </header>
        <main className="flex-1 overflow-auto">{children ?? <Outlet />}</main>
      </div>
    </div>
  );
}
