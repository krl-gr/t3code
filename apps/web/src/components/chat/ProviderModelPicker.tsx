import {
  PROVIDER_DISPLAY_NAMES,
  type ProviderInstanceId,
  type ProviderDriverKind,
  type ResolvedKeybindingsConfig,
} from "@t3tools/contracts";
import { memo, useEffect, useMemo, useState } from "react";
import type { VariantProps } from "class-variance-authority";
import { ChevronDownIcon } from "lucide-react";
import { Button, buttonVariants } from "../ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { cn } from "~/lib/utils";
import { ModelPickerContent } from "./ModelPickerContent";
import { ProviderInstanceIcon } from "./ProviderInstanceIcon";
import { COMPOSER_CONTROL_TEXT_TRIGGER_CLASS } from "./composerControlStyles";
import {
  ModelEsque,
  getTriggerDisplayModelLabel,
  getTriggerDisplayModelName,
} from "./providerIconUtils";
import { setModelPickerOpen } from "../../modelPickerOpenState";
import type { ProviderInstanceEntry } from "../../providerInstances";
import { formatProviderDriverKindLabel } from "../../providerModels";

interface ProviderModelPickerProps {
  /**
   * The instance currently selected in the composer. Drives the trigger
   * icon, label and the default-highlighted combobox row.
   */
  activeInstanceId: ProviderInstanceId;
  model: string;
  lockedProvider: ProviderDriverKind | null;
  lockedContinuationGroupKey?: string | null;
  /** Instance entries rendered in the sidebar + used to resolve display name. */
  instanceEntries: ReadonlyArray<ProviderInstanceEntry>;
  keybindings?: ResolvedKeybindingsConfig;
  modelOptionsByInstance: ReadonlyMap<ProviderInstanceId, ReadonlyArray<ModelEsque>>;
  activeProviderIconClassName?: string;
  compact?: boolean;
  disabled?: boolean;
  terminalOpen?: boolean;
  open?: boolean;
  triggerVariant?: VariantProps<typeof buttonVariants>["variant"];
  triggerClassName?: string;
  onOpenChange?: (open: boolean) => void;
  onInstanceModelChange: (instanceId: ProviderInstanceId, model: string) => void;
}

function useProviderModelPickerController(props: ProviderModelPickerProps) {
  const [uncontrolledIsMenuOpen, setUncontrolledIsMenuOpen] = useState(false);
  const isMenuOpen = props.open ?? uncontrolledIsMenuOpen;

  // Resolve the active instance entry by exact routing key. The composer
  // resolves fallbacks before rendering this component; if the selected
  // instance disappears, do not infer a replacement from its driver kind.
  const activeEntry = useMemo(() => {
    return (
      props.instanceEntries.find((entry) => entry.instanceId === props.activeInstanceId) ?? null
    );
  }, [props.activeInstanceId, props.instanceEntries]);

  const activeInstanceId = props.activeInstanceId;
  const selectedInstanceOptions = props.modelOptionsByInstance.get(activeInstanceId) ?? [];
  // If the current slug belongs to a different instance (for example after
  // a provider switch or disable), prefer the active instance's first
  // option so the trigger icon and label stay in sync instead of showing
  // a stale foreign slug.
  const selectedModel =
    selectedInstanceOptions.find((option) => option.slug === props.model) ??
    selectedInstanceOptions[0];
  const triggerTitle = selectedModel ? getTriggerDisplayModelName(selectedModel) : props.model;
  const triggerSubtitle = selectedModel?.subProvider;
  const triggerLabel = selectedModel ? getTriggerDisplayModelLabel(selectedModel) : props.model;
  const duplicateDriverCount = props.instanceEntries.filter(
    (entry) => activeEntry !== null && entry.driverKind === activeEntry.driverKind,
  ).length;
  const showInstanceBadge = Boolean(activeEntry?.accentColor) || duplicateDriverCount > 1;

  const setIsMenuOpen = (open: boolean) => {
    props.onOpenChange?.(open);
    if (props.open === undefined) {
      setUncontrolledIsMenuOpen(open);
    }
  };

  useEffect(() => {
    setModelPickerOpen(isMenuOpen);
    return () => {
      setModelPickerOpen(false);
    };
  }, [isMenuOpen]);

  const handleInstanceModelChange = (instanceId: ProviderInstanceId, model: string) => {
    if (props.disabled) return;
    props.onInstanceModelChange(instanceId, model);
    setIsMenuOpen(false);
  };

  return {
    activeEntry,
    activeInstanceId,
    handleInstanceModelChange,
    isMenuOpen,
    setIsMenuOpen,
    showInstanceBadge,
    triggerLabel,
    triggerSubtitle,
    triggerTitle,
  };
}

