import type { ReactNode } from "react";

import type { ContextQuickActionId } from "~/contextQuickActions";
import { cn } from "~/lib/utils";
import { MenuItem, MenuShortcut } from "./ui/menu";

export function ActionMenuPinControl(props: {
  checked: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <span
      aria-checked={props.checked}
      aria-label={props.label}
      className={cn(
        "inline-flex size-4 shrink-0 items-center justify-center rounded-[.25rem] border border-input bg-background text-primary-foreground shadow-xs/5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-background focus-visible:ring-ring dark:not-aria-checked:bg-input/32",
        props.checked && "border-primary bg-primary",
      )}
      role="checkbox"
      tabIndex={0}
      onClickCapture={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onKeyDown={(event) => {
        if (event.key !== " " && event.key !== "Enter") return;
        event.preventDefault();
        event.stopPropagation();
        props.onToggle();
      }}
      onPointerDownCapture={(event) => {
        event.preventDefault();
        event.stopPropagation();
        props.onToggle();
      }}
      onPointerUpCapture={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      {props.checked ? (
        <svg
          className="size-3"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="3"
          viewBox="0 0 24 24"
        >
          <path d="M5.252 12.7 10.2 18.63 18.748 5.37" />
        </svg>
      ) : null}
    </span>
  );
}

export function ContextActionMenuItem(props: {
  actionId?: ContextQuickActionId;
  checked?: boolean | undefined;
  children: ReactNode;
  disabled?: boolean;
  icon?: ReactNode;
  keepMenuOpenOnSelect?: boolean;
  shortcutLabel?: string | null;
  onCheckedChange?: ((actionId: ContextQuickActionId, checked: boolean) => void) | undefined;
  onSelect: () => void;
}) {
  const showPinControl = props.actionId !== undefined && props.onCheckedChange !== undefined;
  return (
    <MenuItem
      aria-disabled={props.disabled || undefined}
      className={cn(
        "grid grid-cols-[1rem_minmax(0,1fr)_auto] gap-2",
        props.disabled && "opacity-64",
      )}
      onClick={(event) => {
        if (props.disabled) {
          event.preventDefault();
          return;
        }
        if (props.keepMenuOpenOnSelect) {
          event.preventDefault();
          event.stopPropagation();
        }
        props.onSelect();
      }}
    >
      <span className="col-start-1 flex size-4 items-center justify-center text-muted-foreground">
        {props.icon}
      </span>
      <span className="col-start-2 min-w-0 truncate">{props.children}</span>
      <span className="col-start-3 ms-auto flex items-center gap-2">
        {props.shortcutLabel ? (
          <MenuShortcut className="ms-0">{props.shortcutLabel}</MenuShortcut>
        ) : null}
        {showPinControl ? (
          <ActionMenuPinControl
            checked={props.checked ?? false}
            label={`Show ${typeof props.children === "string" ? props.children : "action"} in quick access`}
            onToggle={() => props.onCheckedChange?.(props.actionId!, !(props.checked ?? false))}
          />
        ) : null}
      </span>
    </MenuItem>
  );
}
