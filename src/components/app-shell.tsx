import { ReactNode, useState } from "react";
import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuth, ROLE_LABELS, type AppRole } from "@/lib/auth";
import {
  LayoutDashboard,
  Users,
  UserCog,
  Tag,
  CreditCard,
  Wallet,
  FileBarChart,
  ScrollText,
  Settings,
  LogOut,
  ChevronDown,
  ShieldAlert,
  Activity,
  TrendingUp,
  Menu,
  Megaphone,
  DollarSign,
  BarChart,
  LineChart,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { NotificationBell } from "@/components/notification-bell";

interface NavItem {
  to?: string;
  label: string;
  icon?: typeof Users;
  isSection?: boolean;
}

const NAV_BY_ROLE: Record<AppRole, NavItem[]> = {
  super_admin: [
    { label: "Overview", isSection: true },
    { to: "/admin", label: "Dashboard", icon: LayoutDashboard },
    { label: "People", isSection: true },
    { to: "/admin/sams", label: "My SAMs", icon: UserCog },
    { to: "/admin/managers", label: "Managers", icon: Users },
    { to: "/admin/affiliates", label: "All Affiliates", icon: Megaphone },
    { label: "Marketing", isSection: true },
    { to: "/admin/promo-codes", label: "Promo Codes", icon: Tag },
    { to: "/admin/campaigns", label: "Campaigns", icon: LineChart },
    { label: "Finance", isSection: true },
    { to: "/admin/commissions", label: "Commissions", icon: DollarSign },
    { to: "/admin/payouts", label: "Payouts", icon: CreditCard },
    { label: "Activity", isSection: true },
    { to: "/admin/changelog", label: "Change Logs", icon: ScrollText },
  ],
  sam: [
    { label: "Overview", isSection: true },
    { to: "/sam", label: "Dashboard", icon: LayoutDashboard },
    { label: "People", isSection: true },
    { to: "/sam/managers", label: "Managers", icon: Users },
    { to: "/sam/affiliates", label: "All Affiliates", icon: Megaphone },
    { label: "Marketing", isSection: true },
    { to: "/sam/promo-codes", label: "Promo Codes", icon: Tag },
    { to: "/sam/campaigns", label: "Campaigns", icon: LineChart },
    { label: "Finance", isSection: true },
    { to: "/sam/commissions", label: "Commissions", icon: DollarSign },
    { to: "/sam/payouts", label: "Payouts", icon: CreditCard },
    { to: "/sam/earnings", label: "My Earnings", icon: Wallet },
    { label: "Activity", isSection: true },
    { to: "/sam/changelog", label: "Change Logs", icon: ScrollText },
  ],
  manager: [
    { label: "Overview", isSection: true },
    { to: "/manager", label: "Dashboard", icon: LayoutDashboard },
    { label: "My Affiliates", isSection: true },
    { to: "/manager/affiliates", label: "Affiliates", icon: Megaphone },
    { to: "/manager/promo-codes", label: "Promo Codes", icon: Tag },
    { label: "Analytics", isSection: true },
    { to: "/manager/campaigns", label: "Campaign Analytics", icon: LineChart },
    { label: "Finance", isSection: true },
    { to: "/manager/earnings", label: "My Earnings", icon: Wallet },
    { to: "/manager/payouts", label: "Payouts", icon: CreditCard },
    { to: "/manager/reports", label: "Reports", icon: FileBarChart },
    { label: "Activity", isSection: true },
    { to: "/manager/changelog", label: "Change Logs", icon: ScrollText },
  ],
  affiliate: [
    { label: "My Dashboard", isSection: true },
    { to: "/affiliate", label: "Overview", icon: LayoutDashboard },
    { to: "/affiliate/my-code", label: "My Promo Codes", icon: Tag },
    { to: "/affiliate/subscribers", label: "Subscribers", icon: Users },
    { to: "/affiliate/analytics", label: "Performance Graph", icon: LineChart },
    { to: "/affiliate/earnings", label: "My Earnings", icon: Wallet },
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
    <nav className="flex-1 flex flex-col py-6">
      {items.map((item, i) => {
        if (item.isSection) {
          return (
            <div key={`sec-${i}`} className="px-6 text-[11px] font-bold uppercase tracking-wide text-[#4B6396] mt-6 mb-2">
              {item.label}
            </div>
          );
        }

        const active = pathname === item.to || pathname.startsWith(item.to + "/");
        return (
          <Link
            key={item.to}
            to={item.to || "#"}
            onClick={() => setMobileOpen(false)}
            className={`flex items-center gap-3 px-6 py-2.5 text-sm font-medium transition-all ${active
              ? "bg-gradient-to-r from-accent/15 to-transparent text-white border-l-4 border-accent"
              : "text-[#A0B3D6] hover:bg-white/5 hover:text-white border-l-4 border-transparent"
              }`}
          >
            {item.icon && <item.icon className="h-[18px] w-[18px]" />}
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
    .split(" ")
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* Sidebar */}
      <aside className="hidden w-[260px] flex-col bg-[#0F1A33] md:flex shrink-0">
        <div className="flex px-6 pt-6 pb-2 items-center gap-2">
          <div className="text-xl font-extrabold tracking-tight text-white flex items-center gap-2">
            HackHer <span className="font-normal text-sm text-[#A0B3D6] tracking-normal uppercase ml-1">Affiliate</span>
          </div>
        </div>
        {navList}
        <div className="p-4 mt-auto border-t border-white/10">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left bg-white/5 hover:bg-white/10 transition">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white">
                  {initials}
                </div>
                <div className="flex-1 overflow-hidden">
                  <div className="truncate text-sm font-medium text-white">
                    {profile?.full_name ?? profile?.email}
                  </div>
                  <div className="truncate text-xs text-[#A0B3D6]">
                    {role ? ROLE_LABELS[role] : ""}
                  </div>
                </div>
                <ChevronDown className="h-4 w-4 text-[#A0B3D6]" />
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
                <Button variant="ghost" size="icon">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-64 bg-sidebar">
                <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-5">
                  <div className="h-8 w-8 rounded-lg bg-gradient-brand" />
                  <span className="text-sm font-semibold">
                    HackHer<span className="text-primary">.ai</span>
                  </span>
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
        <main className="flex-1 overflow-auto p-7 lg:p-8 max-w-[1100px]">
          {children ?? <Outlet />}
        </main>
      </div>
    </div>
  );
}
