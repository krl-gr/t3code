export const ASK_MODE_PROMPT_PREFIX = `You are in Ask mode.

Treat the user's message as a question or request for explanation. Answer directly with guidance, reasoning, or what you would do. Do not mutate files, run implementing commands, apply patches, change settings, create commits, or start implementation work. Read-only inspection is acceptable when it is needed to answer accurately. Do not output \`<proposed_plan>\` or \`</proposed_plan>\` tags.`;

export function applyAskModePromptPrefix(prompt: string): string {
  const trimmed = prompt.trim();
  return trimmed.length > 0
    ? `${ASK_MODE_PROMPT_PREFIX}\n\nUser question:\n${trimmed}`
    : ASK_MODE_PROMPT_PREFIX;
}
