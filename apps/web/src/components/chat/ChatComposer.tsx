import type {
  ApprovalRequestId,
  EnvironmentId,
  ModelSelection,
  ProviderApprovalDecision,
  ProviderInteractionMode,
  ResolvedKeybindingsConfig,
  RuntimeMode,
  ScopedThreadRef,
  ServerProvider,
  ThreadId,
  TurnId,
} from "@t3tools/contracts";
import {
  ProviderDriverKind,
  ProviderInstanceId,
  PROVIDER_SEND_TURN_MAX_ATTACHMENTS,
  PROVIDER_SEND_TURN_MAX_IMAGE_BYTES,
  ThreadContextBindingId,
} from "@t3tools/contracts";
import { createModelSelection, normalizeModelSlug } from "@t3tools/shared/model";
import {
  memo,
  type ComponentProps,
  type ReactNode,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useShallow } from "zustand/react/shallow";
import { selectEnvironmentState, useStore } from "~/store";
import {
  clampCollapsedComposerCursor,
  type ComposerTrigger,
  collapseExpandedComposerCursor,
  detectComposerTrigger,
  expandCollapsedComposerCursor,
  replaceTextRange,
} from "../../composer-logic";
import { formatComposerMentionToken } from "../../composer-editor-mentions";
import { deriveComposerSendState, readFileAsDataUrl } from "../ChatView.logic";
import {
  type ComposerImageAttachment,
  type DraftId,
  type PersistedComposerImageAttachment,
  useComposerDraftStore,
  useComposerThreadDraft,
  useEffectiveComposerModelState,
} from "../../composerDraftStore";
import {
  type TerminalContextDraft,
  type TerminalContextSelection,
  insertInlineTerminalContextPlaceholder,
  removeInlineTerminalContextPlaceholder,
} from "../../lib/terminalContext";
import { useComposerPathSearch } from "../../lib/composerPathSearchState";
import {
  shouldUseCompactComposerPrimaryActions,
  shouldUseCompactComposerFooter,
} from "../composerFooterLayout";
import { type ComposerPromptEditorHandle, ComposerPromptEditor } from "../ComposerPromptEditor";
import { ComposerProviderModelPicker } from "./ProviderModelPicker";
import { type ComposerCommandItem, ComposerCommandMenu } from "./ComposerCommandMenu";
import { ComposerPendingApprovalActions } from "./ComposerPendingApprovalActions";
import { CompactComposerControlsMenu } from "./CompactComposerControlsMenu";
import { ComposerPrimaryActions } from "./ComposerPrimaryActions";
import { ComposerPendingApprovalPanel } from "./ComposerPendingApprovalPanel";
import { ComposerPendingUserInputPanel } from "./ComposerPendingUserInputPanel";
import { ComposerPlanFollowUpBanner } from "./ComposerPlanFollowUpBanner";
import {
  COMPOSER_CONTROL_ICON_TRIGGER_CLASS,
  COMPOSER_CONTROL_ROW_CLASS,
  COMPOSER_CONTROL_SEPARATOR_CLASS,
  COMPOSER_CONTROL_TEXT_TRIGGER_CLASS,
} from "./composerControlStyles";
import {
  SIDEBAR_LABEL_COLOR_CLASS,
  SIDEBAR_LABEL_TEXT_CLASS,
  SIDEBAR_MUTED_TEXT_CLASS,
} from "../sidebar/sidebarTextStyles";
import { resolveComposerMenuActiveItemId } from "./composerMenuHighlight";
import { searchSlashCommandItems } from "./composerSlashCommandSearch";
import {
  getComposerProviderState,
  renderComposerProviderTraitsPicker,
  renderProviderTraitsMenuContent,
} from "./composerProviderState";
import { ContextWindowMeter } from "./ContextWindowMeter";
import { type ExpandedImagePreview } from "./ExpandedImagePreview";
import {
  AttachmentRemoveButton,
  ImageAttachmentPreviewStrip,
} from "./ImageAttachmentPreviewStrip";
import { basenameOfPath } from "../../vscode-icons";
import { cn, newCommandId, randomUUID } from "~/lib/utils";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { toastManager } from "../ui/toast";
import {
  GitBranchIcon,
  ListTodoIcon,
  type LucideIcon,
  LockIcon,
  LockOpenIcon,
  PenLineIcon,
} from "lucide-react";
import { proposedPlanTitle } from "../../proposedPlan";
import { getProviderInteractionModeToggle } from "../../providerModels";
import {
  deriveProviderInstanceEntries,
  resolveProviderDriverKindForInstanceSelection,
  sortProviderInstanceEntries,
  type ProviderInstanceEntry,
} from "../../providerInstances";
import { type AppModelOption, getAppModelOptionsForInstance } from "../../modelSelection";
import type { UnifiedSettings } from "@t3tools/contracts/settings";
import type { SessionPhase, Thread } from "../../types";
import type { PendingUserInputDraftAnswer } from "../../pendingUserInput";
import type { PendingApproval, PendingUserInput } from "../../session-logic";
import { deriveLatestContextWindowSnapshot } from "../../lib/contextWindow";
import { formatProviderSkillDisplayName } from "../../providerSkillPresentation";
import { searchProviderSkills } from "../../providerSkillSearch";
import { readLocalApi } from "../../localApi";
import { readEnvironmentApi } from "../../environmentApi";
import { usePrimaryEnvironmentId } from "../../environments/primary";
import {
  INTERACTION_MODE_ORDER,
  interactionModeConfig,
  nextProviderInteractionMode,
} from "../../interactionModes";

const IMAGE_SIZE_LIMIT_LABEL = `${Math.round(PROVIDER_SEND_TURN_MAX_IMAGE_BYTES / (1024 * 1024))}MB`;

const runtimeModeConfig: Record<
  RuntimeMode,
  { label: string; description: string; icon: LucideIcon }
> = {
  "approval-required": {
    label: "Supervised",
    description: "Ask before commands and file changes.",
    icon: LockIcon,
  },
  "auto-accept-edits": {
    label: "Auto-accept edits",
    description: "Auto-approve edits, ask before other actions.",
    icon: PenLineIcon,
  },
  "full-access": {
    label: "Full access",
    description: "Allow commands and edits without prompts.",
    icon: LockOpenIcon,
  },
};

const runtimeModeOptions = Object.keys(runtimeModeConfig) as RuntimeMode[];
const BROWSER_USE_PROVIDER_DRIVERS = new Set<ProviderDriverKind>([ProviderDriverKind.make("pi")]);

function supportsComposerBrowserUse(provider: ProviderDriverKind): boolean {
  return BROWSER_USE_PROVIDER_DRIVERS.has(provider);
}

function normalizeContextPickerPath(path: string): string {
  return path.trim().replace(/\\/g, "/").replace(/\/+$/g, "");
}

function workspaceRelativeContextPath(workspaceRoot: string, selectedPath: string): string | null {
  const normalizedRoot = normalizeContextPickerPath(workspaceRoot);
  const normalizedSelected = normalizeContextPickerPath(selectedPath);
  if (!normalizedRoot || !normalizedSelected) return null;

  const caseInsensitive = /^[a-z]:\//i.test(normalizedRoot);
  const rootForCompare = caseInsensitive ? normalizedRoot.toLowerCase() : normalizedRoot;
  const selectedForCompare = caseInsensitive
    ? normalizedSelected.toLowerCase()
    : normalizedSelected;

  if (selectedForCompare === rootForCompare) {
    return ".";
  }
  const rootPrefix = `${rootForCompare}/`;
  if (!selectedForCompare.startsWith(rootPrefix)) {
    return null;
  }
  return normalizedSelected.slice(normalizedRoot.length + 1);
}

function buildContextMentionInsertion(
  paths: ReadonlyArray<string>,
  cursor: number,
  prompt: string,
) {
  const mentions = paths.map(formatComposerMentionToken).join(" ");
  if (!mentions) return "";
  const needsLeadingSpace = cursor > 0 && !/\s/.test(prompt[cursor - 1] ?? "");
  const needsTrailingSpace = cursor >= prompt.length || !/\s/.test(prompt[cursor] ?? "");
  return `${needsLeadingSpace ? " " : ""}${mentions}${needsTrailingSpace ? " " : ""}`;
}

const extendReplacementRangeForTrailingSpace = (
  text: string,
  rangeEnd: number,
  replacement: string,
): number => {
  if (!replacement.endsWith(" ")) {
    return rangeEnd;
  }
  return text[rangeEnd] === " " ? rangeEnd + 1 : rangeEnd;
};

const syncTerminalContextsByIds = (
  contexts: ReadonlyArray<TerminalContextDraft>,
  ids: ReadonlyArray<string>,
): TerminalContextDraft[] => {
  const contextsById = new Map(contexts.map((context) => [context.id, context]));
  return ids.flatMap((id) => {
    const context = contextsById.get(id);
    return context ? [context] : [];
  });
};

const terminalContextIdListsEqual = (
  contexts: ReadonlyArray<TerminalContextDraft>,
  ids: ReadonlyArray<string>,
): boolean =>
  contexts.length === ids.length && contexts.every((context, index) => context.id === ids[index]);

function handleComposerDragOver(event: React.DragEvent<HTMLDivElement>) {
  if (!event.dataTransfer.types.includes("Files")) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "copy";
}

function ComposerToolbarSeparator() {
  return <div aria-hidden="true" className={COMPOSER_CONTROL_SEPARATOR_CLASS} />;
}

function ComposerPlusIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
      <rect x="3" y="7.3" width="10" height="1.4" fill="currentColor" />
      <rect x="7.3" y="3" width="1.4" height="10" fill="currentColor" />
    </svg>
  );
}

function ComposerGlobeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.3" />
      <path d="M2.25 8H13.75" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M8 1.75C9.8 3.45 10.75 5.55 10.75 8C10.75 10.45 9.8 12.55 8 14.25C6.2 12.55 5.25 10.45 5.25 8C5.25 5.55 6.2 3.45 8 1.75Z"
        stroke="currentColor"
        strokeWidth="1.3"
      />
    </svg>
  );
}

function ComposerPlaceholderAction({
  label,
  icon: Icon,
}: {
  label: string;
  icon: (props: { className?: string }) => ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-disabled="true"
            aria-label={label}
            className={cn(COMPOSER_CONTROL_ICON_TRIGGER_CLASS, "cursor-default")}
            onClick={(event) => {
              event.preventDefault();
            }}
          />
        }
      >
        <Icon className="size-4" />
      </TooltipTrigger>
      <TooltipPopup side="top">{label}</TooltipPopup>
    </Tooltip>
  );
}

function ComposerToolbarIconAction({
  label,
  icon: Icon,
  onClick,
}: {
  label: string;
  icon: (props: { className?: string }) => ReactNode;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={label}
            className={COMPOSER_CONTROL_ICON_TRIGGER_CLASS}
            onClick={(event) => {
              event.preventDefault();
              onClick();
            }}
          />
        }
      >
        <Icon className="size-4" />
      </TooltipTrigger>
      <TooltipPopup side="top">{label}</TooltipPopup>
    </Tooltip>
  );
}

function ComposerSelectTrigger({ className, ...props }: ComponentProps<typeof SelectTrigger>) {
  return (
    <SelectTrigger
      className={cn(
        COMPOSER_CONTROL_TEXT_TRIGGER_CLASS,
        "[&_[data-slot=select-icon]]:hidden",
        className,
      )}
      {...props}
    />
  );
}

