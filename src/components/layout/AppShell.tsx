import { Link, useRouterState } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { Bell, LogOut, Menu, Search, X } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
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
                    onClick={onNavigate}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors",
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
  const { data: session } = useSessionUser();
  const unread = useCount(
    "notifications",
    session?.userId
      ? [
          { column: "recipient_user_id", value: session.userId },
          // head count cannot filter IS NULL easily via useCount eq only;
          // badge uses total for recipient; inbox page shows unread accurately
        ]
      : [],
    Boolean(session?.userId),
  );

  const notifPath = `${config.home}/notifications`;
  const showDot = (unread.data ?? 0) > 0;

  return (
    <div className="min-h-dvh bg-slate-50">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col bg-[#0b1b3a] lg:flex">
        <div className="flex h-16 items-center border-b border-white/10 px-4">
          <Link to="/" aria-label="D4EXAM home">
            <Logo size="md" />
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto hide-scrollbar">
          <NavLinks config={config} />
        </div>
        <div className="border-t border-white/10 p-3">
          <button
            type="button"
            onClick={() => void signOut()}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            Logout
          </button>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
          <div className="grid h-16 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-2">
              <Sheet open={open} onOpenChange={setOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="icon" className="lg:hidden" aria-label="Open menu">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-72 border-r-0 bg-[#0b1b3a] p-0">
                  <SheetTitle className="sr-only">{config.label} navigation</SheetTitle>
                  <div className="flex h-16 items-center justify-between border-b border-white/10 px-4">
                    <Logo size="md" />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-white hover:bg-white/10 hover:text-white"
                      onClick={() => setOpen(false)}
                      aria-label="Close menu"
                    >
                      <X className="h-5 w-5" />
                    </Button>
                  </div>
                  <div className="h-[calc(100dvh-4rem)] overflow-y-auto">
                    <NavLinks config={config} onNavigate={() => setOpen(false)} />
                  </div>
                </SheetContent>
              </Sheet>
              <span className="hidden text-sm font-semibold text-slate-500 lg:inline">
                {config.label} Portal
              </span>
              <Link to="/" className="lg:hidden" aria-label="D4EXAM home">
                <Logo size="sm" />
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
                  className="h-10 rounded-full border-slate-200 bg-slate-50 pl-9"
                />
              </div>
            </div>

            <div className="flex items-center gap-1 justify-self-end">
              <Button variant="ghost" size="icon" className="relative" aria-label="Notifications" asChild>
                <Link to={notifPath as string}>
                  <Bell className="h-5 w-5 text-slate-600" />
                  {showDot && (
                    <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary" />
                  )}
                </Link>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="flex items-center gap-2 rounded-full p-1 pr-2 transition-colors hover:bg-slate-100"
                    aria-label="Account menu"
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-blue-100 text-xs font-bold text-primary">
                      {user.avatar}
                    </span>
                    <span className="hidden text-left sm:block">
                      <span className="block text-xs font-bold leading-tight text-slate-900">{user.name}</span>
                      <span className="block max-w-[140px] truncate text-[11px] leading-tight text-slate-500">
                        {user.subtitle}
                      </span>
                    </span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="z-50 w-56 border-slate-200 bg-white">
                  <DropdownMenuLabel className="text-slate-900">{user.name}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to={`${config.home}/profile` as string}>Profile</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to={`${config.home}/settings` as string}>Settings</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to={notifPath as string}>Notifications</Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => void signOut()}>Logout</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1200px] px-4 pb-28 pt-6 sm:px-6 lg:pb-10">
          {children}
        </main>
      </div>

      {config.bottomNav && (
        <nav
          className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white lg:hidden"
          aria-label="Primary"
        >
          <ul className="grid grid-cols-4">
            {config.bottomNav.map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className="flex min-h-[56px] flex-col items-center justify-center gap-1 py-2 text-[11px] font-semibold text-slate-500 transition-colors"
                  activeProps={{ className: "text-primary" }}
                  activeOptions={{ exact: item.to === config.home }}
                >
                  <item.icon className="h-5 w-5" aria-hidden />
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}
