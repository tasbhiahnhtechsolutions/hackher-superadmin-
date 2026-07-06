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

  const logoLabel = (() => {
    if (role === "super_admin") return "HackHer SA";
    if (role === "sam") return "HackHer SAM";
    if (role === "manager") return "HackHer Manager";
    if (role === "affiliate") return "HackHer";
    return "HackHer";
  })();

  const navList = (
    <nav className="flex-1 flex flex-col pt-0 pb-6">
      {items.map((item, i) => {
        if (item.isSection) {
          return (
            <div key={`sec-${i}`} className={`px-5 text-[10px] font-bold uppercase tracking-wider text-[#6B7280] mb-1 ${i === 0 ? "mt-2" : "mt-5"}`}>
              {item.label}
            </div>
          );
        }

        const isDashboard = item.to === "/admin" || item.to === "/sam" || item.to === "/manager" || item.to === "/affiliate";
        const active = isDashboard
          ? (pathname === item.to || pathname === item.to + "/")
          : (pathname === item.to || pathname.startsWith(item.to + "/"));
        return (
          <Link
            key={item.to}
            to={item.to || "#"}
            onClick={() => setMobileOpen(false)}
            className={`flex items-center gap-3 px-5 py-2.5 text-[13px] font-medium transition-all border-l-3 ${active
              ? "bg-[#FCE5D7] text-[#C4541E] border-[#E86E3C] font-semibold"
              : "text-[#374151] hover:bg-[#F9FAFB] hover:text-[#18294F] border-transparent"
              }`}
          >
            {item.icon && <item.icon className="h-[18px] w-[18px] shrink-0" />}
            <span>{item.label}</span>
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
    <div className="flex min-h-screen w-full bg-[#F3F4F6]">
      {/* Sidebar */}
      <aside className="hidden w-[240px] flex-col bg-white border-r border-[#E5E7EB] md:flex shrink-0">
        <div className="flex px-5 pt-6 pb-4 items-center gap-2.5 text-[18px] font-extrabold text-[#0F1A33] border-b border-[#E5E7EB] mb-3 tracking-tight">
          <div className="w-2 h-6 rounded-[2px] bg-gradient-to-b from-[#E86E3C] to-[#18294F] shrink-0" />
          <span>{logoLabel}</span>
        </div>
        {navList}
        <div className="p-4 mt-auto border-t border-[#E5E7EB]">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left bg-[#F9FAFB] border border-[#E5E7EB] hover:bg-[#F3F4F6] transition cursor-pointer">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white">
                  {initials}
                </div>
                <div className="flex-1 overflow-hidden">
                  <div className="truncate text-sm font-semibold text-[#111827]">
                    {profile?.full_name ?? profile?.email}
                  </div>
                  <div className="truncate text-xs text-[#6B7280]">
                    {role ? ROLE_LABELS[role] : ""}
                  </div>
                </div>
                <ChevronDown className="h-4 w-4 text-[#6B7280]" />
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
        <header className="flex h-16 items-center justify-between border-b border-[#E5E7EB] bg-white/80 px-4 md:px-6 backdrop-blur">
          <div className="flex items-center gap-2 md:hidden">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-64 bg-white border-r border-[#E5E7EB]">
                <div className="flex h-16 items-center gap-2.5 border-b border-[#E5E7EB] px-5">
                  <div className="w-2 h-6 rounded-[2px] bg-gradient-to-b from-[#E86E3C] to-[#18294F] shrink-0" />
                  <span className="text-sm font-semibold">
                    {logoLabel}
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
        <main className="flex-1 overflow-auto p-7 lg:p-8 max-w-[1100px] bg-[#F3F4F6]">
          {children ?? <Outlet />}
        </main>
      </div>
    </div>
  );
}
