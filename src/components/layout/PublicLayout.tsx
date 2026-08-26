import { Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { Watermark } from "@/components/brand/Watermark";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

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
      <Watermark opacity={0.1} size="xl" />

      <header className="d4-public-header fixed top-0 left-0 right-0 z-50 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-[1180px] items-center justify-between gap-4 px-4 sm:h-[4.5rem] sm:px-6">
          <Link to="/" aria-label="D4EXAM home" className="shrink-0">
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
                className="rounded-md px-3 py-2 text-sm font-semibold text-primary/80 transition-colors hover:text-primary"
                activeProps={{ className: "text-primary" }}
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="hidden shrink-0 items-center gap-2 lg:flex">
            <Button variant="ghost" size="sm" className="font-semibold text-primary" asChild>
              <Link to="/login">Login</Link>
            </Button>
            <Button size="sm" className="rounded-full px-5 font-semibold" asChild>
              <Link to="/school-application">Apply Now</Link>
            </Button>
          </div>

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="d4-public-menu lg:hidden" aria-label="Open menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[min(100%,20rem)] border-l border-slate-200 bg-white p-0">
              <SheetTitle className="sr-only">Menu</SheetTitle>
              <div className="flex h-14 items-center justify-between border-b border-slate-200 px-4">
                <Logo size="sm" />
                <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close menu">
                  <X className="h-5 w-5" />
                </Button>
              </div>
              <div className="flex flex-col gap-1 p-4">
                {links.map((l) => (
                  <Link
                    key={l.label}
                    to={l.to}
                    onClick={() => setOpen(false)}
                    className="rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    {l.label}
                  </Link>
                ))}
                <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
                  <Button variant="outline" className="w-full" asChild>
                    <Link to="/login" onClick={() => setOpen(false)}>Login</Link>
                  </Button>
                  <Button className="w-full" asChild>
                    <Link to="/school-application" onClick={() => setOpen(false)}>Apply Now</Link>
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>
      <div className="d4-public-header-spacer h-14 shrink-0 sm:h-[4.5rem]" aria-hidden />

      <main className="relative z-10 flex-1">{children}</main>

      <footer className="relative z-10 border-t border-slate-200 bg-slate-50/95">
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
            <Link to={i.to} className="text-sm text-slate-600 transition-colors hover:text-primary">
              {i.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
