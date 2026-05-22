import { EditorId, type EnvironmentId, type ResolvedKeybindingsConfig } from "@t3tools/contracts";
import { memo, useCallback, useEffect, useMemo } from "react";
import { isOpenFavoriteEditorShortcut, shortcutLabelForCommand } from "../../keybindings";
import { usePreferredEditor } from "../../editorPreferences";
import { ChevronDownIcon, FolderClosedIcon } from "lucide-react";
import { Button } from "../ui/button";
import { ContextActionMenuItem } from "../ContextActionMenuItem";
import { Group, GroupSeparator } from "../ui/group";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuShortcut,
  MenuTrigger,
} from "../ui/menu";
import { CONTEXT_BAR_TEXT_TRIGGER_CLASS } from "../BranchToolbar.styles";
import {
  CONTEXT_PREFERRED_OPEN_QUICK_ACTION_ID,
  contextOpenEditorActionId,
  type ContextQuickActionId,
} from "~/contextQuickActions";
import {
  AntigravityIcon,
  CursorIcon,
  Icon,
  KiroIcon,
  TraeIcon,
  VisualStudioCode,
  VisualStudioCodeInsiders,
  VSCodium,
  Zed,
} from "../Icons";
import {
  AquaIcon,
  CLionIcon,
  DataGripIcon,
  DataSpellIcon,
  GoLandIcon,
  IntelliJIdeaIcon,
  PhpStormIcon,
  PyCharmIcon,
  RiderIcon,
  RubyMineIcon,
  RustRoverIcon,
  WebStormIcon,
} from "../JetBrainsIcons";
import { isMacPlatform, isWindowsPlatform } from "~/lib/utils";
import { readLocalApi } from "~/localApi";

const resolveOptions = (platform: string, availableEditors: ReadonlyArray<EditorId>) => {
  const baseOptions: ReadonlyArray<{ label: string; Icon: Icon; value: EditorId }> = [
    {
      label: "Cursor",
      Icon: CursorIcon,
      value: "cursor",
    },
    {
      label: "Trae",
      Icon: TraeIcon,
      value: "trae",
    },
    {
      label: "Kiro",
      Icon: KiroIcon,
      value: "kiro",
    },
    {
      label: "VS Code",
      Icon: VisualStudioCode,
      value: "vscode",
    },
    {
      label: "VS Code Insiders",
      Icon: VisualStudioCodeInsiders,
      value: "vscode-insiders",
    },
    {
      label: "VSCodium",
      Icon: VSCodium,
      value: "vscodium",
    },
    {
      label: "Zed",
      Icon: Zed,
      value: "zed",
    },
    {
      label: "Antigravity",
      Icon: AntigravityIcon,
      value: "antigravity",
    },
    {
      label: "IntelliJ IDEA",
      Icon: IntelliJIdeaIcon,
      value: "idea",
    },
    {
      label: "Aqua",
      Icon: AquaIcon,
      value: "aqua",
    },
    {
      label: "CLion",
      Icon: CLionIcon,
      value: "clion",
    },
    {
      label: "DataGrip",
      Icon: DataGripIcon,
      value: "datagrip",
    },
    {
      label: "DataSpell",
      Icon: DataSpellIcon,
      value: "dataspell",
    },
    {
      label: "GoLand",
      Icon: GoLandIcon,
      value: "goland",
    },
    {
      label: "PhpStorm",
      Icon: PhpStormIcon,
      value: "phpstorm",
    },
    {
      label: "PyCharm",
      Icon: PyCharmIcon,
      value: "pycharm",
    },
    {
      label: "Rider",
      Icon: RiderIcon,
      value: "rider",
    },
    {
      label: "RubyMine",
      Icon: RubyMineIcon,
      value: "rubymine",
    },
    {
      label: "RustRover",
      Icon: RustRoverIcon,
      value: "rustrover",
    },
    {
      label: "WebStorm",
      Icon: WebStormIcon,
      value: "webstorm",
    },
    {
      label: isMacPlatform(platform)
        ? "Finder"
        : isWindowsPlatform(platform)
          ? "Explorer"
          : "Files",
      Icon: FolderClosedIcon,
      value: "file-manager",
    },
  ];
  return baseOptions.filter((option) => availableEditors.includes(option.value));
};

