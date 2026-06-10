import { type ProviderInteractionMode, type RuntimeMode } from "@t3tools/contracts";
import { memo, type ReactNode } from "react";
import { EllipsisIcon, ListTodoIcon } from "lucide-react";
import { INTERACTION_MODE_ORDER, interactionModeConfig } from "../../interactionModes";
import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator as MenuDivider,
  MenuTrigger,
} from "../ui/menu";
import { COMPOSER_CONTROL_ICON_TRIGGER_CLASS } from "./composerControlStyles";
import {
  SIDEBAR_LABEL_TEXT_CLASS,
  SIDEBAR_MUTED_TEXT_CLASS,
} from "../sidebar/sidebarTextStyles";

export const CompactComposerControlsMenu = memo(function CompactComposerControlsMenu(props: {
  activePlan: boolean;
  interactionMode: ProviderInteractionMode;
  planSidebarLabel: string;
  planSidebarOpen: boolean;
  runtimeMode: RuntimeMode;
  showInteractionModeToggle: boolean;
  traitsMenuContent?: ReactNode;
  onInteractionModeChange: (mode: ProviderInteractionMode) => void;
  onTogglePlanSidebar: () => void;
  onRuntimeModeChange: (mode: RuntimeMode) => void;
}) {
  return (
    <Menu>
      <MenuTrigger
        render={
          <Button
            size="sm"
            variant="ghost"
            className={COMPOSER_CONTROL_ICON_TRIGGER_CLASS}
            aria-label="More composer controls"
          />
        }
      >
        <EllipsisIcon aria-hidden="true" className="size-4" />
      </MenuTrigger>
      <MenuPopup align="start">
        {props.traitsMenuContent ? (
          <>
            {props.traitsMenuContent}
            <MenuDivider />
          </>
        ) : null}
        {props.showInteractionModeToggle ? (
          <>
            <div className={cn("px-2 py-1.5", SIDEBAR_MUTED_TEXT_CLASS, SIDEBAR_LABEL_TEXT_CLASS)}>
              Mode
            </div>
            <MenuRadioGroup
              value={props.interactionMode}
              onValueChange={(value) => {
                if (!value || value === props.interactionMode) return;
                props.onInteractionModeChange(value as ProviderInteractionMode);
              }}
            >
              {INTERACTION_MODE_ORDER.map((mode) => (
                <MenuRadioItem key={mode} value={mode}>
                  {interactionModeConfig[mode].label}
                </MenuRadioItem>
              ))}
            </MenuRadioGroup>
            <MenuDivider />
          </>
        ) : null}
        <div className={cn("px-2 py-1.5", SIDEBAR_MUTED_TEXT_CLASS, SIDEBAR_LABEL_TEXT_CLASS)}>
          Access
        </div>
        <MenuRadioGroup
          value={props.runtimeMode}
          onValueChange={(value) => {
            if (!value || value === props.runtimeMode) return;
            props.onRuntimeModeChange(value as RuntimeMode);
          }}
        >
          <MenuRadioItem value="approval-required">Supervised</MenuRadioItem>
          <MenuRadioItem value="auto-accept-edits">Auto-accept edits</MenuRadioItem>
          <MenuRadioItem value="full-access">Full access</MenuRadioItem>
        </MenuRadioGroup>
        {props.activePlan ? (
          <>
            <MenuDivider />
            <MenuItem onClick={props.onTogglePlanSidebar}>
              <ListTodoIcon className="size-4 shrink-0" />
              {props.planSidebarOpen
                ? `Hide ${props.planSidebarLabel.toLowerCase()} sidebar`
                : `Show ${props.planSidebarLabel.toLowerCase()} sidebar`}
            </MenuItem>
          </>
        ) : null}
      </MenuPopup>
    </Menu>
  );
});