function ProviderModelPickerTriggerContent({
  controller,
  props,
  showChevron,
}: {
  controller: ReturnType<typeof useProviderModelPickerController>;
  props: ProviderModelPickerProps;
  showChevron: boolean;
}) {
  const { activeEntry, showInstanceBadge, triggerLabel, triggerSubtitle, triggerTitle } =
    controller;

  return (
    <span
      className={cn(
        "flex min-w-0 w-full box-border items-center gap-2 overflow-hidden",
        props.compact ? "max-w-36 sm:pl-1" : undefined,
      )}
    >
      {activeEntry ? (
        <ProviderInstanceIcon
          driverKind={activeEntry.driverKind}
          displayName={activeEntry.displayName}
          accentColor={activeEntry.accentColor}
          showBadge={showInstanceBadge}
          className={showInstanceBadge ? "size-5" : "size-4"}
          iconClassName={cn("size-4", props.activeProviderIconClassName)}
          badgeClassName="right-[-0.125rem] bottom-[-0.125rem] h-3 min-w-3 text-[7px]"
        />
      ) : null}
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              className={cn(
                "min-w-0 flex-1 overflow-hidden",
                triggerSubtitle
                  ? "grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1"
                  : "truncate",
              )}
            />
          }
        >
          {triggerSubtitle ? (
            <>
              <span className="min-w-0 truncate">{triggerSubtitle}</span>
              <span aria-hidden="true" className="shrink-0 opacity-60">
                ·
              </span>
              <span className="min-w-0 truncate">{triggerTitle}</span>
            </>
          ) : (
            triggerTitle
          )}
        </TooltipTrigger>
        <TooltipPopup side="top">{triggerLabel}</TooltipPopup>
      </Tooltip>
      {showChevron ? (
        <ChevronDownIcon aria-hidden="true" className="size-3 shrink-0 opacity-60" />
      ) : null}
    </span>
  );
}