export const OpenInPicker = memo(function OpenInPicker({
  keybindings,
  availableEditors,
  openInCwd,
  presentation = "header",
  composerEditorId,
  pinnedContextActionIds,
  onContextActionPinnedChange,
}: {
  keybindings: ResolvedKeybindingsConfig;
  availableEditors: ReadonlyArray<EditorId>;
  openInCwd: string | null;
  presentation?: "header" | "composer-bar" | "composer-menu";
  composerEditorId?: EditorId | undefined;
  pinnedContextActionIds?: ReadonlySet<ContextQuickActionId>;
  onContextActionPinnedChange?: (actionId: ContextQuickActionId, pinned: boolean) => void;
}) {
  const [preferredEditor, setPreferredEditor] = usePreferredEditor(availableEditors);
  const options = useMemo(
    () => resolveOptions(navigator.platform, availableEditors),
    [availableEditors],
  );
  const primaryOption = options.find(({ value }) => value === preferredEditor) ?? null;

  const openInEditor = useCallback(
    (editorId: EditorId | null) => {
      const api = readLocalApi();
      if (!api || !openInCwd) return;
      const editor = editorId ?? preferredEditor;
      if (!editor) return;
      void api.shell.openInEditor(openInCwd, editor);
      setPreferredEditor(editor);
    },
    [preferredEditor, openInCwd, setPreferredEditor],
  );

  const openFavoriteEditorShortcutLabel = useMemo(
    () => shortcutLabelForCommand(keybindings, "editor.openFavorite"),
    [keybindings],
  );

  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      const api = readLocalApi();
      if (!isOpenFavoriteEditorShortcut(e, keybindings)) return;
      if (!api || !openInCwd) return;
      if (!preferredEditor) return;

      e.preventDefault();
      void api.shell.openInEditor(openInCwd, preferredEditor);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [preferredEditor, keybindings, openInCwd]);

  if (presentation === "composer-bar") {
    const editorId = composerEditorId ?? preferredEditor;
    const option = options.find(({ value }) => value === editorId) ?? null;
    return (
      <Button
        size="xs"
        variant="ghost"
        className={`${CONTEXT_BAR_TEXT_TRIGGER_CLASS} max-w-36 truncate`}
        disabled={!editorId || !openInCwd || !option}
        onClick={() => openInEditor(editorId)}
      >
        <span className="truncate">{option ? `Open in ${option.label}` : "Open in editor"}</span>
      </Button>
    );
  }

  if (presentation === "composer-menu") {
    const PreferredEditorIcon = primaryOption?.Icon ?? FolderClosedIcon;
    return (
      <MenuGroup>
        <MenuGroupLabel>Open project</MenuGroupLabel>
        {options.length === 0 ? (
          <MenuItem disabled>No installed editors found</MenuItem>
        ) : (
          <>
            <ContextActionMenuItem
              actionId={CONTEXT_PREFERRED_OPEN_QUICK_ACTION_ID}
              checked={pinnedContextActionIds?.has(CONTEXT_PREFERRED_OPEN_QUICK_ACTION_ID) ?? false}
              disabled={!preferredEditor || !openInCwd}
              icon={<PreferredEditorIcon aria-hidden="true" className="size-4" />}
              shortcutLabel={openFavoriteEditorShortcutLabel}
              onCheckedChange={onContextActionPinnedChange}
              onSelect={() => openInEditor(preferredEditor)}
            >
              Open in preferred editor
            </ContextActionMenuItem>
            {options.map(({ label, Icon, value }) => (
              <ContextActionMenuItem
                key={value}
                actionId={contextOpenEditorActionId(value)}
                checked={pinnedContextActionIds?.has(contextOpenEditorActionId(value)) ?? false}
                disabled={!openInCwd}
                icon={<Icon aria-hidden="true" className="size-4" />}
                shortcutLabel={value === preferredEditor ? openFavoriteEditorShortcutLabel : null}
                onCheckedChange={onContextActionPinnedChange}
                onSelect={() => openInEditor(value)}
              >
                {`Open in ${label}`}
              </ContextActionMenuItem>
            ))}
          </>
        )}
      </MenuGroup>
    );
  }

  return (
    <Group aria-label="Subscription actions">
      <Button
        size="xs"
        variant="outline"
        disabled={!preferredEditor || !openInCwd}
        onClick={() => openInEditor(preferredEditor)}
      >
        {primaryOption?.Icon && <primaryOption.Icon aria-hidden="true" className="size-3.5" />}
        <span className="sr-only @3xl/header-actions:not-sr-only @3xl/header-actions:ml-0.5">
          Open
        </span>
      </Button>
      <GroupSeparator className="hidden @3xl/header-actions:block" />
      <Menu>
        <MenuTrigger render={<Button aria-label="Copy options" size="icon-xs" variant="outline" />}>
          <ChevronDownIcon aria-hidden="true" className="size-4" />
        </MenuTrigger>
        <MenuPopup align="end">
          {options.length === 0 && <MenuItem disabled>No installed editors found</MenuItem>}
          {options.map(({ label, Icon, value }) => (
            <MenuItem key={value} onClick={() => openInEditor(value)}>
              <Icon aria-hidden="true" className="text-muted-foreground" />
              {label}
              {value === preferredEditor && openFavoriteEditorShortcutLabel && (
                <MenuShortcut>{openFavoriteEditorShortcutLabel}</MenuShortcut>
              )}
            </MenuItem>
          ))}
        </MenuPopup>
      </Menu>
    </Group>
  );
});

export function shouldShowOpenInPicker(input: {
  readonly activeProjectName: string | undefined;
  readonly activeThreadEnvironmentId: EnvironmentId;
  readonly primaryEnvironmentId: EnvironmentId | null;
}): boolean {
  return (
    Boolean(input.activeProjectName) &&
    input.primaryEnvironmentId !== null &&
    input.activeThreadEnvironmentId === input.primaryEnvironmentId
  );
}
