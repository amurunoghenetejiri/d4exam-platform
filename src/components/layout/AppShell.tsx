import { Link, useRouterState } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import {
  Bell,
  Building2,
  ChevronRight,
  GraduationCap,
  LogOut,
  Menu,
  Search,
  Settings,
  Shield,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { SchoolLogo } from "@/components/brand/SchoolLogo";
import { Watermark } from "@/components/brand/Watermark";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn, shortLabel, shortDisplayName } from "@/lib/utils";
import { initials, signOut, useSessionUser, type AppRole } from "@/lib/session";
import { useSchoolIdentity } from "@/lib/school-identity";
import { useUnreadNotificationCount } from "@/lib/queries";
import { useRealtimeInvalidate } from "@/lib/realtime";
import type { RoleConfig } from "@/components/navigation/navConfig";

export interface AppUser {
  name: string;
  avatar: string;
  subtitle: string;
}

/** Shared role visual identity for navbar account menu (all portals). */
const roleTheme: Record<
  string,
  {
    label: string;
    icon: typeof UserRound;
    badge: string;
    avatar: string;
    ring: string;
    header: string;
    accentBar: string;
  }
> = {
  student: {
    label: "Student",
    icon: GraduationCap,
    badge: "border-sky-200/90 bg-sky-50 text-sky-800",
    avatar: "from-sky-500 to-blue-600 shadow-sky-500/30",
    ring: "ring-sky-100",
    header: "from-sky-50/90 via-white to-blue-50/40",
    accentBar: "from-sky-400 to-blue-500",
  },
  teacher: {
    label: "Teacher",
    icon: UserRound,
    badge: "border-violet-200/90 bg-violet-50 text-violet-800",
    avatar: "from-violet-500 to-purple-600 shadow-violet-500/30",
    ring: "ring-violet-100",
    header: "from-violet-50/90 via-white to-purple-50/40",
    accentBar: "from-violet-400 to-purple-500",
  },
  school_admin: {
    label: "School Admin",
    icon: Building2,
    badge: "border-emerald-200/90 bg-emerald-50 text-emerald-800",
    avatar: "from-emerald-500 to-teal-600 shadow-emerald-500/30",
    ring: "ring-emerald-100",
    header: "from-emerald-50/90 via-white to-teal-50/40",
    accentBar: "from-emerald-400 to-teal-500",
  },
  examination_officer: {
    label: "Exam Officer",
    icon: Shield,
    badge: "border-amber-200/90 bg-amber-50 text-amber-900",
    avatar: "from-amber-500 to-orange-600 shadow-amber-500/30",
    ring: "ring-amber-100",
    header: "from-amber-50/90 via-white to-orange-50/40",
    accentBar: "from-amber-400 to-orange-500",
  },
  super_admin: {
    label: "Super Admin",
    icon: ShieldCheck,
    badge: "border-indigo-200/90 bg-indigo-50 text-indigo-900",
    avatar: "from-indigo-500 to-blue-700 shadow-indigo-500/30",
    ring: "ring-indigo-100",
    header: "from-indigo-50/90 via-white to-blue-50/40",
    accentBar: "from-indigo-400 to-blue-600",
  },
};

const fallbackTheme = {
  label: "User",
  icon: UserRound,
  badge: "border-slate-200 bg-slate-50 text-slate-700",
  avatar: "from-primary to-primary/80 shadow-primary/25",
  ring: "ring-primary/15",
  header: "from-slate-50 via-white to-primary/[0.04]",
  accentBar: "from-primary to-primary/70",
};

function getRoleTheme(role: AppRole | string | null | undefined) {
  if (!role) return fallbackTheme;
  return roleTheme[role] ?? fallbackTheme;
}

function AccountRoleBadge({
  role,
  className,
}: {
  role: AppRole | string | null | undefined;
  className?: string;
}) {
  if (!role) return null;
  const theme = getRoleTheme(role);
  const Icon = theme.icon;
  const label = roleTheme[role]?.label ?? String(role).replace(/_/g, " ");

  return (
    <Badge
      variant="outline"
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide shadow-sm",
        theme.badge,
        className,
      )}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden />
      <span className="truncate">{label}</span>
    </Badge>
  );
}

