import { Link, useRouterState } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { Bell, LogOut, Menu, Search, Settings, UserRound, X } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { SchoolLogo } from "@/components/brand/SchoolLogo";
import { Watermark } from "@/components/brand/Watermark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { signOut, useSessionUser } from "@/lib/session";
import { useSchoolIdentity } from "@/lib/school-identity";
import { useUnreadNotificationCount } from "@/lib/queries";
import { useRealtimeInvalidate } from "@/lib/realtime";
import type { RoleConfig } from "@/components/navigation/navConfig";

export interface AppUser {
  name: string;
  avatar: string;
  subtitle: string;
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
          <span className="block truncate text-sm font-extrabold leading-tight text-white">
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

  return (
    <div className="relative min-h-dvh bg-slate-50">
      <Watermark opacity={0.08} size="xl" className="pointer-events-none lg:left-64" />

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col bg-[#0b1b3a] lg:flex">
        <div className="flex h-[4.5rem] items-center border-b border-white/10 px-4">
          <PortalBrand
            isSchoolPortal={isSchoolPortal}
            logoUrl={logoUrl}
            schoolName={schoolName}
            homeTo={config.home}
          />
        </div>
        <div className="flex-1 overflow-y-auto hide-scrollbar">
          <NavLinks config={config} />
        </div>
        <div className="border-t border-white/10 p-3">
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
        <div className="mx-auto grid h-14 max-w-[1400px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-3 sm:h-16 sm:gap-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="shrink-0 lg:hidden"
                  aria-label="Open menu"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="left"
                hideClose
                className="w-[min(100vw-2rem,18rem)] border-r-0 bg-[#0b1b3a] p-0 text-white"
              >
                <SheetTitle className="sr-only">{config.label} navigation</SheetTitle>
                <div className="flex h-16 items-center justify-between gap-2 border-b border-white/10 px-3 sm:px-4">
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
                <div className="h-[calc(100dvh-4rem)] overflow-y-auto overscroll-contain">
                  <NavLinks config={config} onNavigate={() => setOpen(false)} />
                </div>
              </SheetContent>
            </Sheet>

            <span className="hidden text-sm font-bold text-primary lg:inline">
              {config.label} Portal
            </span>

            <Link
              to={config.home}
              preload="intent"
              className="pressable flex min-w-0 items-center gap-2 active:scale-[0.98] lg:hidden"
              aria-label={isSchoolPortal ? schoolName || "Home" : "D4EXAM home"}
            >
              {isSchoolPortal ? (
                <>
                  <SchoolLogo
                    logoUrl={logoUrl}
                    schoolName={schoolName}
                    size="sm"
                    className="bg-transparent"
                  />
                  <span className="max-w-[42vw] truncate text-sm font-bold text-slate-900 sm:max-w-[200px]">
                    {schoolName || config.label}
                  </span>
                </>
              ) : (
                <Logo size="md" wordmark={false} />
              )}
            </Link>
          </div>

          <div className="hidden justify-center md:flex">
            <div className="relative w-full max-w-sm">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden
              />
              <Input
                type="search"
                placeholder="Search exams, courses, students…"
                aria-label="Search"
                className="h-10 rounded-full border-slate-200 bg-slate-50/90 pl-9"
              />
            </div>
          </div>

          <div className="flex items-center gap-0.5 justify-self-end sm:gap-1">
            <NotificationBell to={notifPath} unread={unreadCount} />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="pressable flex items-center gap-1.5 rounded-full border border-transparent p-0.5 transition-colors hover:border-slate-200 hover:bg-slate-50 active:scale-[0.98] sm:gap-2 sm:pr-2"
                  aria-label="Account menu"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary/20 to-primary/10 text-[11px] font-bold text-primary ring-2 ring-white sm:h-9 sm:w-9 sm:text-xs">
                    {user.avatar}
                  </span>
                  <span className="hidden min-w-0 text-left sm:block">
                    <span className="block max-w-[120px] truncate text-xs font-bold leading-tight text-slate-900 md:max-w-[140px]">
                      {user.name}
                    </span>
                    <span className="block max-w-[120px] truncate text-[10px] leading-tight text-slate-500 md:max-w-[140px]">
                      {user.subtitle || config.label}
                    </span>
                  </span>
                </button>
              </DropdownMenuTrigger>

              {/* Compact profile menu — fits content, not oversized */}
              <DropdownMenuContent
                align="end"
                sideOffset={6}
                className={cn(
                  "z-[70] w-56 overflow-hidden rounded-xl border border-slate-200 bg-white p-0",
                  "shadow-lg",
                )}
              >
                <div className="border-b border-slate-100 px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-[11px] font-bold text-white">
                      {user.avatar}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold text-slate-900">{user.name}</p>
                      <p className="mt-0.5 inline-flex rounded-full bg-primary/10 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-primary">
                        {config.label}
                      </p>
                      {user.subtitle ? (
                        <p className="mt-0.5 truncate text-[10px] text-slate-500">{user.subtitle}</p>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="p-1">
                  <DropdownMenuItem
                    asChild
                    className="cursor-pointer rounded-lg px-2 py-1.5 focus:bg-slate-50"
                  >
                    <Link
                      to={`${config.home}/profile` as string}
                      preload="intent"
                      className="flex w-full items-center gap-2"
                    >
                      <UserRound className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden />
                      <span className="text-xs font-semibold text-slate-900">Profile</span>
                    </Link>
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    asChild
                    className="cursor-pointer rounded-lg px-2 py-1.5 focus:bg-slate-50"
                  >
                    <Link
                      to={`${config.home}/settings` as string}
                      preload="intent"
                      className="flex w-full items-center gap-2"
                    >
                      <Settings className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden />
                      <span className="text-xs font-semibold text-slate-900">Settings</span>
                    </Link>
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    asChild
                    className="cursor-pointer rounded-lg px-2 py-1.5 focus:bg-slate-50"
                  >
                    <Link
                      to={notifPath as string}
                      preload="intent"
                      className="flex w-full items-center gap-2"
                    >
                      <span className="relative">
                        <Bell className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden />
                        {unreadCount > 0 ? (
                          <span className="absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full bg-red-500" />
                        ) : null}
                      </span>
                      <span className="flex flex-1 items-center justify-between gap-2 text-xs font-semibold text-slate-900">
                        Notifications
                        {unreadCount > 0 ? (
                          <span className="rounded-full bg-red-500 px-1.5 py-px text-[9px] font-bold text-white">
                            {unreadCount > 99 ? "99+" : unreadCount}
                          </span>
                        ) : null}
                      </span>
                    </Link>
                  </DropdownMenuItem>
                </div>

                <DropdownMenuSeparator className="my-0 bg-slate-100" />

                <div className="p-1">
                  <DropdownMenuItem
                    onSelect={() => void signOut()}
                    className="cursor-pointer rounded-lg px-2 py-1.5 text-red-600 focus:bg-red-50 focus:text-red-700"
                  >
                    <LogOut className="mr-2 h-3.5 w-3.5" aria-hidden />
                    <span className="text-xs font-semibold">Logout</span>
                  </DropdownMenuItem>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <div className="relative z-10 pt-14 sm:pt-16 lg:pl-64">
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
