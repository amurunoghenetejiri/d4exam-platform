import { Toaster as Sonner } from "sonner";
import {
  CircleCheck,
  Info,
  TriangleAlert,
  CircleX,
  Loader2,
} from "lucide-react";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/** D4EXAM branded toasts — navy/primary frame, green success, red error. */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      position="top-center"
      richColors={false}
      closeButton
      expand={false}
      gap={10}
      offset={{ top: "max(12px, env(safe-area-inset-top))", right: 16, left: 16 }}
      mobileOffset={{ top: "max(10px, env(safe-area-inset-top))", right: 14, left: 14 }}
      duration={3400}
      visibleToasts={3}
      swipeDirections={["left", "right", "top"]}
      icons={{
        success: <CircleCheck className="h-5 w-5 text-emerald-600" strokeWidth={2.5} />,
        info: <Info className="h-5 w-5 text-primary" strokeWidth={2.25} />,
        warning: <TriangleAlert className="h-5 w-5 text-amber-600" strokeWidth={2.25} />,
        error: <CircleX className="h-5 w-5 text-red-600" strokeWidth={2.5} />,
        loading: <Loader2 className="h-5 w-5 animate-spin text-primary" />,
      }}
      toastOptions={{
        classNames: {
          toast:
            "group toast d4-toast group-[.toaster]:border-2 group-[.toaster]:shadow-lg group-[.toaster]:rounded-2xl group-[.toaster]:cursor-grab active:group-[.toaster]:cursor-grabbing group-[.toaster]:w-[min(calc(100vw-2.5rem),22rem)] group-[.toaster]:max-w-[min(calc(100vw-2.5rem),22rem)] group-[.toaster]:mx-auto group-[.toaster]:box-border group-[.toaster]:px-3.5 group-[.toaster]:py-3 group-[.toaster]:bg-white group-[.toaster]:border-primary/25 group-[.toaster]:text-slate-900",
          title:
            "group-[.toast]:text-[13px] group-[.toast]:font-bold group-[.toast]:leading-snug group-[.toast]:pr-5 group-[.toast]:text-slate-900",
          description:
            "group-[.toast]:text-[11px] group-[.toast]:text-slate-600 group-[.toast]:leading-snug group-[.toast]:line-clamp-3",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:rounded-lg group-[.toast]:text-xs group-[.toast]:font-semibold",
          cancelButton:
            "group-[.toast]:bg-slate-100 group-[.toast]:text-slate-700 group-[.toast]:rounded-lg group-[.toast]:text-xs",
          closeButton:
            "group-[.toast]:border group-[.toast]:border-slate-200 group-[.toast]:bg-white group-[.toast]:text-slate-500",
          success:
            "group-[.toaster]:!border-emerald-400/70 group-[.toaster]:!bg-emerald-50/95 group-[.toaster]:!text-emerald-950",
          error:
            "group-[.toaster]:!border-red-400/70 group-[.toaster]:!bg-red-50/95 group-[.toaster]:!text-red-950",
          warning:
            "group-[.toaster]:!border-amber-400/70 group-[.toaster]:!bg-amber-50/95 group-[.toaster]:!text-amber-950",
          info:
            "group-[.toaster]:!border-primary/40 group-[.toaster]:!bg-[#0b1b3a]/5 group-[.toaster]:!text-slate-900",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