function NavLinks({ config, onNavigate }: { config: RoleConfig; onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav className="flex flex-col gap-5 px-3 py-4" aria-label={`${config.label} navigation`}>
      {config.groups.map((group, gi) => (
        <div key={gi}>
          {group.label && (
            <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              {group.label}
            </p>
          )}
          <ul className="space-y-1">
            {group.items.map((item) => {
              const active =
                item.to === config.home ? pathname === item.to : pathname.startsWith(item.to);
              return (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    preload="intent"
                    onClick={onNavigate}
                    className={cn(
                      "pressable flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors",
                      "active:scale-[0.98] active:bg-white/10",
                      active
                        ? "bg-blue-500/20 text-white"
                        : "text-slate-300 hover:bg-white/5 hover:text-white",
                    )}
                    aria-current={active ? "page" : undefined}
                  >
                    <item.icon className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function PortalBrand({
  isSchoolPortal,
  logoUrl,
  schoolName,
  homeTo,
}: {
  isSchoolPortal: boolean;
  logoUrl: string | null;
  schoolName: string | null;
  homeTo: string;
}) {
  if (isSchoolPortal) {
    return (
      <Link
        to={homeTo}
        preload="intent"
        className="pressable flex min-w-0 items-center gap-2.5 active:scale-[0.98]"
        aria-label={schoolName || "School home"}
      >
        <SchoolLogo
          logoUrl={logoUrl}
          schoolName={schoolName}
          size="md"
          className="shrink-0 bg-transparent"
        />
        <span className="min-w-0">
          <span className="block truncate text-sm font-extrabold leading-tight text-white sm:text-base">
            {schoolName || "School"}
          </span>
          <span className="mt-0.5 flex items-center gap-1.5 text-[10px] font-semibold text-slate-400">
            <img
              src="/logo.png"
              alt=""
              className="h-3.5 w-auto object-contain bg-transparent opacity-80"
            />
            Powered by D4EXAM
          </span>
        </span>
      </Link>
    );
  }
  return (
    <Link to="/" preload="intent" aria-label="D4EXAM home" className="pressable min-w-0 active:scale-[0.98]">
      <Logo size="md" />
    </Link>
  );
}

function NotificationBell({ to, unread }: { to: string; unread: number }) {
  const hasUnread = unread > 0;
  const label = unread > 99 ? "99+" : unread > 0 ? String(unread) : undefined;

  return (
    <Button
      variant="ghost"
      size="icon"
      className="relative shrink-0"
      aria-label={hasUnread ? `${unread} unread notifications` : "Notifications"}
      asChild
    >
      <Link to={to as string} preload="intent">
        <span className={cn("inline-flex", hasUnread && "bell-ring")}>
          <Bell className="h-5 w-5 text-slate-600" aria-hidden />
        </span>
        {hasUnread ? (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white shadow-sm">
            {label}
          </span>
        ) : null}
      </Link>
    </Button>
  );
}

export function AppShell({
  config,
  user,
  children,
}: {
  config: RoleConfig;
  user: AppUser;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: session } = useSessionUser();
  const { data: school } = useSchoolIdentity(session?.schoolId);

  useRealtimeInvalidate(
    `shell-notifs-${session?.userId ?? "x"}`,
    session?.userId
      ? [{ table: "notifications", filter: `recipient_user_id=eq.${session.userId}` }]
      : [],
    [
      ["count", "notifications", "unread", session?.userId],
      ["rows", "notifications"],
      ["student-dashboard-notifs"],
    ],
    Boolean(session?.userId),
    800,
  );

  const unreadQ = useUnreadNotificationCount(session?.userId);
  const unreadCount = unreadQ.data ?? 0;

  const notifPath = `${config.home}/notifications`;
  const logoUrl = school?.logoUrl ?? session?.schoolLogoUrl ?? null;
  const schoolName = school?.name ?? session?.schoolName ?? null;
  const isSchoolPortal = Boolean(session?.schoolId) && session?.role !== "super_admin";
  const avatarLetters = user.avatar || initials(user.name || "U");
  const role = session?.role ?? null;
  const theme = getRoleTheme(role);

  return (
    <div className="relative min-h-dvh bg-slate-50">
      <Watermark opacity={0.08} size="xl" className="pointer-events-none lg:left-64" />

      <aside className="fixed inset-y-0 left-0 z-40 hidden h-dvh max-h-dvh w-64 flex-col bg-[#0b1b3a] lg:flex">
        <div className="flex h-[4.5rem] shrink-0 items-center border-b border-white/10 px-4">
          <PortalBrand
            isSchoolPortal={isSchoolPortal}
            logoUrl={logoUrl}
            schoolName={schoolName}
            homeTo={config.home}
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain hide-scrollbar">
          <NavLinks config={config} />
        </div>
        <div className="shrink-0 border-t border-white/10 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]">
          <button
            type="button"
            onClick={() => void signOut()}
            className="pressable flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-300 transition-colors hover:bg-white/5 hover:text-white active:scale-[0.98]"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            Logout
          </button>
        </div>
      </aside>

      <header
        className={cn(
          "fixed top-0 right-0 z-50 border-b border-slate-200/90",
          "left-0 lg:left-64",
          "bg-white shadow-sm",
          "supports-[backdrop-filter]:bg-white/95 supports-[backdrop-filter]:backdrop-blur-md",
        )}
        style={{ position: "fixed" }}
      >
        <div className="mx-auto grid h-12 max-w-[1400px] grid-cols-[minmax(0,1fr)_auto] items-center gap-1.5 px-2.5 sm:h-16 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 shrink-0 lg:hidden"
                  aria-label="Open menu"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="left"
                hideClose
                className="flex h-dvh max-h-dvh w-[min(100vw-2rem,18rem)] flex-col border-r-0 bg-[#0b1b3a] p-0 text-white"
              >
                <SheetTitle className="sr-only">{config.label} navigation</SheetTitle>
                <div className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-white/10 px-3 sm:px-4">
                  <div className="min-w-0 flex-1">
                    <PortalBrand
                      isSchoolPortal={isSchoolPortal}
                      logoUrl={logoUrl}
                      schoolName={schoolName}
                      homeTo={config.home}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Close menu"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-white/90 transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                  >
                    <X className="h-5 w-5" strokeWidth={2.25} />
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                  <NavLinks config={config} onNavigate={() => setOpen(false)} />
                </div>
                <div className="shrink-0 border-t border-white/10 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]">
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      void signOut();
                    }}
                    className="pressable flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-300 transition-colors hover:bg-white/5 hover:text-white active:scale-[0.98]"
                  >
                    <LogOut className="h-4 w-4" aria-hidden />
                    Logout
                  </button>
                </div>
              </SheetContent>
            </Sheet>

            <span className="hidden text-sm font-bold text-primary lg:inline">
              {config.label} Portal
            </span>

            <Link
              to={config.home}
              preload="intent"
              className="pressable flex min-w-0 max-w-[min(100%,13.5rem)] items-center gap-1.5 active:scale-[0.98] sm:max-w-[18rem] md:max-w-[22rem] lg:hidden"
              aria-label={isSchoolPortal ? schoolName || "Home" : "D4EXAM home"}
            >
              {isSchoolPortal ? (
                <>
                  <SchoolLogo
                    logoUrl={logoUrl}
                    schoolName={schoolName}
                    size="sm"
                    className="shrink-0 bg-transparent"
                  />
                  <span className="truncate text-sm font-extrabold leading-tight tracking-tight text-slate-900 sm:text-[0.9375rem] md:text-base">
                    {shortLabel(schoolName || "School", 28)}
                  </span>
                </>
              ) : (
                <Logo size="sm" />
              )}
            </Link>
          </div>

          <div className="hidden min-w-0 md:block">
            <div className="relative max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Search…"
                className="h-10 rounded-xl border-slate-200 bg-slate-50 pl-9"
                aria-label="Search"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-0.5 sm:gap-2">
            <NotificationBell to={notifPath} unread={unreadCount} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="gap-2 px-1.5 sm:px-2"
                  aria-label="Account menu"
                >
                  <span
                    className={cn(
                      "grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br text-[11px] font-bold text-white shadow-md ring-2 ring-white",
                      theme.avatar,
                    )}
                  >
                    {avatarLetters.slice(0, 2)}
                  </span>
                  <span className="hidden max-w-[8rem] truncate text-left text-sm font-semibold sm:block">
                    {shortDisplayName(user.name, 16)}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className={cn(
                  "z-[70] w-[17.5rem] overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-0 shadow-xl shadow-slate-300/40",
                )}
              >
                {/* Role-tinted header — shared by student / teacher / admin / officer / super-admin */}
                <div className={cn("relative border-b border-slate-100 bg-gradient-to-br", theme.header)}>
                  <div
                    className={cn("absolute inset-x-0 top-0 h-1 bg-gradient-to-r", theme.accentBar)}
                    aria-hidden
                  />
                  <div className="px-3.5 pb-3.5 pt-4">
                    <div className="flex items-start gap-3">
                      <span
                        className={cn(
                          "grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-to-br text-sm font-bold text-white shadow-md ring-2 ring-white",
                          theme.avatar,
                          theme.ring,
                        )}
                      >
                        {avatarLetters.slice(0, 2)}
                      </span>
                      <div className="min-w-0 flex-1 pt-0.5">
                        <p className="truncate text-sm font-extrabold leading-tight text-slate-900">
                          {shortDisplayName(user.name, 28)}
                        </p>
                        {user.subtitle ? (
                          <p className="mt-0.5 truncate text-[11px] font-medium text-slate-500">
                            {user.subtitle}
                          </p>
                        ) : null}
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <AccountRoleBadge role={role} />
                          <span className="truncate text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                            {config.label} portal
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-1.5">
                  <DropdownMenuItem asChild>
                    <Link
                      to={`${config.home}/profile` as never}
                      className="cursor-pointer rounded-xl px-2.5 py-2.5"
                    >
                      <span className="mr-2.5 grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-slate-600">
                        <UserRound className="h-4 w-4" />
                      </span>
                      <span className="flex-1 text-left">
                        <span className="block text-sm font-semibold text-slate-900">Profile</span>
                        <span className="block text-[11px] font-medium text-slate-500">
                          View & edit your details
                        </span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" aria-hidden />
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link
                      to={`${config.home}/settings` as never}
                      className="cursor-pointer rounded-xl px-2.5 py-2.5"
                    >
                      <span className="mr-2.5 grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-slate-600">
                        <Settings className="h-4 w-4" />
                      </span>
                      <span className="flex-1 text-left">
                        <span className="block text-sm font-semibold text-slate-900">Settings</span>
                        <span className="block text-[11px] font-medium text-slate-500">
                          Preferences & security
                        </span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" aria-hidden />
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="my-1.5" />
                  <DropdownMenuItem
                    className="cursor-pointer rounded-xl px-2.5 py-2.5 text-red-600 focus:bg-red-50 focus:text-red-700"
                    onClick={() => void signOut()}
                  >
                    <span className="mr-2.5 grid h-8 w-8 place-items-center rounded-lg bg-red-50 text-red-600">
                      <LogOut className="h-4 w-4" />
                    </span>
                    <span className="flex-1 text-left">
                      <span className="block text-sm font-semibold">Logout</span>
                      <span className="block text-[11px] font-medium text-red-500/80">
                        Sign out of this device
                      </span>
                    </span>
                  </DropdownMenuItem>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <div className="relative z-10 pt-12 sm:pt-16 lg:pl-64">
        <main className="mx-auto w-full max-w-[1200px] px-3 pb-28 pt-4 sm:px-6 sm:pt-6 lg:pb-10">
          <div className="min-w-0 w-full">{children}</div>
        </main>
      </div>

      {config.bottomNav && (
        <nav
          className={cn(
            "fixed inset-x-0 bottom-0 z-40 lg:hidden",
            "border-t border-slate-200 bg-white",
            "pb-[env(safe-area-inset-bottom,0px)]",
            "shadow-[0_-2px_10px_rgba(15,23,42,0.06)]",
          )}
          aria-label="Primary"
        >
          <ul className="grid h-14 grid-cols-4">
            {config.bottomNav.map((item) => {
              const active =
                item.to === config.home
                  ? pathname === item.to || pathname === `${item.to}/`
                  : pathname === item.to || pathname.startsWith(`${item.to}/`);
              return (
                <li key={item.to} className="min-w-0">
                  <Link
                    to={item.to}
                    preload="intent"
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex h-full min-h-[3.5rem] w-full flex-col items-center justify-center gap-0.5 px-1 text-[10px] font-semibold",
                      active ? "text-primary" : "text-slate-500",
                    )}
                  >
                    <item.icon
                      className={cn("h-5 w-5 shrink-0", active && "stroke-[2.25]")}
                      aria-hidden
                    />
                    <span className={cn("truncate max-w-full", active && "font-bold")}>
                      {item.label}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </div>
  );
}
