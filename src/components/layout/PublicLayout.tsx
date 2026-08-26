import { Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";

const links = [
  { to: "/features", label: "Features" },
  { to: "/school-application", label: "For Schools" },
  { to: "/pricing", label: "Pricing" },
  { to: "/about", label: "About Us" },
  { to: "/support", label: "Support" },
];

export function PublicLayout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative flex min-h-dvh flex-col bg-white">
      <header className="d4-public-header fixed top-0 left-0 right-0 z-50 border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 w-full max-w-[1180px] items-center justify-between gap-4 px-4 sm:h-[4.5rem] sm:px-6">
          <Link to="/" aria-label="D4EXAM home" className="shrink-0" preload={false}>
            <span className="inline-flex lg:hidden">
              <Logo size="sm" wordmark />
            </span>
            <span className="hidden lg:inline-flex">
              <Logo size="md" />
            </span>
          </Link>

          <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
            {links.map((l) => (
              <Link
                key={l.label}
                to={l.to}
                preload={false}
                className="rounded-md px-3 py-2 text-sm font-semibold text-primary/80 transition-colors hover:text-primary"
                activeProps={{ className: "text-primary" }}
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="hidden shrink-0 items-center gap-2 lg:flex">
            <Button variant="ghost" size="sm" className="font-semibold text-primary" asChild>
              <Link to="/login" preload={false}>
                Login
              </Link>
            </Button>
            <Button size="sm" className="rounded-full px-5 font-semibold" asChild>
              <Link to="/school-application" preload={false}>
                Apply Now
              </Link>
            </Button>
          </div>

          <Button
            type="button"
            variant="outline"
            size="icon"
            className="d4-public-menu lg:hidden"
            aria-label="Open menu"
            aria-expanded={open}
            onClick={() => setOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>

          {open ? (
            <div className="fixed inset-0 z-[60] lg:hidden" role="dialog" aria-modal="true">
              <button
                type="button"
                className="absolute inset-0 bg-black/40"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
              />
              <div className="absolute inset-y-0 right-0 flex w-[min(100vw-3rem,18rem)] flex-col bg-white shadow-xl">
                <div className="flex h-14 items-center justify-between border-b border-slate-200 px-4">
                  <span className="text-sm font-bold text-slate-900">Menu</span>
                  <button
                    type="button"
                    aria-label="Close menu"
                    className="grid h-9 w-9 place-items-center rounded-full hover:bg-slate-100"
                    onClick={() => setOpen(false)}
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
                  {links.map((l) => (
                    <Link
                      key={l.label}
                      to={l.to}
                      preload={false}
                      onClick={() => setOpen(false)}
                      className="rounded-lg px-3 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                    >
                      {l.label}
                    </Link>
                  ))}
                </nav>
                <div className="space-y-2 border-t border-slate-200 p-3">
                  <Button variant="outline" className="w-full font-semibold" asChild>
                    <Link to="/login" preload={false} onClick={() => setOpen(false)}>
                      Login
                    </Link>
                  </Button>
                  <Button className="w-full font-semibold" asChild>
                    <Link to="/school-application" preload={false} onClick={() => setOpen(false)}>
                      Apply Now
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </header>
      <div className="d4-public-header-spacer h-14 shrink-0 sm:h-[4.5rem]" aria-hidden />

      <main className="relative z-10 flex-1">{children}</main>

      <footer className="relative z-10 border-t border-slate-200 bg-slate-50">
        <div className="mx-auto grid w-full max-w-[1180px] gap-8 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <Logo size="md" showTagline />
            <p className="mt-4 max-w-xs text-sm text-slate-600">
              Professional examination management for schools, colleges and universities worldwide.
            </p>
          </div>
          <FooterCol
            title="Platform"
            items={[
              { to: "/features", label: "Features" },
              { to: "/pricing", label: "Pricing" },
              { to: "/school-application", label: "For Schools" },
            ]}
          />
          <FooterCol
            title="Company"
            items={[
              { to: "/about", label: "About Us" },
              { to: "/support", label: "Support" },
              { to: "/privacy", label: "Privacy Policy" },
            ]}
          />
          <FooterCol
            title="Access"
            items={[
              { to: "/login", label: "Login" },
              { to: "/forgot-password", label: "Forgot Password" },
            ]}
          />
        </div>
        <div className="border-t border-slate-200">
          <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-2 px-4 py-5 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p>© 2026 D4EXAM. All rights reserved.</p>
            <p>Smart. Secure. Seamless.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FooterCol({ title, items }: { title: string; items: { to: string; label: string }[] }) {
  return (
    <div>
      <h3 className="text-sm font-bold text-primary">{title}</h3>
      <ul className="mt-4 space-y-2.5">
        {items.map((i) => (
          <li key={i.to + i.label}>
            <Link to={i.to} preload={false} className="text-sm text-slate-600 hover:text-primary">
              {i.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