function normalizeTriggerPart(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function providerDriverLabel(driverKind: ProviderDriverKind): string {
  return PROVIDER_DISPLAY_NAMES[driverKind] ?? formatProviderDriverKindLabel(driverKind);
}

function maybeInstanceLabel(input: { displayName: string; driverLabel: string }): string | null {
  const displayName = input.displayName.trim();
  if (!displayName) return null;
  const normalizedDisplayName = normalizeTriggerPart(displayName);
  const normalizedDriverLabel = normalizeTriggerPart(input.driverLabel);
  if (normalizedDisplayName === normalizedDriverLabel) return null;

  if (normalizedDisplayName.startsWith(`${normalizedDriverLabel} `)) {
    const suffix = displayName.slice(input.driverLabel.length).trim();
    return suffix.length > 0 ? suffix : null;
  }

  return displayName;
}

function appendUniqueTriggerPart(parts: string[], value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return;
  const normalized = normalizeTriggerPart(trimmed);
  if (parts.some((part) => normalizeTriggerPart(part) === normalized)) return;
  parts.push(trimmed);
}

function buildComposerProviderTriggerLabel(
  controller: ReturnType<typeof useProviderModelPickerController>,
): string {
  const parts: string[] = [];
  if (controller.activeEntry) {
    const driverLabel = providerDriverLabel(controller.activeEntry.driverKind);
    appendUniqueTriggerPart(parts, driverLabel);
    appendUniqueTriggerPart(
      parts,
      maybeInstanceLabel({
        displayName: controller.activeEntry.displayName,
        driverLabel,
      }),
    );
  }

  appendUniqueTriggerPart(parts, controller.triggerSubtitle);
  appendUniqueTriggerPart(parts, controller.triggerTitle);
  return parts.length > 0 ? parts.join(" · ") : controller.triggerLabel;
}

function ComposerProviderModelPickerTriggerContent({
  controller,
}: {
  controller: ReturnType<typeof useProviderModelPickerController>;
}) {
  const triggerLabel = buildComposerProviderTriggerLabel(controller);

  return (
    <Tooltip>
      <TooltipTrigger render={<span className="block min-w-0 flex-1 truncate text-left" />}>
        {triggerLabel}
      </TooltipTrigger>
      <TooltipPopup side="top">{triggerLabel}</TooltipPopup>
    </Tooltip>
  );
}

function ProviderModelPickerPopup({
  controller,
  props,
}: {
  controller: ReturnType<typeof useProviderModelPickerController>;
  props: ProviderModelPickerProps;
}) {
  return (
    <PopoverPopup
      align="start"
      className="border-0 bg-transparent p-0 shadow-none before:hidden [--viewport-inline-padding:0] *:data-[slot=popover-viewport]:p-0"
    >
      <ModelPickerContent
        activeInstanceId={controller.activeInstanceId}
        model={props.model}
        lockedProvider={props.lockedProvider}
        lockedContinuationGroupKey={props.lockedContinuationGroupKey ?? null}
        instanceEntries={props.instanceEntries}
        {...(props.keybindings ? { keybindings: props.keybindings } : {})}
        modelOptionsByInstance={props.modelOptionsByInstance}
        terminalOpen={props.terminalOpen ?? false}
        onRequestClose={() => controller.setIsMenuOpen(false)}
        onInstanceModelChange={controller.handleInstanceModelChange}
      />
    </PopoverPopup>
  );
}

export const ProviderModelPicker = memo(function ProviderModelPicker(
  props: ProviderModelPickerProps,
) {
  const controller = useProviderModelPickerController(props);

  return (
    <Popover
      open={controller.isMenuOpen}
      onOpenChange={(open) => {
        if (props.disabled) {
          controller.setIsMenuOpen(false);
          return;
        }
        controller.setIsMenuOpen(open);
      }}
    >
      <PopoverTrigger
        render={
          <Button
            size="sm"
            variant={props.triggerVariant ?? "ghost"}
            data-chat-provider-model-picker="true"
            className={cn(
              "min-w-0 justify-start overflow-hidden whitespace-nowrap px-2 text-muted-foreground/70 hover:text-foreground/80 [&_svg]:mx-0",
              props.compact ? "max-w-42 shrink-0" : "max-w-48 shrink sm:max-w-56 sm:px-3",
              props.triggerClassName,
            )}
            disabled={props.disabled}
          />
        }
      >
        <ProviderModelPickerTriggerContent controller={controller} props={props} showChevron />
      </PopoverTrigger>
      <ProviderModelPickerPopup controller={controller} props={props} />
    </Popover>
  );
});

export const ComposerProviderModelPicker = memo(function ComposerProviderModelPicker(
  props: ProviderModelPickerProps,
) {
  const controller = useProviderModelPickerController(props);

  return (
    <Popover
      open={controller.isMenuOpen}
      onOpenChange={(open) => {
        if (props.disabled) {
          controller.setIsMenuOpen(false);
          return;
        }
        controller.setIsMenuOpen(open);
      }}
    >
      <PopoverTrigger
        render={
          <Button
            size="sm"
            variant={props.triggerVariant ?? "ghost"}
            data-chat-provider-model-picker="true"
            className={cn(
              COMPOSER_CONTROL_TEXT_TRIGGER_CLASS,
              props.compact ? "max-w-42" : "max-w-48 sm:max-w-56",
              props.triggerClassName,
            )}
            disabled={props.disabled}
          />
        }
      >
        <ComposerProviderModelPickerTriggerContent controller={controller} />
      </PopoverTrigger>
      <ProviderModelPickerPopup controller={controller} props={props} />
    </Popover>
  );
});
