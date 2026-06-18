import {
  SIDEBAR_LABEL_TEXT_CLASS,
  SIDEBAR_MUTED_TEXT_CLASS,
} from "./sidebar/sidebarTextStyles";

export const CONTEXT_BAR_SEPARATOR_CLASS =
  "h-[12px] w-px shrink-0 bg-foreground/35 dark:bg-border";

export const CONTEXT_BAR_TEXT_TRIGGER_CLASS =
  `h-[32px] min-h-0 min-w-0 shrink-0 justify-start gap-[4px] overflow-hidden rounded-[8px] border-transparent !bg-transparent px-[8px] py-[7px] text-left ${SIDEBAR_LABEL_TEXT_CLASS} !text-sm sm:!text-sm !font-normal !leading-relaxed !tracking-normal ${SIDEBAR_MUTED_TEXT_CLASS} shadow-none transition-colors hover:!bg-transparent hover:!text-foreground dark:hover:!text-white/86 focus-visible:!ring-0 focus-visible:ring-offset-0 data-pressed:!bg-transparent data-pressed:!text-foreground dark:data-pressed:!text-white/86 aria-expanded:!bg-transparent aria-expanded:!text-foreground dark:aria-expanded:!text-white/86 before:hidden sm:h-[32px] sm:px-[8px] sm:py-[7px] [&_svg]:mx-0 [&_svg:not([class*='opacity-'])]:opacity-100`;

export const CONTEXT_BAR_ICON_TRIGGER_CLASS =
  `flex size-[32px] shrink-0 items-center justify-center rounded-[8px] border-transparent !bg-transparent p-[8px] ${SIDEBAR_MUTED_TEXT_CLASS} shadow-none transition-colors hover:!bg-transparent hover:!text-foreground dark:hover:!text-white/86 focus-visible:!ring-0 focus-visible:ring-offset-0 data-pressed:!bg-transparent data-pressed:!text-foreground dark:data-pressed:!text-white/86 aria-expanded:!bg-transparent aria-expanded:!text-foreground dark:aria-expanded:!text-white/86 before:hidden sm:size-[32px] sm:p-[8px] [&_svg]:mx-0 [&_svg:not([class*='opacity-'])]:opacity-100`;
