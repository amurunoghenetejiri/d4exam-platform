import { Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

const links = [
  { to: "/features", label: "Features" },
  { to: "/about", label: "About Us" },
  { to: "/school-application", label: "For Schools" },
  { to: "/application-status", label: "Application Status" },
  { to: "/support", label: "Support" },
];

export function PublicLayout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-[1200px] items-center justify-between gap-4 px-4 sm:px-6">
          <Link to="/" aria-label="D4EXAM home" className="shrink-0">
            <Logo size="sm" />
          </Link>

          <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
            {links.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                activeProps={{ className: "text-foreground" }}
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="hidden shrink-0 items-center gap-2 lg:flex">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/login">School Login</Link>
            </Button>
            <Button size="sm" asChild>
              <Link to="/school-application">Apply Now</Link>
            </Button>
          </div>

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72 bg-surface p-0">
              <SheetTitle className="sr-only">Main navigation</SheetTitle>
              <div className="flex h-16 items-center justify-between border-b border-border px-4">
                <Logo size="sm" />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Close menu"
                  onClick={() => setOpen(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex flex-col gap-1 p-4">
                {links.map((l) => (
                  <Link
                    key={l.to}
                    to={l.to}
                    onClick={() => setOpen(false)}
                    className="rounded-lg px-3 py-3 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    {l.label}
                  </Link>
                ))}
                <div className="mt-4 flex flex-col gap-2">
                  <Button variant="outline" asChild onClick={() => setOpen(false)}>
                    <Link to="/login">School Login</Link>
                  </Button>
                  <Button asChild onClick={() => setOpen(false)}>
                    <Link to="/school-application">Apply Now</Link>
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-border bg-surface">
        <div className="mx-auto grid w-full max-w-[1200px] gap-8 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <Logo size="md" showTagline />
            <p className="mt-4 max-w-xs text-sm text-muted-foreground">
              Professional examination management for schools, colleges and universities worldwide.
            </p>
          </div>
          <FooterCol
            title="Platform"
            items={[
              { to: "/features", label: "Features" },
              { to: "/school-application", label: "For Schools" },
              { to: "/application-status", label: "Application Status" },
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
        <div className="border-t border-border">
          <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-2 px-4 py-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p>© 2026 D4EXAM. All rights reserved.</p>
            <p>Smart. Secure. Seamless.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FooterCol({
  title,
  items,
}: {
  title: string;
  items: { to: string; label: string }[];
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="mt-4 space-y-2.5">
        {items.map((i) => (
          <li key={i.to}>
            <Link
              to={i.to}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {i.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
