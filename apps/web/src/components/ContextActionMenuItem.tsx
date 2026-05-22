import type { ReactNode } from "react";

import type { ContextQuickActionId } from "~/contextQuickActions";
import { cn } from "~/lib/utils";
import { Checkbox } from "./ui/checkbox";
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
          <Checkbox
            aria-label={`Show ${typeof children === "string" ? children : "action"} in quick access`}
            checked={checked}
            className="size-4"
            onCheckedChange={(nextChecked) => {
              onCheckedChange(actionId, nextChecked === true);
            }}
            onClick={(event) => {
              event.stopPropagation();
            }}
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
          />
        ) : null}
      </span>
    </MenuItem>
  );
}
