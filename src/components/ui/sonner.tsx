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
      gap={10}
      offset={12}
      duration={3500}
      visibleToasts={2}
      // Mobile: swipe left or right to dismiss so toasts do not block the exam
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
            "group toast d4-toast group-[.toaster]:border group-[.toaster]:shadow-md group-[.toaster]:rounded-xl group-[.toaster]:cursor-grab active:group-[.toaster]:cursor-grabbing",
          title: "group-[.toast]:text-sm group-[.toast]:font-semibold group-[.toast]:leading-snug",
          description: "group-[.toast]:text-xs group-[.toast]:opacity-90 group-[.toast]:leading-snug",
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
