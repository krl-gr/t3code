import { useEffect, type ReactNode } from "react";

import { cn } from "~/lib/utils";

interface ThreadFloatingPanelShellProps {
  children: ReactNode;
  label: string;
  onClose: () => void;
  className?: string;
  panelClassName?: string;
}

export function ThreadFloatingPanelShell({
  children,
  className,
  label,
  onClose,
  panelClassName,
}: ThreadFloatingPanelShellProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [onClose]);

  return (
    <div className={cn("absolute inset-0 z-40", className)}>
      <div aria-hidden="true" className="absolute inset-0" onPointerDown={onClose} />
      <aside
        aria-label={label}
        className={cn(
          "absolute bottom-16 right-3 top-20 flex min-h-0 w-[min(440px,calc(100%-24px))] flex-col overflow-hidden rounded-xl border border-border/80 bg-background shadow-2xl",
          panelClassName,
        )}
        onPointerDown={(event) => {
          event.stopPropagation();
        }}
        role="dialog"
      >
        {children}
      </aside>
    </div>
  );
}
