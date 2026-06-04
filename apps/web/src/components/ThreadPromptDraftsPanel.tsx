import {
  closestCenter,
  DndContext,
  PointerSensor,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ScopedThreadRef, ThreadPromptDraft } from "@t3tools/contracts";
import { ThreadPromptDraftId } from "@t3tools/contracts";
import { Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ensureLocalApi } from "../localApi";
import { cn, randomUUID } from "../lib/utils";
import { Button } from "./ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";
import { composerSendButtonClassName } from "./chat/ComposerPrimaryActions";

interface ThreadPromptDraftsPanelProps {
  threadRef: ScopedThreadRef;
  onSendPrompt: (prompt: string) => void;
}

interface SortableDraftItemProps {
  draft: ThreadPromptDraft;
  focused: boolean;
  selected: boolean;
  saveState: "idle" | "saving" | "error";
  textareaRef: (element: HTMLTextAreaElement | null) => void;
  onDelete: () => void;
  onEdit: () => void;
  onFocus: () => void;
  onPersist: () => void;
  onSelect: () => void;
  onSend: () => void;
  onUpdate: (body: string) => void;
}

function createPromptDraft(threadRef: ScopedThreadRef, body = ""): ThreadPromptDraft {
  const now = new Date().toISOString();
  return {
    id: ThreadPromptDraftId.make(randomUUID()),
    environmentId: threadRef.environmentId,
    threadId: threadRef.threadId,
    body,
    createdAt: now,
    updatedAt: now,
  };
}

