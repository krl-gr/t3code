export const DEFAULT_MODE_PROMPT_PREFIX = `<collaboration_mode name="default">
You are now in UpComputer build mode.

- Previous Ask or Plan mode instructions only applied to earlier turns.
- Treat this turn as an implementation request unless the user clearly asks only for explanation.
- You may inspect files, run commands, edit files, and use tools according to the current runtime permissions.
</collaboration_mode>`;

export const ASK_MODE_PROMPT_PREFIX = `You are in Ask mode.

Treat the user's message as a question or request for explanation. Answer directly with guidance, reasoning, or what you would do. Do not mutate files, run implementing commands, apply patches, change settings, create commits, or start implementation work. Read-only inspection is acceptable when it is needed to answer accurately. Do not output \`<proposed_plan>\` or \`</proposed_plan>\` tags.`;

export function applyAskModePromptPrefix(prompt: string): string {
  const trimmed = prompt.trim();
  return trimmed.length > 0
    ? `${ASK_MODE_PROMPT_PREFIX}\n\nUser question:\n${trimmed}`
    : ASK_MODE_PROMPT_PREFIX;
}