const ComposerFooterModeControls = memo(function ComposerFooterModeControls(props: {
  showInteractionModeToggle: boolean;
  interactionMode: ProviderInteractionMode;
  runtimeMode: RuntimeMode;
  showPlanToggle: boolean;
  planSidebarLabel: string;
  planSidebarOpen: boolean;
  onInteractionModeChange: (mode: ProviderInteractionMode) => void;
  onRuntimeModeChange: (mode: RuntimeMode) => void;
  onTogglePlanSidebar: () => void;
}) {
  const runtimeModeOption = runtimeModeConfig[props.runtimeMode];
  const interactionModeOption = interactionModeConfig[props.interactionMode];

  return (
    <>
      {props.showInteractionModeToggle ? (
        <>
          <Select
            value={props.interactionMode}
            onValueChange={(value) => {
              if (!value) return;
              props.onInteractionModeChange(value as ProviderInteractionMode);
            }}
          >
            <ComposerSelectTrigger
              variant="ghost"
              size="sm"
              className="max-w-28"
              aria-label="Interaction mode"
              title={interactionModeOption.description}
            >
              <SelectValue>{interactionModeOption.label}</SelectValue>
            </ComposerSelectTrigger>
            <SelectPopup alignItemWithTrigger={false}>
              {INTERACTION_MODE_ORDER.map((mode) => {
                const option = interactionModeConfig[mode];
                return (
                  <SelectItem key={mode} value={mode} className="min-w-56 py-2">
                    <div className="grid min-w-0 gap-0.5">
                      <span className={cn(SIDEBAR_LABEL_COLOR_CLASS, SIDEBAR_LABEL_TEXT_CLASS)}>
                        {option.label}
                      </span>
                      <span className={cn(SIDEBAR_MUTED_TEXT_CLASS, SIDEBAR_LABEL_TEXT_CLASS)}>
                        {option.description}
                      </span>
                    </div>
                  </SelectItem>
                );
              })}
            </SelectPopup>
          </Select>

          <ComposerToolbarSeparator />
        </>
      ) : null}

      <Select
        value={props.runtimeMode}
        onValueChange={(value) => props.onRuntimeModeChange(value!)}
      >
        <ComposerSelectTrigger
          variant="ghost"
          size="sm"
          className="max-w-36"
          aria-label="Runtime mode"
          title={runtimeModeOption.description}
        >
          <SelectValue>{runtimeModeOption.label}</SelectValue>
        </ComposerSelectTrigger>
        <SelectPopup alignItemWithTrigger={false}>
          {runtimeModeOptions.map((mode) => {
            const option = runtimeModeConfig[mode];
            const OptionIcon = option.icon;
            return (
              <SelectItem key={mode} value={mode} className="min-w-64 py-2">
                <div className="grid min-w-0 gap-0.5">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5",
                      SIDEBAR_LABEL_COLOR_CLASS,
                      SIDEBAR_LABEL_TEXT_CLASS,
                    )}
                  >
                    <OptionIcon className="size-3.5 shrink-0 text-muted-foreground" />
                    {option.label}
                  </span>
                  <span className={cn(SIDEBAR_MUTED_TEXT_CLASS, SIDEBAR_LABEL_TEXT_CLASS)}>
                    {option.description}
                  </span>
                </div>
              </SelectItem>
            );
          })}
        </SelectPopup>
      </Select>

      {props.showPlanToggle ? (
        <>
          <ComposerToolbarSeparator />
          <Button
            variant="ghost"
            className={cn(
              COMPOSER_CONTROL_TEXT_TRIGGER_CLASS,
              "whitespace-nowrap",
              props.planSidebarOpen && "text-white",
            )}
            size="sm"
            type="button"
            onClick={props.onTogglePlanSidebar}
            title={
              props.planSidebarOpen
                ? `Hide ${props.planSidebarLabel.toLowerCase()} sidebar`
                : `Show ${props.planSidebarLabel.toLowerCase()} sidebar`
            }
          >
            <ListTodoIcon />
            <span className="sr-only sm:not-sr-only">{props.planSidebarLabel}</span>
          </Button>
        </>
      ) : null}
    </>
  );
});

const ComposerFooterPrimaryActions = memo(function ComposerFooterPrimaryActions(props: {
  compact: boolean;
  activeContextWindow: ReturnType<typeof deriveLatestContextWindowSnapshot>;
  isPreparingWorktree: boolean;
  pendingAction: {
    questionIndex: number;
    isLastQuestion: boolean;
    canAdvance: boolean;
    isResponding: boolean;
    isComplete: boolean;
  } | null;
  isRunning: boolean;
  showPlanFollowUpPrompt: boolean;
  promptHasText: boolean;
  isSendBusy: boolean;
  isConnecting: boolean;
  isEnvironmentUnavailable: boolean;
  hasSendableContent: boolean;
  preserveComposerFocusOnPointerDown?: boolean;
  onPreviousPendingQuestion: () => void;
  onInterrupt: () => void;
  onImplementPlanInNewThread: () => void;
}) {
  return (
    <>
      {props.activeContextWindow ? <ContextWindowMeter usage={props.activeContextWindow} /> : null}
      {props.isPreparingWorktree ? (
        <span className={cn(SIDEBAR_MUTED_TEXT_CLASS, SIDEBAR_LABEL_TEXT_CLASS)}>
          Preparing worktree...
        </span>
      ) : null}
      <ComposerPrimaryActions
        compact={props.compact}
        pendingAction={props.pendingAction}
        isRunning={props.isRunning}
        showPlanFollowUpPrompt={props.showPlanFollowUpPrompt}
        promptHasText={props.promptHasText}
        isSendBusy={props.isSendBusy}
        isConnecting={props.isConnecting}
        isEnvironmentUnavailable={props.isEnvironmentUnavailable}
        isPreparingWorktree={props.isPreparingWorktree}
        hasSendableContent={props.hasSendableContent}
        preserveComposerFocusOnPointerDown={props.preserveComposerFocusOnPointerDown ?? false}
        onPreviousPendingQuestion={props.onPreviousPendingQuestion}
        onInterrupt={props.onInterrupt}
        onImplementPlanInNewThread={props.onImplementPlanInNewThread}
      />
    </>
  );
});

// --------------------------------------------------------------------------
// Handle exposed to ChatView
// --------------------------------------------------------------------------

export interface ChatComposerHandle {
  focusAtEnd: () => void;
  focusAt: (cursor: number) => void;
  openModelPicker: () => void;
  toggleModelPicker: () => void;
  isModelPickerOpen: () => boolean;
  readSnapshot: () => {
    value: string;
    cursor: number;
    expandedCursor: number;
    terminalContextIds: string[];
  };
  /** Reset composer cursor/trigger/highlight after external prompt mutations (e.g. onSend). */
  resetCursorState: (options?: {
    cursor?: number;
    prompt?: string;
    detectTrigger?: boolean;
  }) => void;
  /** Insert a terminal context from the terminal drawer. */
  addTerminalContext: (selection: TerminalContextSelection) => void;
  /** Get the current prompt/effort/model state for use in send. */
  getSendContext: () => {
    prompt: string;
    images: ComposerImageAttachment[];
    terminalContexts: TerminalContextDraft[];
    selectedPromptEffort: string | null;
    selectedModelOptionsForDispatch: unknown;
    selectedModelSelection: ModelSelection;
    selectedProvider: ProviderDriverKind;
    selectedModel: string;
    selectedProviderModels: ReadonlyArray<ServerProvider["models"][number]>;
  };
}

// --------------------------------------------------------------------------
// Props
// --------------------------------------------------------------------------

export interface ChatComposerProps {
  composerDraftTarget: ScopedThreadRef | DraftId;
  environmentId: EnvironmentId;
  routeKind: "server" | "draft";
  routeThreadRef: ScopedThreadRef;
  draftId: DraftId | null;

  // Thread context
  activeThreadId: ThreadId | null;
  activeThreadEnvironmentId: EnvironmentId | undefined;
  activeThread: Thread | undefined;
  isServerThread: boolean;
  isLocalDraftThread: boolean;

  // Session phase
  phase: SessionPhase;
  isConnecting: boolean;
  isSendBusy: boolean;
  isPreparingWorktree: boolean;
  environmentUnavailable: {
    readonly label: string;
    readonly connectionState: "connecting" | "disconnected" | "error";
  } | null;

  // Pending approvals / inputs
  activePendingApproval: PendingApproval | null;
  pendingApprovals: PendingApproval[];
  pendingUserInputs: PendingUserInput[];
  activePendingProgress: {
    questionIndex: number;
    isLastQuestion: boolean;
    canAdvance: boolean;
    customAnswer: string;
    activeQuestion: { id: string; multiSelect?: boolean | undefined } | null;
  } | null;
  activePendingResolvedAnswers: Record<string, unknown> | null;
  activePendingIsResponding: boolean;
  activePendingDraftAnswers: Record<string, PendingUserInputDraftAnswer>;
  activePendingQuestionIndex: number;
  respondingRequestIds: ApprovalRequestId[];

  // Plan
  showPlanFollowUpPrompt: boolean;
  activeProposedPlan: Thread["proposedPlans"][number] | null;
  activePlan: { turnId?: TurnId } | null;
  sidebarProposedPlan: { turnId?: TurnId } | null;
  planSidebarLabel: string;
  planSidebarOpen: boolean;

  // Mode
  runtimeMode: RuntimeMode;
  interactionMode: ProviderInteractionMode;

  // Provider / model
  lockedProvider: ProviderDriverKind | null;
  providerStatuses: ServerProvider[];
  activeProjectDefaultModelSelection: ModelSelection | null | undefined;
  activeThreadModelSelection: ModelSelection | null | undefined;

  // Context window
  activeThreadActivities: Thread["activities"] | undefined;

  // Misc
  resolvedTheme: "light" | "dark";
  settings: UnifiedSettings;
  keybindings: ResolvedKeybindingsConfig;
  terminalOpen: boolean;
  gitCwd: string | null;

  // Refs the parent needs kept in sync
  promptRef: React.RefObject<string>;
  composerImagesRef: React.RefObject<ComposerImageAttachment[]>;
  composerTerminalContextsRef: React.RefObject<TerminalContextDraft[]>;
  composerRef: React.RefObject<ChatComposerHandle | null>;

  // Scroll
  shouldAutoScrollRef: React.RefObject<boolean>;
  scheduleStickToBottom: () => void;

  // Callbacks
  onSend: (e?: { preventDefault: () => void }) => void;
  onInterrupt: () => void;
  onImplementPlanInNewThread: () => void;
  onRespondToApproval: (
    requestId: ApprovalRequestId,
    decision: ProviderApprovalDecision,
  ) => Promise<void>;
  onSelectActivePendingUserInputOption: (questionId: string, optionLabel: string) => void;
  onAdvanceActivePendingUserInput: () => void;
  onPreviousActivePendingUserInputQuestion: () => void;
  onChangeActivePendingUserInputCustomAnswer: (
    questionId: string,
    value: string,
    nextCursor: number,
    expandedCursor: number,
    cursorAdjacentToMention: boolean,
  ) => void;

  onProviderModelSelect: (instanceId: ProviderInstanceId, model: string) => void;
  handleRuntimeModeChange: (mode: RuntimeMode) => void;
  handleInteractionModeChange: (mode: ProviderInteractionMode) => void;
  togglePlanSidebar: () => void;

  focusComposer: () => void;
  scheduleComposerFocus: () => void;
  setThreadError: (threadId: ThreadId | null, error: string | null) => void;
  onExpandImage: (preview: ExpandedImagePreview) => void;
}

// --------------------------------------------------------------------------
// Component
// --------------------------------------------------------------------------

