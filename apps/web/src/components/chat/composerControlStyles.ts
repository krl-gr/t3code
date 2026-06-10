import {
  SIDEBAR_LABEL_TEXT_CLASS,
  SIDEBAR_MUTED_TEXT_CLASS,
} from "../sidebar/sidebarTextStyles";

export const COMPOSER_CONTROL_ROW_CLASS =
  "flex min-w-0 flex-1 items-center gap-[2px] overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

export const COMPOSER_CONTROL_SEPARATOR_CLASS =
  "h-[12px] w-px shrink-0 bg-foreground/35 dark:bg-border";

export const COMPOSER_CONTROL_ICON_TRIGGER_CLASS =
  `flex size-[32px] shrink-0 items-center justify-center rounded-[74px] border-transparent !bg-transparent p-[8px] ${SIDEBAR_MUTED_TEXT_CLASS} shadow-none transition-colors hover:!bg-transparent hover:!text-foreground dark:hover:!text-white/86 focus-visible:!ring-0 focus-visible:ring-offset-0 data-pressed:!bg-transparent data-pressed:!text-foreground dark:data-pressed:!text-white/86 aria-expanded:!bg-transparent aria-expanded:!text-foreground dark:aria-expanded:!text-white/86 before:hidden [&_svg]:mx-0`;

export const COMPOSER_CONTROL_TEXT_TRIGGER_CLASS =
  `h-[32px] min-h-0 min-w-0 shrink-0 justify-start gap-[4px] overflow-hidden rounded-[8px] border-transparent !bg-transparent px-[8px] py-[7px] text-left ${SIDEBAR_LABEL_TEXT_CLASS} ${SIDEBAR_MUTED_TEXT_CLASS} shadow-none transition-colors hover:!bg-transparent hover:!text-foreground dark:hover:!text-white/86 focus-visible:!ring-0 focus-visible:ring-offset-0 data-pressed:!bg-transparent data-pressed:!text-foreground dark:data-pressed:!text-white/86 aria-expanded:!bg-transparent aria-expanded:!text-foreground dark:aria-expanded:!text-white/86 before:hidden [&_svg]:mx-0`;
