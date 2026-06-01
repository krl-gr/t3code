# Research Notes

## Research Scope

Find market language, pain patterns, and proof expectations for desktop GUIs around coding-agent CLIs. Up.computer-specific customer proof is not available yet.

## Sources Checked

- Claude Code Desktop docs: https://code.claude.com/docs/en/desktop
- Runpane desktop agent managers category page: https://runpane.com/desktop-agent-managers
- Band landing page: https://getband.app/
- OpenCovibe landing page: https://opencovibe.com/
- OpenCode landing page: https://dev.opencode.ai/
- AgentsView docs/home: https://www.agentsview.io/
- OpenAI Codex issue about CLI/Desktop session history: https://github.com/openai/codex/issues/21079
- Kaiden landing page: https://openkaiden.ai/
- Kuzy landing page: https://kuzy.ai/

## Category Expectations

Desktop coding-agent products repeatedly emphasize:

- parallel sessions
- visual diffs
- integrated terminals
- session history
- local-first behavior
- provider/model choice
- Git worktree or branch isolation
- PR/CI workflow
- remote or SSH environments
- keeping the user's existing editor

## Strong Customer Pains

- Terminal-only workflows hide too much of what an agent is doing.
- Raw diff output is not enough when agent changes span multiple files.
- Parallel agent work is risky without branch/worktree boundaries.
- Session history and resume flows are fragmented across CLI, desktop, and IDE surfaces.
- Developers want agent flexibility and do not want one vendor's GUI to trap them in one model or runtime.

## Relevant Market Language

- "desktop agent manager"
- "run coding agents in parallel"
- "worktrees, diffs, and review workflow"
- "visual diff review"
- "session history"
- "any CLI agent"
- "bring your own coding agent"
- "same setup"
- "one place for all your agents"

## Alternatives

- Provider-native desktops such as Claude Code Desktop.
- Agent-specific CLIs such as OpenCode.
- Agent-first workspaces such as Band.
- Session browsers such as AgentsView.
- Sandbox/governance tools such as Kaiden.
- Terminal multiplexers and hand-rolled shell layouts.

## Trust Gaps

- Early product, limited proof.
- Upstream branding remnants can confuse visitors.
- Users will expect clarity on whether their existing subscriptions, local auth, and repo data remain under their control.
- Users will want to know which CLIs are supported now versus planned.

## Tone Guidance

Use direct developer language. Avoid abstract AI-platform claims. The page should sound like a tool made by developers who run coding agents all day:

- "Your CLIs are good. The workflow around them is not."
- "One desktop surface for Codex CLI, Cursor CLI, Pi, OpenCode, and the next agent you install."
- "Review the diff before you ship."
- "Keep your editor. Keep your subscriptions. Put the sessions in one place."

## Proof Limits

Do not use upstream T3 Code testimonials as Up.computer endorsements. Use product UI, feature specificity, and open-source/GitHub access as honest proof until real Up.computer users exist.
