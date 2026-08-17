import { Toaster as Sonner } from "sonner";
import {
  CircleCheck,
  Info,
  TriangleAlert,
  CircleX,
  Loader2,
} from "lucide-react";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      position="top-center"
      richColors
      closeButton
      expand={false}
      gap={8}
      offset={8}
      mobileOffset={8}
      duration={3200}
      visibleToasts={2}
      // Swipe to dismiss so toasts do not block the exam
      swipeDirections={["left", "right", "top"]}
      icons={{
        success: <CircleCheck className="h-4 w-4" />,
        info: <Info className="h-4 w-4" />,
        warning: <TriangleAlert className="h-4 w-4" />,
        error: <CircleX className="h-4 w-4" />,
        loading: <Loader2 className="h-4 w-4 animate-spin" />,
      }}
      toastOptions={{
        classNames: {
          toast:
            "group toast d4-toast group-[.toaster]:border group-[.toaster]:shadow-md group-[.toaster]:rounded-xl group-[.toaster]:cursor-grab active:group-[.toaster]:cursor-grabbing group-[.toaster]:w-[min(100vw-1rem,22rem)] group-[.toaster]:max-w-[min(100vw-1rem,22rem)] group-[.toaster]:mx-auto group-[.toaster]:px-3 group-[.toaster]:py-2.5",
          title: "group-[.toast]:text-[13px] group-[.toast]:font-semibold group-[.toast]:leading-snug group-[.toast]:pr-4",
          description: "group-[.toast]:text-[11px] group-[.toast]:opacity-90 group-[.toast]:leading-snug group-[.toast]:line-clamp-3",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:rounded-lg group-[.toast]:text-xs",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground group-[.toast]:rounded-lg group-[.toast]:text-xs",
          closeButton:
            "group-[.toast]:border group-[.toast]:border-black/10 group-[.toast]:bg-white/80",
          success:
            "group-[.toaster]:!bg-emerald-50 group-[.toaster]:!text-emerald-900 group-[.toaster]:!border-emerald-200",
          error:
            "group-[.toaster]:!bg-red-50 group-[.toaster]:!text-red-900 group-[.toaster]:!border-red-200",
          warning:
            "group-[.toaster]:!bg-amber-50 group-[.toaster]:!text-amber-900 group-[.toaster]:!border-amber-200",
          info:
            "group-[.toaster]:!bg-blue-50 group-[.toaster]:!text-blue-900 group-[.toaster]:!border-blue-200",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
