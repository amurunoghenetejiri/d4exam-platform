import { Link, useRouterState } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { Bell, LogOut, Menu, Search, X } from "lucide-react";
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { signOut, useSessionUser } from "@/lib/session";
import { useSchoolIdentity } from "@/lib/school-identity";
import { useCount } from "@/lib/queries";
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
  const unread = useCount(
    "notifications",
    session?.userId
      ? [{ column: "recipient_user_id", value: session.userId }]
      : [],
    Boolean(session?.userId),
  );

  const notifPath = `${config.home}/notifications`;
  const showDot = (unread.data ?? 0) > 0;
  const logoUrl = school?.logoUrl ?? session?.schoolLogoUrl ?? null;
  const schoolName = school?.name ?? session?.schoolName ?? null;
  const isSchoolPortal = Boolean(session?.schoolId) && session?.role !== "super_admin";

  return (
    <div className="relative min-h-dvh bg-slate-50">
      <Watermark opacity={0.08} size="xl" className="lg:left-64" />

      {/* Desktop sidebar — fixed */}
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

      {/*
        Main column: sticky top bar stays locked while page content scrolls.
        sticky is more reliable than fixed on mobile Safari.
      */}
      <div className="relative z-10 lg:pl-64">
        <header
          className={cn(
            "sticky top-0 z-50 border-b border-slate-200/90",
            "bg-white/95 shadow-[0_1px_0_rgba(15,23,42,0.04),0_4px_12px_rgba(15,23,42,0.04)]",
            "backdrop-blur-md supports-[backdrop-filter]:bg-white/90",
          )}
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
                  className="w-[min(100vw-2rem,18rem)] border-r-0 bg-[#0b1b3a] p-0"
                >
                  <SheetTitle className="sr-only">{config.label} navigation</SheetTitle>
                  <div className="flex h-16 items-center justify-between gap-2 border-b border-white/10 px-4">
                    <PortalBrand
                      isSchoolPortal={isSchoolPortal}
                      logoUrl={logoUrl}
                      schoolName={schoolName}
                      homeTo={config.home}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0 text-white hover:bg-white/10 hover:text-white"
                      onClick={() => setOpen(false)}
                      aria-label="Close menu"
                    >
                      <X className="h-5 w-5" />
                    </Button>
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
              <Button
                variant="ghost"
                size="icon"
                className="relative shrink-0"
                aria-label="Notifications"
                asChild
              >
                <Link to={notifPath as string} preload="intent">
                  <Bell className="h-5 w-5 text-slate-600" />
                  {showDot && (
                    <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary" />
                  )}
                </Link>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="pressable flex items-center gap-2 rounded-full p-1 pr-1.5 transition-colors hover:bg-slate-100 active:scale-[0.98] sm:pr-2"
                    aria-label="Account menu"
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-blue-100 text-xs font-bold text-primary">
                      {user.avatar}
                    </span>
                    <span className="hidden text-left sm:block">
                      <span className="block max-w-[140px] truncate text-xs font-bold leading-tight text-slate-900">
                        {user.name}
                      </span>
                      <span className="block max-w-[120px] truncate text-[11px] leading-tight text-slate-500 md:max-w-[160px]">
                        {user.subtitle}
                      </span>
                    </span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="z-[60] w-56 border-slate-200 bg-white">
                  <DropdownMenuLabel className="text-slate-900">{user.name}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to={`${config.home}/profile` as string} preload="intent">
                      Profile
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to={`${config.home}/settings` as string} preload="intent">
                      Settings
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to={notifPath as string} preload="intent">
                      Notifications
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => void signOut()}>Logout</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        <main className="relative z-10 mx-auto w-full max-w-[1200px] px-3 pb-28 pt-4 sm:px-6 sm:pt-6 lg:pb-10">
          <div className="min-w-0 w-full overflow-x-hidden">{children}</div>
        </main>
      </div>

      {config.bottomNav && (
        <nav
          className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_12px_rgba(15,23,42,0.04)] backdrop-blur lg:hidden"
          aria-label="Primary"
        >
          <ul className="grid grid-cols-4">
            {config.bottomNav.map((item) => {
              const active =
                item.to === config.home
                  ? pathname === item.to || pathname === `${item.to}/`
                  : pathname === item.to || pathname.startsWith(`${item.to}/`);
              return (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    preload="intent"
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "pressable relative flex min-h-[56px] flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] font-semibold transition-all",
                      "active:scale-[0.96]",
                      active ? "text-primary" : "text-slate-500",
                    )}
                  >
                    <span
                      className={cn(
                        "grid h-9 w-9 place-items-center rounded-2xl transition-all",
                        active
                          ? "-translate-y-1 bg-primary/15 text-primary shadow-sm ring-1 ring-primary/20"
                          : "text-slate-500",
                      )}
                    >
                      <item.icon className={cn("h-5 w-5", active && "stroke-[2.25]")} aria-hidden />
                    </span>
                    <span className={cn("truncate px-0.5", active && "font-bold")}>{item.label}</span>
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