function SortableDraftItem({
  draft,
  focused,
  selected,
  saveState,
  textareaRef,
  onDelete,
  onEdit,
  onFocus,
  onPersist,
  onSelect,
  onSend,
  onUpdate,
}: SortableDraftItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: draft.id,
    disabled: focused,
  });
  const canSend = draft.body.trim().length > 0;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "w-full rounded-lg bg-[#1e1e1e] px-[7px] py-2 text-left text-[14px] leading-[18px] text-[#bab9ba] transition-colors hover:bg-[#242424]",
        selected && "text-[#d7d7d7]",
        isDragging && "z-10 opacity-80 shadow-lg",
      )}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      onPointerDownCapture={onSelect}
      {...attributes}
      {...(focused ? {} : listeners)}
    >
      {focused ? (
        <textarea
          ref={textareaRef}
          value={draft.body}
          placeholder="New draft"
          rows={Math.max(1, draft.body.split("\n").length)}
          className="field-sizing-content block max-h-40 min-h-[18px] w-full resize-none overflow-hidden bg-transparent p-0 text-[14px] leading-[18px] text-inherit outline-none placeholder:text-[#bab9ba]"
          onChange={(event) => onUpdate(event.target.value)}
          onFocus={onFocus}
          onBlur={onPersist}
        />
      ) : (
        <button
          type="button"
          className="block min-h-[18px] w-full p-0 text-left text-[14px] leading-[18px] text-inherit outline-none"
          onClick={onEdit}
        >
          <span className={cn("line-clamp-3 break-words", !draft.body.trim() && "text-[#bab9ba]")}>
            {draft.body.trim() || "New draft"}
          </span>
        </button>
      )}
      {selected ? (
        <div className="mt-2 flex h-8 items-end justify-between gap-2">
          <div className="min-w-0 pb-1 text-xs leading-none text-[#6e6e6e]">
            {saveState === "saving" ? "Saving" : saveState === "error" ? "Not saved" : "Saved"}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label="Delete draft"
                    className="text-[#949494] hover:text-[#f2b8b5]"
                    onClick={onDelete}
                  />
                }
              >
                <Trash2Icon className="size-4" />
              </TooltipTrigger>
              <TooltipPopup side="top">Delete draft</TooltipPopup>
            </Tooltip>
            <button
              type="button"
              className={composerSendButtonClassName(canSend)}
              disabled={!canSend}
              onClick={onSend}
              aria-label="Send draft"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M8 13V3M8 3L4 7M8 3L12 7"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export const ThreadPromptDraftsPanel = memo(function ThreadPromptDraftsPanel({
  threadRef,
  onSendPrompt,
}: ThreadPromptDraftsPanelProps) {
  const [drafts, setDrafts] = useState<readonly ThreadPromptDraft[]>([]);
  const [selectedDraftId, setSelectedDraftId] = useState<ThreadPromptDraft["id"] | null>(null);
  const [focusedDraftId, setFocusedDraftId] = useState<ThreadPromptDraft["id"] | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "error">("idle");
  const draftsRef = useRef<readonly ThreadPromptDraft[]>([]);
  const textareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const hydratedRef = useRef(false);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
  );

  const persistDrafts = useCallback(
    async (nextDrafts: readonly ThreadPromptDraft[], options?: { silent?: boolean }) => {
      if (!options?.silent) {
        setSaveState("saving");
      }
      try {
        await ensureLocalApi().persistence.setThreadPromptDrafts(
          threadRef.environmentId,
          threadRef.threadId,
          nextDrafts,
        );
        if (!options?.silent) {
          setSaveState("idle");
        }
      } catch {
        if (!options?.silent) {
          setSaveState("error");
        }
      }
    },
    [threadRef.environmentId, threadRef.threadId],
  );

  useEffect(() => {
    let cancelled = false;
    setHydrated(false);
    hydratedRef.current = false;
    setSaveState("idle");
    ensureLocalApi()
      .persistence.getThreadPromptDrafts(threadRef.environmentId, threadRef.threadId)
      .then((loadedDrafts) => {
        if (cancelled) return;
        const orderedDrafts = [...loadedDrafts];
        draftsRef.current = orderedDrafts;
        setDrafts(orderedDrafts);
        setSelectedDraftId(orderedDrafts[0]?.id ?? null);
        setFocusedDraftId(null);
        hydratedRef.current = true;
        setHydrated(true);
      })
      .catch(() => {
        if (cancelled) return;
        draftsRef.current = [];
        setDrafts([]);
        setSelectedDraftId(null);
        setFocusedDraftId(null);
        hydratedRef.current = true;
        setHydrated(true);
        setSaveState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [threadRef.environmentId, threadRef.threadId]);

  useEffect(() => {
    draftsRef.current = drafts;
    if (!hydratedRef.current) return;
    const timeout = window.setTimeout(() => {
      void persistDrafts(drafts);
    }, 350);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [drafts, persistDrafts]);

  useEffect(
    () => () => {
      if (hydratedRef.current) {
        void persistDrafts(draftsRef.current, { silent: true });
      }
    },
    [persistDrafts],
  );

  const selectedDraft = useMemo(
    () => drafts.find((draft) => draft.id === selectedDraftId) ?? null,
    [drafts, selectedDraftId],
  );

  const createDraft = useCallback(() => {
    const nextDraft = createPromptDraft(threadRef);
    setDrafts((current) => [nextDraft, ...current]);
    setSelectedDraftId(nextDraft.id);
    setFocusedDraftId(nextDraft.id);
    window.requestAnimationFrame(() => {
      textareaRefs.current[nextDraft.id]?.focus();
    });
  }, [threadRef]);

  const updateDraft = useCallback(
    (draftId: ThreadPromptDraft["id"], body: string) => {
      const now = new Date().toISOString();
      setDrafts((current) =>
        current.map((draft) =>
          draft.id === draftId
            ? {
                ...draft,
                body,
                updatedAt: now,
              }
            : draft,
        ),
      );
    },
    [],
  );

  const deleteSelectedDraft = useCallback(() => {
    if (!selectedDraft) return;
    setDrafts((current) => {
      const nextDrafts = current.filter((draft) => draft.id !== selectedDraft.id);
      setSelectedDraftId(nextDrafts[0]?.id ?? null);
      return nextDrafts;
    });
  }, [selectedDraft]);

  const sendSelectedDraft = useCallback(() => {
    const prompt = selectedDraft?.body.trim();
    if (!prompt) return;
    onSendPrompt(prompt);
  }, [onSendPrompt, selectedDraft]);

  const reorderDrafts = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setDrafts((current) => {
      const oldIndex = current.findIndex((draft) => draft.id === active.id);
      const newIndex = current.findIndex((draft) => draft.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return current;
      return arrayMove([...current], oldIndex, newIndex);
    });
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col p-2 text-[#bab9ba]">
      <div className="flex h-9 shrink-0 items-center justify-between gap-2 px-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate font-medium text-[15px] text-[#bab9ba]">Drafts</span>
        </div>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label="New draft"
                className="text-[#949494] hover:text-[#d7d7d7]"
                onClick={createDraft}
              />
            }
          >
            <PlusIcon className="size-4" />
          </TooltipTrigger>
          <TooltipPopup side="left">New draft</TooltipPopup>
        </Tooltip>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {!hydrated ? (
          <div className="flex h-32 items-center justify-center text-[#949494]">
            <Loader2Icon className="size-4 animate-spin" />
          </div>
        ) : drafts.length === 0 ? (
          <button
            type="button"
            className="flex min-h-20 w-full items-center justify-center rounded-lg border border-dashed border-[#2f2f2f] bg-[#1e1e1e]/70 px-3 text-center text-sm text-[#949494] transition-colors hover:border-[#3a3a3a] hover:text-[#d7d7d7]"
            onClick={createDraft}
          >
            New draft
          </button>
        ) : (
          <DndContext
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis]}
            sensors={sensors}
            onDragEnd={reorderDrafts}
          >
            <SortableContext
              items={drafts.map((draft) => draft.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {drafts.map((draft) => (
                  <SortableDraftItem
                    key={draft.id}
                    draft={draft}
                    focused={focusedDraftId === draft.id}
                    selected={draft.id === selectedDraftId}
                    saveState={saveState}
                    textareaRef={(element) => {
                      textareaRefs.current[draft.id] = element;
                    }}
                    onDelete={deleteSelectedDraft}
                    onEdit={() => {
                      setSelectedDraftId(draft.id);
                      setFocusedDraftId(draft.id);
                      window.requestAnimationFrame(() => {
                        textareaRefs.current[draft.id]?.focus();
                      });
                    }}
                    onFocus={() => {
                      setSelectedDraftId(draft.id);
                      setFocusedDraftId(draft.id);
                    }}
                    onPersist={() => {
                      if (focusedDraftId === draft.id) {
                        setFocusedDraftId(null);
                      }
                      void persistDrafts(draftsRef.current);
                    }}
                    onSelect={() => setSelectedDraftId(draft.id)}
                    onSend={sendSelectedDraft}
                    onUpdate={(body) => updateDraft(draft.id, body)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
});