export const ChatComposer = memo(function ChatComposer(props: ChatComposerProps) {
  const {
    composerDraftTarget,
    environmentId,
    routeKind,
    routeThreadRef,
    draftId,
    activeThreadId,
    activeThreadEnvironmentId,
    activeThread,
    isServerThread,
    isLocalDraftThread: _isLocalDraftThread,
    phase,
    isConnecting,
    isSendBusy,
    isPreparingWorktree,
    environmentUnavailable,
    activePendingApproval,
    pendingApprovals,
    pendingUserInputs,
    activePendingProgress,
    activePendingResolvedAnswers,
    activePendingIsResponding,
    activePendingDraftAnswers,
    activePendingQuestionIndex,
    respondingRequestIds,
    showPlanFollowUpPrompt,
    activeProposedPlan,
    activePlan,
    sidebarProposedPlan,
    planSidebarLabel,
    planSidebarOpen,
    runtimeMode,
    interactionMode,
    lockedProvider,
    providerStatuses,
    activeProjectDefaultModelSelection,
    activeThreadModelSelection,
    activeThreadActivities,
    resolvedTheme,
    settings,
    keybindings,
    terminalOpen,
    gitCwd,
    promptRef,
    composerRef,
    composerImagesRef,
    composerTerminalContextsRef,
    shouldAutoScrollRef,
    scheduleStickToBottom,
    onSend,
    onInterrupt,
    onImplementPlanInNewThread,
    onRespondToApproval,
    onSelectActivePendingUserInputOption,
    onAdvanceActivePendingUserInput,
    onPreviousActivePendingUserInputQuestion,
    onChangeActivePendingUserInputCustomAnswer,
    onProviderModelSelect,
    handleRuntimeModeChange,
    handleInteractionModeChange,
    togglePlanSidebar,
    focusComposer,
    scheduleComposerFocus,
    setThreadError,
    onExpandImage,
  } = props;

  // ------------------------------------------------------------------
  // Store subscriptions (prompt / images / terminal contexts)
  // ------------------------------------------------------------------
  const composerDraft = useComposerThreadDraft(composerDraftTarget);
  const prompt = composerDraft.prompt;
  const composerImages = composerDraft.images;
  const composerTerminalContexts = composerDraft.terminalContexts;
  const nonPersistedComposerImageIds = composerDraft.nonPersistedImageIds;

  const setComposerDraftPrompt = useComposerDraftStore((store) => store.setPrompt);
  const addComposerDraftImage = useComposerDraftStore((store) => store.addImage);
  const addComposerDraftImages = useComposerDraftStore((store) => store.addImages);
  const removeComposerDraftImage = useComposerDraftStore((store) => store.removeImage);
  const insertComposerDraftTerminalContext = useComposerDraftStore(
    (store) => store.insertTerminalContext,
  );
  const removeComposerDraftTerminalContext = useComposerDraftStore(
    (store) => store.removeTerminalContext,
  );
  const setComposerDraftTerminalContexts = useComposerDraftStore(
    (store) => store.setTerminalContexts,
  );
  const clearComposerDraftPersistedAttachments = useComposerDraftStore(
    (store) => store.clearPersistedAttachments,
  );
  const syncComposerDraftPersistedAttachments = useComposerDraftStore(
    (store) => store.syncPersistedAttachments,
  );
  const getComposerDraft = useComposerDraftStore((store) => store.getComposerDraft);

  // ------------------------------------------------------------------
  // Model state
  // ------------------------------------------------------------------
  // Instance-aware projection of the wire provider list. One entry per
  // configured instance (default built-in + any custom `providerInstances.*`),
  // sorted default-first per driver kind for a stable picker order.
  const providerInstanceEntries = useMemo<ReadonlyArray<ProviderInstanceEntry>>(
    () => sortProviderInstanceEntries(deriveProviderInstanceEntries(providerStatuses)),
    [providerStatuses],
  );
  const selectedProviderByThreadId = composerDraft.activeProvider ?? null;
  const threadProvider =
    activeThread?.session?.providerInstanceId ??
    activeThreadModelSelection?.instanceId ??
    activeProjectDefaultModelSelection?.instanceId ??
    null;
  const explicitSelectedInstanceId = selectedProviderByThreadId ?? threadProvider;

  const unlockedSelectedProvider =
    resolveProviderDriverKindForInstanceSelection(
      providerInstanceEntries,
      providerStatuses,
      explicitSelectedInstanceId,
    ) ?? ProviderDriverKind.make("codex");
  const selectedProvider: ProviderDriverKind = lockedProvider ?? unlockedSelectedProvider;
  const showComposerBrowserUseControl = supportsComposerBrowserUse(selectedProvider);
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const composerEnvironmentId = activeThreadEnvironmentId ?? environmentId;
  const showComposerWorkspaceContextControl =
    primaryEnvironmentId !== null && composerEnvironmentId === primaryEnvironmentId;
  const [chatContextDialogOpen, setChatContextDialogOpen] = useState(false);
  const [chatContextSearch, setChatContextSearch] = useState("");
  const [selectedChatContextSourceId, setSelectedChatContextSourceId] = useState<ThreadId | null>(
    null,
  );
  const chatContextThreads = useStore(
    useShallow(
      useCallback(
        (state) => {
          const environmentState = selectEnvironmentState(state, composerEnvironmentId);
          return environmentState.threadIds.flatMap((threadId) => {
            const shell = environmentState.threadShellById[threadId];
            return shell && shell.id !== activeThreadId ? [shell] : [];
          });
        },
        [activeThreadId, composerEnvironmentId],
      ),
    ),
  );
  const chatContextProjectById = useStore(
    useCallback(
      (state) => selectEnvironmentState(state, composerEnvironmentId).projectById,
      [composerEnvironmentId],
    ),
  );
  const chatContextPickerState = useMemo(
    () => ({
      threads: chatContextThreads,
      projectById: chatContextProjectById,
    }),
    [chatContextProjectById, chatContextThreads],
  );
  const chatContextBindings = activeThread?.contextBindings ?? [];
  const chatContextCandidates = useMemo(() => {
    const query = chatContextSearch.trim().toLowerCase();
    return chatContextPickerState.threads
      .filter((thread) => {
        const project = chatContextPickerState.projectById[thread.projectId];
        if (!query) return true;
        return (
          thread.title.toLowerCase().includes(query) ||
          project?.name.toLowerCase().includes(query) ||
          project?.cwd.toLowerCase().includes(query)
        );
      })
      .toSorted((left, right) => {
        const leftUpdated = left.updatedAt ?? left.createdAt;
        const rightUpdated = right.updatedAt ?? right.createdAt;
        return rightUpdated.localeCompare(leftUpdated) || left.title.localeCompare(right.title);
      });
  }, [chatContextPickerState, chatContextSearch]);
  useEffect(() => {
    if (!chatContextDialogOpen) {
      return;
    }
    if (
      selectedChatContextSourceId &&
      chatContextCandidates.some((thread) => thread.id === selectedChatContextSourceId)
    ) {
      return;
    }
    setSelectedChatContextSourceId(chatContextCandidates[0]?.id ?? null);
  }, [chatContextCandidates, chatContextDialogOpen, selectedChatContextSourceId]);

  const openChatContextDialog = useCallback(() => {
    if (!activeThread || !isServerThread) {
      toastManager.add({
        type: "warning",
        title: "Create the chat first",
        description: "Chat context can be attached after the thread exists.",
      });
      return;
    }
    setChatContextSearch("");
    setSelectedChatContextSourceId(chatContextCandidates[0]?.id ?? null);
    setChatContextDialogOpen(true);
  }, [activeThread, chatContextCandidates, isServerThread]);

  const confirmAttachChatContext = useCallback(async () => {
    if (!activeThread || !selectedChatContextSourceId) {
      return;
    }
    const api = readEnvironmentApi(activeThread.environmentId);
    if (!api) {
      toastManager.add({
        type: "error",
        title: "Environment unavailable",
        description: "Reconnect before attaching chat context.",
      });
      return;
    }
    try {
      await api.orchestration.dispatchCommand({
        type: "thread.context-binding.add",
        commandId: newCommandId(),
        threadId: activeThread.id,
        bindingId: ThreadContextBindingId.make(`ctx-${randomUUID()}`),
        sourceThreadId: selectedChatContextSourceId,
        mode: "snapshot",
        createdAt: new Date().toISOString(),
      });
      setChatContextDialogOpen(false);
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Failed to attach chat context",
        description: error instanceof Error ? error.message : "An error occurred.",
      });
    }
  }, [activeThread, selectedChatContextSourceId]);

  const removeChatContextBinding = useCallback(
    async (bindingId: ThreadContextBindingId) => {
      if (!activeThread) {
        return;
      }
      const api = readEnvironmentApi(activeThread.environmentId);
      if (!api) {
        toastManager.add({
          type: "error",
          title: "Environment unavailable",
          description: "Reconnect before removing chat context.",
        });
        return;
      }
      try {
        await api.orchestration.dispatchCommand({
          type: "thread.context-binding.remove",
          commandId: newCommandId(),
          threadId: activeThread.id,
          bindingId,
          createdAt: new Date().toISOString(),
        });
      } catch (error) {
        toastManager.add({
          type: "error",
          title: "Failed to remove chat context",
          description: error instanceof Error ? error.message : "An error occurred.",
        });
      }
    },
    [activeThread],
  );
  const lockedContinuationGroupKey = useMemo((): string | null => {
    if (!lockedProvider || !activeThread) return null;
    const lockedInstanceId =
      activeThread.session?.providerInstanceId ?? activeThreadModelSelection?.instanceId;
    if (!lockedInstanceId) return null;
    return (
      providerInstanceEntries.find((entry) => entry.instanceId === lockedInstanceId)
        ?.continuationGroupKey ?? null
    );
  }, [
    activeThread,
    activeThreadModelSelection?.instanceId,
    lockedProvider,
    providerInstanceEntries,
  ]);

  // Resolve which configured instance the composer is currently targeting.
  // Priority:
  //   1. The composer draft's `activeProvider` — the user's unsaved pick
  //      from the model picker (must win, otherwise the UI appears to
  //      ignore picker selections).
  //   2. Thread's persisted instance id (server-side saved selection).
  //   3. Project default's instance id.
  //   4. First enabled entry matching the current driver kind.
  //   5. First enabled entry overall / default instance for the kind.
  //
  const selectedInstanceId = useMemo<ProviderInstanceId>(() => {
    const candidates: Array<string | null | undefined> = [
      composerDraft.activeProvider,
      activeThread?.session?.providerInstanceId,
      activeThreadModelSelection?.instanceId,
      activeProjectDefaultModelSelection?.instanceId,
    ];
    for (const candidate of candidates) {
      if (!candidate) continue;
      const match = providerInstanceEntries.find(
        (entry) => entry.instanceId === candidate && entry.enabled,
      );
      if (match) {
        // When locked to a specific driver kind, ignore persisted instance
        // ids from a different kind or continuation group.
        if (lockedProvider && match.driverKind !== lockedProvider) continue;
        if (
          lockedContinuationGroupKey &&
          match.continuationGroupKey !== lockedContinuationGroupKey
        ) {
          continue;
        }
        return match.instanceId;
      }
    }
    if (explicitSelectedInstanceId) {
      return ProviderInstanceId.make(explicitSelectedInstanceId);
    }
    const byKind = providerInstanceEntries.find(
      (entry) =>
        entry.enabled &&
        entry.driverKind === selectedProvider &&
        (!lockedContinuationGroupKey || entry.continuationGroupKey === lockedContinuationGroupKey),
    );
    if (byKind) return byKind.instanceId;
    const anyEnabled = providerInstanceEntries.find((entry) => entry.enabled);
    return (
      anyEnabled?.instanceId ??
      providerInstanceEntries[0]?.instanceId ??
      activeThreadModelSelection?.instanceId ??
      activeProjectDefaultModelSelection?.instanceId ??
      ProviderInstanceId.make("codex")
    );
  }, [
    activeProjectDefaultModelSelection?.instanceId,
    activeThread?.session?.providerInstanceId,
    activeThreadModelSelection?.instanceId,
    composerDraft.activeProvider,
    explicitSelectedInstanceId,
    lockedContinuationGroupKey,
    lockedProvider,
    providerInstanceEntries,
    selectedProvider,
  ]);

  const { modelOptions: composerModelOptions, selectedModel } = useEffectiveComposerModelState({
    threadRef: composerDraftTarget,
    providers: providerStatuses,
    selectedProvider,
    selectedInstanceId,
    threadModelSelection: activeThreadModelSelection,
    projectModelSelection: activeProjectDefaultModelSelection,
    settings,
  });

  // Resolve the active instance's snapshot by `instanceId` so a custom
  // instance gets its own slash commands, skills, and model list — not
  // the first snapshot for the same driver kind.
  const selectedProviderEntry = useMemo(
    () => providerInstanceEntries.find((entry) => entry.instanceId === selectedInstanceId),
    [providerInstanceEntries, selectedInstanceId],
  );
  const selectedProviderStatus = useMemo(
    () => selectedProviderEntry?.snapshot ?? null,
    [selectedProviderEntry],
  );
  const selectedProviderModels = useMemo<ReadonlyArray<ServerProvider["models"][number]>>(
    () => selectedProviderEntry?.models ?? [],
    [selectedProviderEntry],
  );

  const composerProviderState = useMemo(
    () =>
      getComposerProviderState({
        provider: selectedProvider,
        model: selectedModel,
        models: selectedProviderModels,
        prompt,
        modelOptions: composerModelOptions?.[selectedInstanceId],
      }),
    [
      composerModelOptions,
      prompt,
      selectedInstanceId,
      selectedModel,
      selectedProvider,
      selectedProviderModels,
    ],
  );

  const selectedPromptEffort = composerProviderState.promptEffort;
  const selectedModelOptionsForDispatch = composerProviderState.modelOptionsForDispatch;
  const composerProviderControls = useMemo(
    () => ({
      showInteractionModeToggle: getProviderInteractionModeToggle(
        providerStatuses,
        selectedProvider,
      ),
    }),
    [providerStatuses, selectedProvider],
  );
  const selectedModelSelection = useMemo<ModelSelection>(
    () => createModelSelection(selectedInstanceId, selectedModel, selectedModelOptionsForDispatch),
    [selectedInstanceId, selectedModel, selectedModelOptionsForDispatch],
  );
  const selectedModelForPicker = selectedModel;
  // Instance-keyed option list so the picker can show each configured
  // instance (built-in + custom) as a first-class sidebar entry. The
  // options are server-reported models plus that exact instance's
  // configured custom models; selected slugs are not injected into lists.
  const modelOptionsByInstance = useMemo<
    ReadonlyMap<ProviderInstanceId, ReadonlyArray<AppModelOption>>
  >(() => {
    const out = new Map<ProviderInstanceId, ReadonlyArray<AppModelOption>>();
    for (const entry of providerInstanceEntries) {
      out.set(entry.instanceId, getAppModelOptionsForInstance(settings, entry));
    }
    return out;
  }, [providerInstanceEntries, settings]);
  const selectedModelForPickerWithCustomFallback = useMemo(() => {
    const currentOptions = modelOptionsByInstance.get(selectedInstanceId) ?? [];
    return currentOptions.some((option) => option.slug === selectedModelForPicker)
      ? selectedModelForPicker
      : (normalizeModelSlug(selectedModelForPicker, selectedProvider) ?? selectedModelForPicker);
  }, [modelOptionsByInstance, selectedInstanceId, selectedModelForPicker, selectedProvider]);

  // ------------------------------------------------------------------
  // Context window
  // ------------------------------------------------------------------
  const activeContextWindow = useMemo(
    () => deriveLatestContextWindowSnapshot(activeThreadActivities ?? []),
    [activeThreadActivities],
  );

  // ------------------------------------------------------------------
  // Composer-local state
  // ------------------------------------------------------------------
  const [composerCursor, setComposerCursor] = useState(() =>
    collapseExpandedComposerCursor(prompt, prompt.length),
  );
  const [composerTrigger, setComposerTrigger] = useState<ComposerTrigger | null>(() =>
    detectComposerTrigger(prompt, prompt.length),
  );
  const [composerHighlightedItemId, setComposerHighlightedItemId] = useState<string | null>(null);
  const [composerHighlightedSearchKey, setComposerHighlightedSearchKey] = useState<string | null>(
    null,
  );
  const [isComposerFooterCompact, setIsComposerFooterCompact] = useState(false);
  const [isComposerPrimaryActionsCompact, setIsComposerPrimaryActionsCompact] = useState(false);
  const [isComposerModelPickerOpen, setIsComposerModelPickerOpen] = useState(false);

  // ------------------------------------------------------------------
  // Refs
  // ------------------------------------------------------------------
  const composerEditorRef = useRef<ComposerPromptEditorHandle>(null);
  const composerFormRef = useRef<HTMLFormElement>(null);
  const composerFormHeightRef = useRef(0);
  const composerSelectLockRef = useRef(false);
  const composerMenuOpenRef = useRef(false);
  const composerMenuItemsRef = useRef<ComposerCommandItem[]>([]);
  const activeComposerMenuItemRef = useRef<ComposerCommandItem | null>(null);
  const dragDepthRef = useRef(0);

  // ------------------------------------------------------------------
  // Derived: composer send state
  // ------------------------------------------------------------------
  const composerSendState = useMemo(
    () =>
      deriveComposerSendState({
        prompt,
        imageCount: composerImages.length,
        terminalContexts: composerTerminalContexts,
      }),
    [composerImages.length, composerTerminalContexts, prompt],
  );

  // ------------------------------------------------------------------
  // Derived: composer trigger / menu
  // ------------------------------------------------------------------
  const composerTriggerKind = composerTrigger?.kind ?? null;
  const pathTriggerQuery = composerTrigger?.kind === "path" ? composerTrigger.query : "";
  const isPathTrigger = composerTriggerKind === "path";
  const workspaceEntries = useComposerPathSearch({
    environmentId,
    cwd: isPathTrigger ? gitCwd : null,
    query: isPathTrigger ? pathTriggerQuery : null,
  });

  const composerMenuItems = useMemo<ComposerCommandItem[]>(() => {
    if (!composerTrigger) return [];
    if (composerTrigger.kind === "path") {
      return workspaceEntries.entries.map((entry) => ({
        id: `path:${entry.kind}:${entry.path}`,
        type: "path",
        path: entry.path,
        pathKind: entry.kind,
        label: basenameOfPath(entry.path),
        description: entry.parentPath ?? "",
      }));
    }
    if (composerTrigger.kind === "slash-command") {
      const builtInSlashCommandItems = [
        {
          id: "slash:model",
          type: "slash-command",
          command: "model",
          label: "/model",
          description: "Switch response model for this thread",
        },
        {
          id: "slash:plan",
          type: "slash-command",
          command: "plan",
          label: "/plan",
          description: "Switch this thread into plan mode",
        },
        {
          id: "slash:ask",
          type: "slash-command",
          command: "ask",
          label: "/ask",
          description: "Switch this thread into ask mode",
        },
        {
          id: "slash:build",
          type: "slash-command",
          command: "default",
          label: "/build",
          description: "Switch this thread back to normal build mode",
        },
        {
          id: "slash:default",
          type: "slash-command",
          command: "default",
          label: "/default",
          description: "Switch this thread back to normal build mode",
        },
      ] satisfies ReadonlyArray<Extract<ComposerCommandItem, { type: "slash-command" }>>;
      const providerSlashCommandItems = (selectedProviderStatus?.slashCommands ?? []).map(
        (command) => ({
          id: `provider-slash-command:${selectedProvider}:${command.name}`,
          type: "provider-slash-command" as const,
          provider: selectedProvider,
          command,
          label: `/${command.name}`,
          description: command.description ?? command.input?.hint ?? "Run provider command",
        }),
      );
      const query = composerTrigger.query.trim().toLowerCase();
      const slashCommandItems = [...builtInSlashCommandItems, ...providerSlashCommandItems];
      if (!query) {
        return slashCommandItems;
      }
      return searchSlashCommandItems(slashCommandItems, query);
    }
    if (composerTrigger.kind === "skill") {
      return searchProviderSkills(selectedProviderStatus?.skills ?? [], composerTrigger.query).map(
        (skill) => ({
          id: `skill:${selectedProvider}:${skill.name}`,
          type: "skill" as const,
          provider: selectedProvider,
          skill,
          label: formatProviderSkillDisplayName(skill),
          description:
            skill.shortDescription ??
            skill.description ??
            (skill.scope ? `${skill.scope} skill` : "Run provider skill"),
        }),
      );
    }
    return [];
  }, [composerTrigger, selectedProvider, selectedProviderStatus, workspaceEntries.entries]);

  const composerMenuOpen = Boolean(composerTrigger);
  const composerMenuSearchKey = composerTrigger
    ? `${composerTrigger.kind}:${composerTrigger.query.trim().toLowerCase()}`
    : null;
  const activeComposerMenuItem = useMemo(() => {
    const activeItemId = resolveComposerMenuActiveItemId({
      items: composerMenuItems,
      highlightedItemId: composerHighlightedItemId,
      currentSearchKey: composerMenuSearchKey,
      highlightedSearchKey: composerHighlightedSearchKey,
    });
    return composerMenuItems.find((item) => item.id === activeItemId) ?? null;
  }, [
    composerHighlightedItemId,
    composerHighlightedSearchKey,
    composerMenuItems,
    composerMenuSearchKey,
  ]);

  composerMenuOpenRef.current = composerMenuOpen;
  composerMenuItemsRef.current = composerMenuItems;
  activeComposerMenuItemRef.current = activeComposerMenuItem;

  const nonPersistedComposerImageIdSet = useMemo(
    () => new Set(nonPersistedComposerImageIds),
    [nonPersistedComposerImageIds],
  );

  const isComposerApprovalState = activePendingApproval !== null;
  const activePendingUserInput = pendingUserInputs[0] ?? null;
  const hasComposerHeader =
    isComposerApprovalState ||
    pendingUserInputs.length > 0 ||
    (showPlanFollowUpPrompt && activeProposedPlan !== null);
  const showComposerAttachmentRow =
    !isComposerApprovalState &&
    pendingUserInputs.length === 0 &&
    (chatContextBindings.length > 0 || composerImages.length > 0);

  const composerFooterHasWideActions = showPlanFollowUpPrompt || activePendingProgress !== null;
  const showPlanSidebarToggle = Boolean(activePlan || sidebarProposedPlan || planSidebarOpen);
  const composerFooterActionLayoutKey = useMemo(() => {
    if (activePendingProgress) {
      return `pending:${activePendingProgress.questionIndex}:${activePendingProgress.isLastQuestion}:${activePendingIsResponding}`;
    }
    if (phase === "running") {
      return "running";
    }
    if (showPlanFollowUpPrompt) {
      return prompt.trim().length > 0 ? "plan:refine" : "plan:implement";
    }
    return `idle:${composerSendState.hasSendableContent}:${isSendBusy}:${isConnecting}:${isPreparingWorktree}`;
  }, [
    activePendingIsResponding,
    activePendingProgress,
    composerSendState.hasSendableContent,
    isConnecting,
    isPreparingWorktree,
    isSendBusy,
    phase,
    prompt,
    showPlanFollowUpPrompt,
  ]);

  const isComposerMenuLoading =
    composerTriggerKind === "path" && pathTriggerQuery.length > 0 && workspaceEntries.isPending;
  const composerMenuEmptyState = useMemo(() => {
    if (composerTriggerKind === "skill") {
      return "No skills found. Try / to browse provider commands.";
    }
    return composerTriggerKind === "path"
      ? "No matching files or folders."
      : "No matching command.";
  }, [composerTriggerKind]);

  // ------------------------------------------------------------------
  // Provider traits UI
  // ------------------------------------------------------------------
  const setPromptFromTraits = useCallback(
    (nextPrompt: string) => {
      if (nextPrompt === promptRef.current) {
        scheduleComposerFocus();
        return;
      }
      promptRef.current = nextPrompt;
      setComposerDraftPrompt(composerDraftTarget, nextPrompt);
      const nextCursor = collapseExpandedComposerCursor(nextPrompt, nextPrompt.length);
      setComposerCursor(nextCursor);
      setComposerTrigger(detectComposerTrigger(nextPrompt, nextPrompt.length));
      scheduleComposerFocus();
    },
    [composerDraftTarget, promptRef, scheduleComposerFocus, setComposerDraftPrompt],
  );

  const providerTraitsMenuContent = renderProviderTraitsMenuContent({
    provider: selectedProvider,
    instanceId: selectedInstanceId,
    ...(routeKind === "server" ? { threadRef: routeThreadRef } : {}),
    ...(routeKind === "draft" && draftId ? { draftId } : {}),
    model: selectedModel,
    models: selectedProviderModels,
    modelOptions: composerModelOptions?.[selectedInstanceId],
    prompt,
    onPromptChange: setPromptFromTraits,
  });
  const providerTraitsPicker = renderComposerProviderTraitsPicker({
    provider: selectedProvider,
    instanceId: selectedInstanceId,
    ...(routeKind === "server" ? { threadRef: routeThreadRef } : {}),
    ...(routeKind === "draft" && draftId ? { draftId } : {}),
    model: selectedModel,
    models: selectedProviderModels,
    modelOptions: composerModelOptions?.[selectedInstanceId],
    prompt,
    onPromptChange: setPromptFromTraits,
  });
  const pendingPrimaryAction = useMemo(
    () =>
      activePendingProgress
        ? {
            questionIndex: activePendingProgress.questionIndex,
            isLastQuestion: activePendingProgress.isLastQuestion,
            canAdvance: activePendingProgress.canAdvance,
            isResponding: activePendingIsResponding,
            isComplete: Boolean(activePendingResolvedAnswers),
          }
        : null,
    [activePendingIsResponding, activePendingProgress, activePendingResolvedAnswers],
  );
  // ------------------------------------------------------------------
  // Prompt helpers
  // ------------------------------------------------------------------
  const setPrompt = useCallback(
    (nextPrompt: string) => {
      setComposerDraftPrompt(composerDraftTarget, nextPrompt);
    },
    [composerDraftTarget, setComposerDraftPrompt],
  );

  const addComposerImage = useCallback(
    (image: ComposerImageAttachment) => {
      addComposerDraftImage(composerDraftTarget, image);
    },
    [composerDraftTarget, addComposerDraftImage],
  );

  const addComposerImagesToDraft = useCallback(
    (images: ComposerImageAttachment[]) => {
      addComposerDraftImages(composerDraftTarget, images);
    },
    [composerDraftTarget, addComposerDraftImages],
  );

  const removeComposerImageFromDraft = useCallback(
    (imageId: string) => {
      removeComposerDraftImage(composerDraftTarget, imageId);
    },
    [composerDraftTarget, removeComposerDraftImage],
  );

  const removeComposerTerminalContextFromDraft = useCallback(
    (contextId: string) => {
      const contextIndex = composerTerminalContexts.findIndex(
        (context) => context.id === contextId,
      );
      if (contextIndex < 0) return;
      const removal = removeInlineTerminalContextPlaceholder(promptRef.current, contextIndex);
      promptRef.current = removal.prompt;
      setPrompt(removal.prompt);
      removeComposerDraftTerminalContext(composerDraftTarget, contextId);
      const nextCursor = collapseExpandedComposerCursor(removal.prompt, removal.cursor);
      setComposerCursor(nextCursor);
      setComposerTrigger(detectComposerTrigger(removal.prompt, removal.cursor));
    },
    [
      composerDraftTarget,
      composerTerminalContexts,
      promptRef,
      removeComposerDraftTerminalContext,
      setPrompt,
    ],
  );

  // ------------------------------------------------------------------
  // Sync refs back to parent
  // ------------------------------------------------------------------
  useEffect(() => {
    promptRef.current = prompt;
    setComposerCursor((existing) => clampCollapsedComposerCursor(prompt, existing));
  }, [prompt, promptRef]);

  useEffect(() => {
    composerImagesRef.current = composerImages;
  }, [composerImages, composerImagesRef]);

  useEffect(() => {
    composerTerminalContextsRef.current = composerTerminalContexts;
  }, [composerTerminalContexts, composerTerminalContextsRef]);

  // ------------------------------------------------------------------
  // Composer menu highlight sync
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!composerMenuOpen) {
      setComposerHighlightedItemId(null);
      setComposerHighlightedSearchKey(null);
      return;
    }
    const nextActiveItemId = resolveComposerMenuActiveItemId({
      items: composerMenuItems,
      highlightedItemId: composerHighlightedItemId,
      currentSearchKey: composerMenuSearchKey,
      highlightedSearchKey: composerHighlightedSearchKey,
    });
    setComposerHighlightedItemId((existing) =>
      existing === nextActiveItemId ? existing : nextActiveItemId,
    );
    setComposerHighlightedSearchKey((existing) =>
      existing === composerMenuSearchKey ? existing : composerMenuSearchKey,
    );
  }, [
    composerHighlightedItemId,
    composerHighlightedSearchKey,
    composerMenuItems,
    composerMenuOpen,
    composerMenuSearchKey,
  ]);

  const lastSyncedPendingInputRef = useRef<{
    requestId: string | null;
    questionId: string | null;
  } | null>(null);

  useEffect(() => {
    const nextCustomAnswer = activePendingProgress?.customAnswer;
    if (typeof nextCustomAnswer !== "string") {
      lastSyncedPendingInputRef.current = null;
      return;
    }

    const nextRequestId = activePendingUserInput?.requestId ?? null;
    const nextQuestionId = activePendingProgress?.activeQuestion?.id ?? null;
    const questionChanged =
      lastSyncedPendingInputRef.current?.requestId !== nextRequestId ||
      lastSyncedPendingInputRef.current?.questionId !== nextQuestionId;
    const textChangedExternally = promptRef.current !== nextCustomAnswer;

    lastSyncedPendingInputRef.current = {
      requestId: nextRequestId,
      questionId: nextQuestionId,
    };

    if (!questionChanged && !textChangedExternally) {
      return;
    }

    promptRef.current = nextCustomAnswer;
    const nextCursor = collapseExpandedComposerCursor(nextCustomAnswer, nextCustomAnswer.length);
    setComposerCursor(nextCursor);
    setComposerTrigger(
      detectComposerTrigger(
        nextCustomAnswer,
        expandCollapsedComposerCursor(nextCustomAnswer, nextCursor),
      ),
    );
    setComposerHighlightedItemId(null);
  }, [
    activePendingProgress?.customAnswer,
    activePendingProgress?.activeQuestion?.id,
    activePendingUserInput?.requestId,
    promptRef,
  ]);

  // ------------------------------------------------------------------
  // Reset compositor state on thread/draft change
  // ------------------------------------------------------------------
  useEffect(() => {
    setComposerHighlightedItemId(null);
    setComposerCursor(collapseExpandedComposerCursor(promptRef.current, promptRef.current.length));
    setComposerTrigger(detectComposerTrigger(promptRef.current, promptRef.current.length));
    dragDepthRef.current = 0;
  }, [draftId, activeThreadId, promptRef]);

  // ------------------------------------------------------------------
  // Footer compact layout observation
  // ------------------------------------------------------------------
  useLayoutEffect(() => {
    const composerForm = composerFormRef.current;
    if (!composerForm) return;
    const measureComposerFormWidth = () => composerForm.clientWidth;
    const measureFooterCompactness = () => {
      const composerFormWidth = measureComposerFormWidth();
      const footerCompact = shouldUseCompactComposerFooter(composerFormWidth, {
        hasWideActions: composerFooterHasWideActions,
      });
      const primaryActionsCompact =
        footerCompact &&
        shouldUseCompactComposerPrimaryActions(composerFormWidth, {
          hasWideActions: composerFooterHasWideActions,
        });
      return {
        primaryActionsCompact,
        footerCompact,
      };
    };

    composerFormHeightRef.current = composerForm.getBoundingClientRect().height;
    const initialCompactness = measureFooterCompactness();
    setIsComposerPrimaryActionsCompact(initialCompactness.primaryActionsCompact);
    setIsComposerFooterCompact(initialCompactness.footerCompact);
    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver((entries) => {
      const [entry] = entries;
      if (!entry) return;
      const nextCompactness = measureFooterCompactness();
      setIsComposerPrimaryActionsCompact((previous) =>
        previous === nextCompactness.primaryActionsCompact
          ? previous
          : nextCompactness.primaryActionsCompact,
      );
      setIsComposerFooterCompact((previous) =>
        previous === nextCompactness.footerCompact ? previous : nextCompactness.footerCompact,
      );
      const nextHeight = entry.contentRect.height;
      const previousHeight = composerFormHeightRef.current;
      composerFormHeightRef.current = nextHeight;
      if (previousHeight > 0 && Math.abs(nextHeight - previousHeight) < 0.5) return;
      if (!shouldAutoScrollRef.current) return;
      scheduleStickToBottom();
    });

    observer.observe(composerForm);
    return () => {
      observer.disconnect();
    };
  }, [
    activeThreadId,
    composerFooterActionLayoutKey,
    composerFooterHasWideActions,
    scheduleStickToBottom,
    shouldAutoScrollRef,
  ]);

  // ------------------------------------------------------------------
  // Image persist effect
  // ------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (composerImages.length === 0) {
        clearComposerDraftPersistedAttachments(composerDraftTarget);
        return;
      }
      const getPersistedAttachmentsForThread = () =>
        getComposerDraft(composerDraftTarget)?.persistedAttachments ?? [];
      try {
        const currentPersistedAttachments = getPersistedAttachmentsForThread();
        const existingPersistedById = new Map(
          currentPersistedAttachments.map((attachment) => [attachment.id, attachment]),
        );
        const stagedAttachmentById = new Map<string, PersistedComposerImageAttachment>();
        await Promise.all(
          composerImages.map(async (image) => {
            try {
              const dataUrl = await readFileAsDataUrl(image.file);
              stagedAttachmentById.set(image.id, {
                id: image.id,
                name: image.name,
                mimeType: image.mimeType,
                sizeBytes: image.sizeBytes,
                dataUrl,
              });
            } catch {
              const existingPersisted = existingPersistedById.get(image.id);
              if (existingPersisted) {
                stagedAttachmentById.set(image.id, existingPersisted);
              }
            }
          }),
        );
        const serialized = Array.from(stagedAttachmentById.values());
        if (cancelled) return;
        syncComposerDraftPersistedAttachments(composerDraftTarget, serialized);
      } catch {
        const currentImageIds = new Set(composerImages.map((image) => image.id));
        const fallbackPersistedAttachments = getPersistedAttachmentsForThread();
        const fallbackPersistedIds: Array<string> = [];
        for (const attachment of fallbackPersistedAttachments) {
          if (currentImageIds.has(attachment.id)) {
            fallbackPersistedIds.push(attachment.id);
          }
        }
        const fallbackPersistedIdSet = new Set(fallbackPersistedIds);
        const fallbackAttachments = fallbackPersistedAttachments.filter((attachment) =>
          fallbackPersistedIdSet.has(attachment.id),
        );
        if (cancelled) return;
        syncComposerDraftPersistedAttachments(composerDraftTarget, fallbackAttachments);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    composerDraftTarget,
    clearComposerDraftPersistedAttachments,
    composerImages,
    getComposerDraft,
    syncComposerDraftPersistedAttachments,
  ]);

  // ------------------------------------------------------------------
  // Callbacks: prompt change
  // ------------------------------------------------------------------
  const onPromptChange = useCallback(
    (
      nextPrompt: string,
      nextCursor: number,
      expandedCursor: number,
      cursorAdjacentToMention: boolean,
      terminalContextIds: string[],
    ) => {
      if (activePendingProgress?.activeQuestion && pendingUserInputs.length > 0) {
        setComposerCursor(nextCursor);
        setComposerTrigger(
          cursorAdjacentToMention ? null : detectComposerTrigger(nextPrompt, expandedCursor),
        );
        onChangeActivePendingUserInputCustomAnswer(
          activePendingProgress.activeQuestion.id,
          nextPrompt,
          nextCursor,
          expandedCursor,
          cursorAdjacentToMention,
        );
        return;
      }
      promptRef.current = nextPrompt;
      setPrompt(nextPrompt);
      if (!terminalContextIdListsEqual(composerTerminalContexts, terminalContextIds)) {
        setComposerDraftTerminalContexts(
          composerDraftTarget,
          syncTerminalContextsByIds(composerTerminalContexts, terminalContextIds),
        );
      }
      setComposerCursor(nextCursor);
      setComposerTrigger(
        cursorAdjacentToMention ? null : detectComposerTrigger(nextPrompt, expandedCursor),
      );
    },
    [
      activePendingProgress?.activeQuestion,
      pendingUserInputs.length,
      onChangeActivePendingUserInputCustomAnswer,
      promptRef,
      setPrompt,
      composerDraftTarget,
      composerTerminalContexts,
      setComposerDraftTerminalContexts,
    ],
  );

  // ------------------------------------------------------------------
  // Callbacks: prompt replacement / menu
  // ------------------------------------------------------------------
  const applyPromptReplacement = useCallback(
    (
      rangeStart: number,
      rangeEnd: number,
      replacement: string,
      options?: { expectedText?: string; focusEditorAfterReplace?: boolean },
    ): boolean => {
      const currentText = promptRef.current;
      const safeStart = Math.max(0, Math.min(currentText.length, rangeStart));
      const safeEnd = Math.max(safeStart, Math.min(currentText.length, rangeEnd));
      if (
        options?.expectedText !== undefined &&
        currentText.slice(safeStart, safeEnd) !== options.expectedText
      ) {
        return false;
      }
      const next = replaceTextRange(promptRef.current, rangeStart, rangeEnd, replacement);
      const nextCursor = collapseExpandedComposerCursor(next.text, next.cursor);
      const nextExpandedCursor = expandCollapsedComposerCursor(next.text, nextCursor);
      promptRef.current = next.text;
      const activePendingQuestion = activePendingProgress?.activeQuestion;
      if (activePendingQuestion && activePendingUserInput) {
        onChangeActivePendingUserInputCustomAnswer(
          activePendingQuestion.id,
          next.text,
          nextCursor,
          nextExpandedCursor,
          false,
        );
      } else {
        setPrompt(next.text);
      }
      setComposerCursor(nextCursor);
      setComposerTrigger(detectComposerTrigger(next.text, nextExpandedCursor));
      if (options?.focusEditorAfterReplace !== false) {
        window.requestAnimationFrame(() => {
          composerEditorRef.current?.focusAt(nextCursor);
        });
      }
      return true;
    },
    [
      activePendingProgress?.activeQuestion,
      activePendingUserInput,
      onChangeActivePendingUserInputCustomAnswer,
      promptRef,
      setPrompt,
    ],
  );

  const readComposerSnapshot = useCallback((): {
    value: string;
    cursor: number;
    expandedCursor: number;
    terminalContextIds: string[];
  } => {
    const editorSnapshot = composerEditorRef.current?.readSnapshot();
    if (editorSnapshot) {
      return editorSnapshot;
    }
    return {
      value: promptRef.current,
      cursor: composerCursor,
      expandedCursor: expandCollapsedComposerCursor(promptRef.current, composerCursor),
      terminalContextIds: composerTerminalContexts.map((context) => context.id),
    };
  }, [composerCursor, composerTerminalContexts, promptRef]);

  const addWorkspacePathsToComposer = useCallback(
    (paths: ReadonlyArray<string>) => {
      if (paths.length === 0) return;
      const snapshot = readComposerSnapshot();
      const insertion = buildContextMentionInsertion(
        paths,
        snapshot.expandedCursor,
        snapshot.value,
      );
      if (!insertion) return;
      applyPromptReplacement(snapshot.expandedCursor, snapshot.expandedCursor, insertion);
    },
    [applyPromptReplacement, readComposerSnapshot],
  );

  const handleAttachWorkspaceContext = useCallback(() => {
    if (!showComposerWorkspaceContextControl) {
      toastManager.add({
        type: "error",
        title: "File context picker is only available for local projects.",
      });
      return;
    }
    if (!gitCwd) {
      toastManager.add({
        type: "error",
        title: "Open a project before adding file context.",
      });
      return;
    }

    const api = readLocalApi();
    const pickFileSystemEntries = api?.dialogs.pickFileSystemEntries;
    if (!pickFileSystemEntries) {
      toastManager.add({
        type: "error",
        title: "Native file picker is unavailable.",
      });
      return;
    }

    void pickFileSystemEntries({ initialPath: gitCwd })
      .then((selectedPaths) => {
        if (!selectedPaths || selectedPaths.length === 0) return;
        const seenPaths = new Set<string>();
        const workspacePaths: string[] = [];
        let skippedOutsideWorkspace = 0;
        for (const selectedPath of selectedPaths) {
          const relativePath = workspaceRelativeContextPath(gitCwd, selectedPath);
          if (relativePath === null) {
            skippedOutsideWorkspace += 1;
            continue;
          }
          if (seenPaths.has(relativePath)) continue;
          seenPaths.add(relativePath);
          workspacePaths.push(relativePath);
        }
        if (workspacePaths.length > 0) {
          addWorkspacePathsToComposer(workspacePaths);
        }
        if (skippedOutsideWorkspace > 0) {
          toastManager.add({
            type: "error",
            title: "Some selected items were outside this project.",
            description: "Only files and folders inside the current workspace can be added.",
          });
        }
      })
      .catch((error: unknown) => {
        toastManager.add({
          type: "error",
          title: "Unable to add file context.",
          description: error instanceof Error ? error.message : "The native picker failed.",
        });
      });
  }, [addWorkspacePathsToComposer, gitCwd, showComposerWorkspaceContextControl]);

  const resolveActiveComposerTrigger = useCallback((): {
    snapshot: { value: string; cursor: number; expandedCursor: number };
    trigger: ComposerTrigger | null;
  } => {
    const snapshot = readComposerSnapshot();
    return {
      snapshot,
      trigger: detectComposerTrigger(snapshot.value, snapshot.expandedCursor),
    };
  }, [readComposerSnapshot]);

  const onSelectComposerItem = useCallback(
    (item: ComposerCommandItem) => {
      if (composerSelectLockRef.current) return;
      composerSelectLockRef.current = true;
      window.requestAnimationFrame(() => {
        composerSelectLockRef.current = false;
      });
      const { snapshot, trigger } = resolveActiveComposerTrigger();
      if (!trigger) return;
      if (item.type === "path") {
        const replacement = `${formatComposerMentionToken(item.path)} `;
        const replacementRangeEnd = extendReplacementRangeForTrailingSpace(
          snapshot.value,
          trigger.rangeEnd,
          replacement,
        );
        const applied = applyPromptReplacement(
          trigger.rangeStart,
          replacementRangeEnd,
          replacement,
          { expectedText: snapshot.value.slice(trigger.rangeStart, replacementRangeEnd) },
        );
        if (applied) {
          setComposerHighlightedItemId(null);
        }
        return;
      }
      if (item.type === "slash-command") {
        if (item.command === "model") {
          const applied = applyPromptReplacement(trigger.rangeStart, trigger.rangeEnd, "", {
            expectedText: snapshot.value.slice(trigger.rangeStart, trigger.rangeEnd),
            focusEditorAfterReplace: false,
          });
          if (applied) {
            setComposerHighlightedItemId(null);
            setIsComposerModelPickerOpen(true);
          }
          return;
        }
        void handleInteractionModeChange(item.command);
        const applied = applyPromptReplacement(trigger.rangeStart, trigger.rangeEnd, "", {
          expectedText: snapshot.value.slice(trigger.rangeStart, trigger.rangeEnd),
        });
        if (applied) {
          setComposerHighlightedItemId(null);
        }
        return;
      }
      if (item.type === "provider-slash-command") {
        const replacement = `/${item.command.name} `;
        const replacementRangeEnd = extendReplacementRangeForTrailingSpace(
          snapshot.value,
          trigger.rangeEnd,
          replacement,
        );
        const applied = applyPromptReplacement(
          trigger.rangeStart,
          replacementRangeEnd,
          replacement,
          { expectedText: snapshot.value.slice(trigger.rangeStart, replacementRangeEnd) },
        );
        if (applied) {
          setComposerHighlightedItemId(null);
        }
        return;
      }
      if (item.type === "skill") {
        const replacement = `$${item.skill.name} `;
        const replacementRangeEnd = extendReplacementRangeForTrailingSpace(
          snapshot.value,
          trigger.rangeEnd,
          replacement,
        );
        const applied = applyPromptReplacement(
          trigger.rangeStart,
          replacementRangeEnd,
          replacement,
          { expectedText: snapshot.value.slice(trigger.rangeStart, replacementRangeEnd) },
        );
        if (applied) {
          setComposerHighlightedItemId(null);
        }
        return;
      }
    },
    [applyPromptReplacement, handleInteractionModeChange, resolveActiveComposerTrigger],
  );

  const onComposerMenuItemHighlighted = useCallback(
    (itemId: string | null) => {
      setComposerHighlightedItemId(itemId);
      setComposerHighlightedSearchKey(composerMenuSearchKey);
    },
    [composerMenuSearchKey],
  );

  const nudgeComposerMenuHighlight = useCallback(
    (key: "ArrowDown" | "ArrowUp") => {
      if (composerMenuItems.length === 0) return;
      const highlightedIndex = composerMenuItems.findIndex(
        (item) => item.id === composerHighlightedItemId,
      );
      const normalizedIndex =
        highlightedIndex >= 0 ? highlightedIndex : key === "ArrowDown" ? -1 : 0;
      const offset = key === "ArrowDown" ? 1 : -1;
      const nextIndex =
        (normalizedIndex + offset + composerMenuItems.length) % composerMenuItems.length;
      const nextItem = composerMenuItems[nextIndex];
      setComposerHighlightedItemId(nextItem?.id ?? null);
    },
    [composerHighlightedItemId, composerMenuItems],
  );

  const submitComposer = useCallback(
    (event?: { preventDefault: () => void }) => {
      onSend(event);
    },
    [onSend],
  );

  // ------------------------------------------------------------------
  // Callbacks: command key
  // ------------------------------------------------------------------
  const onComposerCommandKey = (
    key: "ArrowDown" | "ArrowUp" | "Enter" | "Tab",
    event: KeyboardEvent,
  ) => {
    if (key === "Tab" && event.shiftKey) {
      handleInteractionModeChange(nextProviderInteractionMode(interactionMode));
      return true;
    }
    const { trigger } = resolveActiveComposerTrigger();
    const menuIsActive = composerMenuOpenRef.current || trigger !== null;
    if (menuIsActive) {
      const currentItems = composerMenuItemsRef.current;
      const selectedItem = activeComposerMenuItemRef.current ?? currentItems[0];
      if (key === "ArrowDown" && currentItems.length > 0) {
        nudgeComposerMenuHighlight("ArrowDown");
        return true;
      }
      if (key === "ArrowUp" && currentItems.length > 0) {
        nudgeComposerMenuHighlight("ArrowUp");
        return true;
      }
      if ((key === "Enter" || key === "Tab") && selectedItem) {
        onSelectComposerItem(selectedItem);
        return true;
      }
    }
    if (key === "Enter" && !event.shiftKey) {
      submitComposer();
      return true;
    }
    return false;
  };

  // ------------------------------------------------------------------
  // Callbacks: images
  // ------------------------------------------------------------------
  const addComposerImages = (files: File[]) => {
    if (!activeThreadId || files.length === 0) return;
    if (pendingUserInputs.length > 0) {
      toastManager.add({
        type: "error",
        title: "Attach images after answering plan questions.",
      });
      return;
    }
    const nextImages: ComposerImageAttachment[] = [];
    let nextImageCount = composerImagesRef.current.length;
    let error: string | null = null;
    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        error = `Unsupported file type for '${file.name}'. Please attach image files only.`;
        continue;
      }
      if (file.size > PROVIDER_SEND_TURN_MAX_IMAGE_BYTES) {
        error = `'${file.name}' exceeds the ${IMAGE_SIZE_LIMIT_LABEL} attachment limit.`;
        continue;
      }
      if (nextImageCount >= PROVIDER_SEND_TURN_MAX_ATTACHMENTS) {
        error = `You can attach up to ${PROVIDER_SEND_TURN_MAX_ATTACHMENTS} images per message.`;
        break;
      }
      const previewUrl = URL.createObjectURL(file);
      nextImages.push({
        type: "image",
        id: randomUUID(),
        name: file.name || "image",
        mimeType: file.type,
        sizeBytes: file.size,
        previewUrl,
        file,
      });
      nextImageCount += 1;
    }
    if (nextImages.length === 1 && nextImages[0]) {
      addComposerImage(nextImages[0]);
    } else if (nextImages.length > 1) {
      addComposerImagesToDraft(nextImages);
    }
    setThreadError(activeThreadId, error);
  };

  const removeComposerImage = (imageId: string) => {
    removeComposerImageFromDraft(imageId);
  };

  // ------------------------------------------------------------------
  // Callbacks: paste / drag
  // ------------------------------------------------------------------
  const onComposerPaste = (event: React.ClipboardEvent<HTMLElement>) => {
    const files = Array.from(event.clipboardData.files);
    if (files.length === 0) return;
    const imageFiles = files.filter((file) => file.type.startsWith("image/"));
    if (imageFiles.length === 0) return;
    event.preventDefault();
    addComposerImages(imageFiles);
  };

  const onComposerDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    dragDepthRef.current += 1;
  };

  const onComposerDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
  };

  const onComposerDrop = (event: React.DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    dragDepthRef.current = 0;
    const files = Array.from(event.dataTransfer.files);
    addComposerImages(files);
    focusComposer();
  };
  const handleInterruptPrimaryAction = useCallback(() => {
    void onInterrupt();
  }, [onInterrupt]);
  const handleImplementPlanInNewThreadPrimaryAction = useCallback(() => {
    void onImplementPlanInNewThread();
  }, [onImplementPlanInNewThread]);

  // ------------------------------------------------------------------
  // Imperative handle
  // ------------------------------------------------------------------
  useImperativeHandle(
    composerRef,
    () => ({
      focusAtEnd: () => {
        composerEditorRef.current?.focusAtEnd();
      },
      focusAt: (cursor: number) => {
        composerEditorRef.current?.focusAt(cursor);
      },
      openModelPicker: () => {
        setIsComposerModelPickerOpen(true);
      },
      toggleModelPicker: () => {
        setIsComposerModelPickerOpen((open) => !open);
      },
      isModelPickerOpen: () => isComposerModelPickerOpen,
      readSnapshot: () => {
        return readComposerSnapshot();
      },
      resetCursorState: (options?: {
        cursor?: number;
        prompt?: string;
        detectTrigger?: boolean;
      }) => {
        const promptForState = options?.prompt ?? promptRef.current;
        const cursor = clampCollapsedComposerCursor(promptForState, options?.cursor ?? 0);
        setComposerHighlightedItemId(null);
        setComposerCursor(cursor);
        setComposerTrigger(
          options?.detectTrigger
            ? detectComposerTrigger(
                promptForState,
                expandCollapsedComposerCursor(promptForState, cursor),
              )
            : null,
        );
      },
      addTerminalContext: (selection: TerminalContextSelection) => {
        if (!activeThread) return;
        const snapshot = composerEditorRef.current?.readSnapshot() ?? {
          value: promptRef.current,
          cursor: composerCursor,
          expandedCursor: expandCollapsedComposerCursor(promptRef.current, composerCursor),
          terminalContextIds: composerTerminalContexts.map((context) => context.id),
        };
        const insertion = insertInlineTerminalContextPlaceholder(
          snapshot.value,
          snapshot.expandedCursor,
        );
        const nextCollapsedCursor = collapseExpandedComposerCursor(
          insertion.prompt,
          insertion.cursor,
        );
        const inserted = insertComposerDraftTerminalContext(
          composerDraftTarget,
          insertion.prompt,
          {
            id: randomUUID(),
            threadId: activeThread.id,
            createdAt: new Date().toISOString(),
            ...selection,
          },
          insertion.contextIndex,
        );
        if (!inserted) return;
        promptRef.current = insertion.prompt;
        setComposerCursor(nextCollapsedCursor);
        setComposerTrigger(detectComposerTrigger(insertion.prompt, insertion.cursor));
        window.requestAnimationFrame(() => {
          composerEditorRef.current?.focusAt(nextCollapsedCursor);
        });
      },
      getSendContext: () => ({
        prompt: promptRef.current,
        images: composerImagesRef.current,
        terminalContexts: composerTerminalContextsRef.current,
        selectedPromptEffort,
        selectedModelOptionsForDispatch,
        selectedModelSelection,
        selectedProvider,
        selectedModel,
        selectedProviderModels,
      }),
    }),
    [
      activeThread,
      composerDraftTarget,
      composerCursor,
      composerTerminalContexts,
      insertComposerDraftTerminalContext,
      promptRef,
      composerImagesRef,
      composerTerminalContextsRef,
      isComposerModelPickerOpen,
      readComposerSnapshot,
      selectedModel,
      selectedModelOptionsForDispatch,
      selectedModelSelection,
      selectedPromptEffort,
      selectedProvider,
      selectedProviderModels,
    ],
  );

  // Render
  // ------------------------------------------------------------------
  return (
    <>
      <form
        ref={composerFormRef}
        onSubmit={submitComposer}
        className="mx-auto w-full min-w-0 max-w-208"
        data-chat-composer-form="true"
      >
        <div
          className="group rounded-[32px]"
          onDragEnter={onComposerDragEnter}
          onDragOver={handleComposerDragOver}
          onDragLeave={onComposerDragLeave}
          onDrop={onComposerDrop}
        >
          <div
            className={cn(
              "flex min-h-24 flex-col rounded-[32px] bg-card shadow-[0_4px_14.4px_rgba(9,9,9,0.035)] transition-colors duration-200 not-dark:border not-dark:border-border dark:bg-[#1e1e1e] dark:shadow-[inset_-1px_-1px_1px_rgba(255,255,255,0.06),inset_1px_1px_1px_rgba(255,255,255,0.12),0_4px_14.4px_rgba(9,9,9,0.08)]",
              environmentUnavailable ? "opacity-75" : null,
            )}
          >
            {activePendingApproval ? (
              <div className="rounded-t-[19px] border-b border-border/65 bg-muted/20">
                <ComposerPendingApprovalPanel
                  approval={activePendingApproval}
                  pendingCount={pendingApprovals.length}
                />
              </div>
            ) : pendingUserInputs.length > 0 ? (
              <div className="rounded-t-[19px] border-b border-border/65 bg-muted/20">
                <ComposerPendingUserInputPanel
                  pendingUserInputs={pendingUserInputs}
                  respondingRequestIds={respondingRequestIds}
                  answers={activePendingDraftAnswers}
                  questionIndex={activePendingQuestionIndex}
                  onToggleOption={onSelectActivePendingUserInputOption}
                  onAdvance={onAdvanceActivePendingUserInput}
                />
              </div>
            ) : showPlanFollowUpPrompt && activeProposedPlan ? (
              <div className="rounded-t-[19px] border-b border-border/65 bg-muted/20">
                <ComposerPlanFollowUpBanner
                  key={activeProposedPlan.id}
                  planTitle={proposedPlanTitle(activeProposedPlan.planMarkdown) ?? null}
                />
              </div>
            ) : null}

            <div className={cn("relative flex-1 px-6 pb-2", hasComposerHeader ? "pt-5" : "pt-6")}>
              {composerMenuOpen && !isComposerApprovalState && (
                <div className="absolute inset-x-0 bottom-full z-20 mb-2 px-1">
                  <ComposerCommandMenu
                    items={composerMenuItems}
                    resolvedTheme={resolvedTheme}
                    isLoading={isComposerMenuLoading}
                    triggerKind={composerTriggerKind}
                    groupSlashCommandSections={
                      composerTrigger?.kind === "slash-command" &&
                      composerTrigger.query.trim().length === 0
                    }
                    emptyStateText={composerMenuEmptyState}
                    activeItemId={activeComposerMenuItem?.id ?? null}
                    onHighlightedItemChange={onComposerMenuItemHighlighted}
                    onSelect={onSelectComposerItem}
                  />
                </div>
              )}

              {showComposerAttachmentRow ? (
                <div className="mb-3 flex min-w-0 flex-wrap items-center gap-2">
                  {chatContextBindings.map((binding) => {
                    const sourceProject = binding.sourceProjectId
                      ? chatContextPickerState.projectById[binding.sourceProjectId]
                      : undefined;
                    const syncLabel = binding.cutoffMessageId
                      ? "From selected message"
                      : "From thread";
                    const tooltip = [
                      "Attached thread context",
                      sourceProject?.name,
                      sourceProject?.cwd,
                      syncLabel,
                    ]
                      .filter(Boolean)
                      .join(" · ");
                    return (
                      <Tooltip key={binding.id}>
                        <TooltipTrigger
                          render={
                            <span
                              className={cn(
                                "relative mr-3.5 inline-flex h-8 max-w-full items-center overflow-visible rounded-md border border-border/70 bg-background/55 py-0 pl-2.5 pr-5 shadow-xs/5",
                                SIDEBAR_MUTED_TEXT_CLASS,
                                SIDEBAR_LABEL_TEXT_CLASS,
                              )}
                            />
                          }
                        >
                          <span className="truncate">{binding.sourceThreadTitle}</span>
                          <AttachmentRemoveButton
                            aria-label={`Remove ${binding.sourceThreadTitle} context`}
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              void removeChatContextBinding(binding.id);
                            }}
                          />
                        </TooltipTrigger>
                        <TooltipPopup side="top" className="max-w-80 whitespace-normal">
                          {tooltip}
                        </TooltipPopup>
                      </Tooltip>
                    );
                  })}
                  {composerImages.length > 0 ? (
                    <ImageAttachmentPreviewStrip
                      images={composerImages}
                      variant="composer"
                      className="contents"
                      nonPersistedImageIds={nonPersistedComposerImageIdSet}
                      onExpandImage={onExpandImage}
                      onRemoveImage={removeComposerImage}
                    />
                  ) : null}
                </div>
              ) : null}

              <div className="relative">
                <ComposerPromptEditor
                  editorRef={composerEditorRef}
                  value={
                    isComposerApprovalState
                      ? ""
                      : activePendingProgress
                        ? activePendingProgress.customAnswer
                        : prompt
                  }
                  cursor={composerCursor}
                  terminalContexts={
                    !isComposerApprovalState && pendingUserInputs.length === 0
                      ? composerTerminalContexts
                      : []
                  }
                  skills={selectedProviderStatus?.skills ?? []}
                  className="min-h-8 sm:min-h-8"
                  onRemoveTerminalContext={removeComposerTerminalContextFromDraft}
                  onChange={onPromptChange}
                  onCommandKeyDown={onComposerCommandKey}
                  onPaste={onComposerPaste}
                  placeholder={
                    isComposerApprovalState
                      ? (activePendingApproval?.detail ??
                        "Resolve this approval request to continue")
                      : activePendingProgress
                        ? "Type your own answer, or leave this blank to use the selected option"
                        : showPlanFollowUpPrompt && activeProposedPlan
                          ? "Add feedback to refine the plan, or leave this blank to implement it"
                          : environmentUnavailable
                            ? `${environmentUnavailable.label} is ${
                                environmentUnavailable.connectionState === "connecting"
                                  ? "connecting"
                                  : "disconnected"
                              }`
                            : phase === "disconnected"
                              ? "Ask for follow-up changes or attach images"
                              : isComposerFooterCompact
                                ? "Ask anything"
                                : "Ask anything, @tag files/folders, $use skills, or / for commands"
                  }
                  disabled={
                    isConnecting ||
                    isComposerApprovalState ||
                    (environmentUnavailable !== null && activePendingProgress === null)
                  }
                />
              </div>
            </div>

            {/* Bottom toolbar */}
            {activePendingApproval ? (
              <div className="flex items-center justify-end gap-2 px-2.5 pb-2.5 sm:px-3 sm:pb-3">
                <ComposerPendingApprovalActions
                  requestId={activePendingApproval.requestId}
                  isResponding={respondingRequestIds.includes(activePendingApproval.requestId)}
                  onRespondToApproval={onRespondToApproval}
                />
              </div>
            ) : (
              <div
                data-chat-composer-footer="true"
                data-chat-composer-footer-compact={isComposerFooterCompact ? "true" : "false"}
                className={cn(
                  "flex min-w-0 flex-nowrap items-center justify-between gap-2 overflow-visible px-4 pb-4",
                  isComposerFooterCompact ? "gap-1.5" : "gap-2",
                )}
              >
                <div className={COMPOSER_CONTROL_ROW_CLASS}>
                  {showComposerWorkspaceContextControl ? (
                    <>
                      <ComposerToolbarIconAction
                        label="Add files to context"
                        icon={ComposerPlusIcon}
                        onClick={handleAttachWorkspaceContext}
                      />
                      <ComposerToolbarSeparator />
                    </>
                  ) : null}
                  <ComposerToolbarIconAction
                    label="Attach chat context"
                    icon={GitBranchIcon}
                    onClick={openChatContextDialog}
                  />
                  <ComposerToolbarSeparator />
                  {showComposerBrowserUseControl ? (
                    <>
                      <ComposerPlaceholderAction
                        label="Browser tools coming soon"
                        icon={ComposerGlobeIcon}
                      />
                      <ComposerToolbarSeparator />
                    </>
                  ) : null}

                  {isComposerFooterCompact ? (
                    <>
                      {composerProviderControls.showInteractionModeToggle ? (
                        <>
                          <Select
                            value={interactionMode}
                            onValueChange={(value) => {
                              if (!value) return;
                              handleInteractionModeChange(value as ProviderInteractionMode);
                            }}
                          >
                            <ComposerSelectTrigger
                              variant="ghost"
                              size="sm"
                              className="max-w-28"
                              aria-label="Interaction mode"
                              title={interactionModeConfig[interactionMode].description}
                            >
                              <SelectValue>
                                {interactionModeConfig[interactionMode].label}
                              </SelectValue>
                            </ComposerSelectTrigger>
                            <SelectPopup alignItemWithTrigger={false}>
                              {INTERACTION_MODE_ORDER.map((mode) => {
                                const option = interactionModeConfig[mode];
                                return (
                                  <SelectItem key={mode} value={mode} className="min-w-56 py-2">
                                    <div className="grid min-w-0 gap-0.5">
                                      <span
                                        className={cn(
                                          SIDEBAR_LABEL_COLOR_CLASS,
                                          SIDEBAR_LABEL_TEXT_CLASS,
                                        )}
                                      >
                                        {option.label}
                                      </span>
                                      <span
                                        className={cn(
                                          SIDEBAR_MUTED_TEXT_CLASS,
                                          SIDEBAR_LABEL_TEXT_CLASS,
                                        )}
                                      >
                                        {option.description}
                                      </span>
                                    </div>
                                  </SelectItem>
                                );
                              })}
                            </SelectPopup>
                          </Select>
                          <ComposerToolbarSeparator />
                        </>
                      ) : null}
                      <ComposerFooterModeControls
                        showInteractionModeToggle={false}
                        interactionMode={interactionMode}
                        runtimeMode={runtimeMode}
                        showPlanToggle={showPlanSidebarToggle}
                        planSidebarLabel={planSidebarLabel}
                        planSidebarOpen={planSidebarOpen}
                        onInteractionModeChange={handleInteractionModeChange}
                        onRuntimeModeChange={handleRuntimeModeChange}
                        onTogglePlanSidebar={togglePlanSidebar}
                      />
                    </>
                  ) : (
                    <>
                      {composerProviderControls.showInteractionModeToggle ? (
                        <>
                          <Select
                            value={interactionMode}
                            onValueChange={(value) => {
                              if (!value) return;
                              handleInteractionModeChange(value as ProviderInteractionMode);
                            }}
                          >
                            <ComposerSelectTrigger
                              variant="ghost"
                              size="sm"
                              className="max-w-28"
                              aria-label="Interaction mode"
                              title={interactionModeConfig[interactionMode].description}
                            >
                              <SelectValue>
                                {interactionModeConfig[interactionMode].label}
                              </SelectValue>
                            </ComposerSelectTrigger>
                            <SelectPopup alignItemWithTrigger={false}>
                              {INTERACTION_MODE_ORDER.map((mode) => {
                                const option = interactionModeConfig[mode];
                                return (
                                  <SelectItem key={mode} value={mode} className="min-w-56 py-2">
                                    <div className="grid min-w-0 gap-0.5">
                                      <span
                                        className={cn(
                                          SIDEBAR_LABEL_COLOR_CLASS,
                                          SIDEBAR_LABEL_TEXT_CLASS,
                                        )}
                                      >
                                        {option.label}
                                      </span>
                                      <span
                                        className={cn(
                                          SIDEBAR_MUTED_TEXT_CLASS,
                                          SIDEBAR_LABEL_TEXT_CLASS,
                                        )}
                                      >
                                        {option.description}
                                      </span>
                                    </div>
                                  </SelectItem>
                                );
                              })}
                            </SelectPopup>
                          </Select>
                          <ComposerToolbarSeparator />
                        </>
                      ) : null}
                      <ComposerProviderModelPicker
                        compact={isComposerFooterCompact}
                        activeInstanceId={selectedInstanceId}
                        model={selectedModelForPickerWithCustomFallback}
                        lockedProvider={lockedProvider}
                        lockedContinuationGroupKey={lockedContinuationGroupKey}
                        instanceEntries={providerInstanceEntries}
                        keybindings={keybindings}
                        modelOptionsByInstance={modelOptionsByInstance}
                        terminalOpen={terminalOpen}
                        open={isComposerModelPickerOpen}
                        triggerClassName="max-w-52 sm:max-w-60"
                        {...(composerProviderState.modelPickerIconClassName
                          ? {
                              activeProviderIconClassName:
                                composerProviderState.modelPickerIconClassName,
                            }
                          : {})}
                        onOpenChange={(open) => {
                          setIsComposerModelPickerOpen(open);
                        }}
                        onInstanceModelChange={onProviderModelSelect}
                      />
                      {providerTraitsPicker ? (
                        <>
                          <ComposerToolbarSeparator />
                          {providerTraitsPicker}
                          <ComposerToolbarSeparator />
                        </>
                      ) : (
                        <ComposerToolbarSeparator />
                      )}
                      <ComposerFooterModeControls
                        showInteractionModeToggle={false}
                        interactionMode={interactionMode}
                        runtimeMode={runtimeMode}
                        showPlanToggle={showPlanSidebarToggle}
                        planSidebarLabel={planSidebarLabel}
                        planSidebarOpen={planSidebarOpen}
                        onInteractionModeChange={handleInteractionModeChange}
                        onRuntimeModeChange={handleRuntimeModeChange}
                        onTogglePlanSidebar={togglePlanSidebar}
                      />
                    </>
                  )}

                  {isComposerFooterCompact && providerTraitsMenuContent ? (
                    <>
                      <ComposerToolbarSeparator />
                      <CompactComposerControlsMenu
                        activePlan={false}
                        interactionMode={interactionMode}
                        planSidebarLabel={planSidebarLabel}
                        planSidebarOpen={planSidebarOpen}
                        runtimeMode={runtimeMode}
                        showInteractionModeToggle={false}
                        showRuntimeModeToggle={false}
                        showPlanToggle={false}
                        traitsMenuContent={providerTraitsMenuContent}
                        onInteractionModeChange={handleInteractionModeChange}
                        onTogglePlanSidebar={togglePlanSidebar}
                        onRuntimeModeChange={handleRuntimeModeChange}
                      />
                    </>
                  ) : null}
                </div>

                {/* Right side: send / stop button */}
                <div
                  data-chat-composer-actions="right"
                  data-chat-composer-primary-actions-compact={
                    isComposerPrimaryActionsCompact ? "true" : "false"
                  }
                  className="flex shrink-0 flex-nowrap items-center justify-end gap-2"
                >
                  <ComposerFooterPrimaryActions
                    compact={isComposerPrimaryActionsCompact}
                    activeContextWindow={activeContextWindow}
                    pendingAction={pendingPrimaryAction}
                    isRunning={phase === "running"}
                    showPlanFollowUpPrompt={
                      pendingUserInputs.length === 0 && showPlanFollowUpPrompt
                    }
                    promptHasText={prompt.trim().length > 0}
                    isSendBusy={isSendBusy}
                    isConnecting={isConnecting}
                    isEnvironmentUnavailable={environmentUnavailable !== null}
                    isPreparingWorktree={isPreparingWorktree}
                    hasSendableContent={composerSendState.hasSendableContent}
                    onPreviousPendingQuestion={onPreviousActivePendingUserInputQuestion}
                    onInterrupt={handleInterruptPrimaryAction}
                    onImplementPlanInNewThread={handleImplementPlanInNewThreadPrimaryAction}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </form>

      <Dialog open={chatContextDialogOpen} onOpenChange={setChatContextDialogOpen}>
        <DialogPopup className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitBranchIcon className="size-4" />
              Attach chat context
            </DialogTitle>
            <DialogDescription>Select a source chat to attach as a snapshot.</DialogDescription>
          </DialogHeader>
          <DialogPanel className="space-y-4">
            <Input
              value={chatContextSearch}
              placeholder="Search chats, projects, paths"
              onChange={(event) => setChatContextSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") {
                  return;
                }
                event.preventDefault();
                void confirmAttachChatContext();
              }}
            />

            <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
              {chatContextCandidates.length === 0 ? (
                <div
                  className={cn(
                    "rounded-lg border border-border/70 bg-muted/20 px-3 py-6 text-center",
                    SIDEBAR_MUTED_TEXT_CLASS,
                    SIDEBAR_LABEL_TEXT_CLASS,
                  )}
                >
                  No other chats in this environment.
                </div>
              ) : (
                chatContextCandidates.map((thread) => {
                  const project = chatContextPickerState.projectById[thread.projectId];
                  const selected = selectedChatContextSourceId === thread.id;
                  return (
                    <button
                      key={thread.id}
                      type="button"
                      className={cn(
                        "flex w-full min-w-0 items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
                        selected
                          ? "border-ring/55 bg-accent/60 text-foreground"
                          : "border-border/60 bg-background/40 text-foreground hover:bg-accent/40",
                      )}
                      aria-pressed={selected}
                      onClick={() => setSelectedChatContextSourceId(thread.id)}
                    >
                      <span className="min-w-0">
                        <span
                          className={cn(
                            "block truncate",
                            SIDEBAR_LABEL_COLOR_CLASS,
                            SIDEBAR_LABEL_TEXT_CLASS,
                          )}
                        >
                          {thread.title}
                        </span>
                        <span
                          className={cn(
                            "block truncate",
                            SIDEBAR_MUTED_TEXT_CLASS,
                            SIDEBAR_LABEL_TEXT_CLASS,
                          )}
                        >
                          {project ? `${project.name} · ${project.cwd}` : thread.id}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "shrink-0",
                          SIDEBAR_MUTED_TEXT_CLASS,
                          SIDEBAR_LABEL_TEXT_CLASS,
                        )}
                      >
                        {thread.archivedAt ? "Archived" : ""}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </DialogPanel>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setChatContextDialogOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button disabled={!selectedChatContextSourceId} onClick={confirmAttachChatContext}>
              Attach
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </>
  );
});
