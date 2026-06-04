import type { ReactNode } from "react";

import type { ContextQuickActionId } from "~/contextQuickActions";
import { cn } from "~/lib/utils";
import { MenuItem, MenuShortcut } from "./ui/menu";

interface ContextActionMenuItemProps {
  actionId?: ContextQuickActionId | undefined;
  checked?: boolean | undefined;
  children: ReactNode;
  disabled?: boolean | undefined;
  icon?: ReactNode | undefined;
  keepMenuOpenOnSelect?: boolean | undefined;
  shortcutLabel?: string | null | undefined;
  onCheckedChange?: ((actionId: ContextQuickActionId, checked: boolean) => void) | undefined;
  onSelect: () => void;
}

export function ActionMenuPinControl({
  checked,
  label,
  onToggle,
}: {
  checked: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <span
      aria-checked={checked}
      aria-label={label}
      className={cn(
        "inline-flex size-4 shrink-0 items-center justify-center rounded-[.25rem] border border-input bg-background text-primary-foreground shadow-xs/5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-background focus-visible:ring-ring dark:not-aria-checked:bg-input/32",
        checked && "border-primary bg-primary",
      )}
      role="checkbox"
      tabIndex={0}
      onClickCapture={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onKeyDown={(event) => {
        if (event.key !== " " && event.key !== "Enter") {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        onToggle();
      }}
      onMouseDownCapture={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onMouseUpCapture={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onPointerDownCapture={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onToggle();
      }}
      onPointerUpCapture={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onTouchStartCapture={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      {checked ? (
        <svg
          className="size-3"
          fill="none"
          height="24"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="3"
          viewBox="0 0 24 24"
          width="24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M5.252 12.7 10.2 18.63 18.748 5.37" />
        </svg>
      ) : null}
    </span>
  );
}

export function ContextActionMenuItem({
  actionId,
  checked = false,
  children,
  disabled = false,
  icon,
  keepMenuOpenOnSelect = false,
  shortcutLabel,
  onCheckedChange,
  onSelect,
}: ContextActionMenuItemProps) {
  const showPinControl = actionId !== undefined && onCheckedChange !== undefined;
  const pinControlLabel = `Show ${
    typeof children === "string" ? children : "action"
  } in quick access`;
  const togglePinControl = () => {
    if (!showPinControl) return;
    onCheckedChange(actionId, !checked);
  };

  return (
    <MenuItem
      aria-disabled={disabled || undefined}
      className={cn("grid grid-cols-[1rem_minmax(0,1fr)_auto] gap-2", disabled && "opacity-64")}
      onClick={(event) => {
        if (disabled) {
          event.preventDefault();
          return;
        }
        if (keepMenuOpenOnSelect) {
          event.preventDefault();
          event.stopPropagation();
        }
        onSelect();
      }}
    >
      <span className="col-start-1 flex size-4 items-center justify-center text-muted-foreground">
        {icon}
      </span>
      <span className="col-start-2 min-w-0 truncate">{children}</span>
      <span className="col-start-3 ms-auto flex items-center gap-2">
        {shortcutLabel ? <MenuShortcut className="ms-0">{shortcutLabel}</MenuShortcut> : null}
        {showPinControl ? (
          <ActionMenuPinControl
            checked={checked}
            label={pinControlLabel}
            onToggle={togglePinControl}
          />
        ) : null}
      </span>
    </MenuItem>
  );
}
