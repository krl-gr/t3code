# Project Description

## Confirmed Product

Up.computer is a desktop app for running coding-agent CLIs through a fast, visual workspace.

It wraps the tools developers already use, including Codex CLI, Cursor CLI, Pi, OpenCode, and provider-specific runtimes, then gives those sessions a durable GUI: projects, threads, terminal access, provider/model controls, diffs, branches, source-control actions, and local or remote environment connections.

## Confirmed Problem

Coding-agent work is powerful in the terminal, but it becomes hard to supervise when sessions, commands, diffs, branches, and approvals are spread across multiple CLIs and shells.

## Confirmed Audience

Developers who already run coding agents and want a better control surface without abandoning their existing agents, subscriptions, CLIs, editors, or local workflows.

## Buyer / Decision Maker

Early individual developers and small engineering teams. The buyer and user are likely the same person at this stage.

## Painful Current Workflow

- Run Codex, Cursor, Pi, OpenCode, or similar agents in separate terminal sessions.
- Track which agent changed which files.
- Jump between terminal, editor, git status, diff tooling, and PR commands.
- Restart, reconnect, or recover sessions manually when a process or socket fails.
- Run parallel work cautiously because shared checkouts can collide.

## Product Result

Developers can use one desktop workspace to launch, monitor, review, and ship work from multiple coding CLIs.

## Landing Goal

Drive downloads of Up.computer and clearly explain why a GUI belongs around CLI coding agents.

## Proof Available

- Product screenshot: `apps/marketing/public/updated-screenshot.webp` currently shows the upstream app surface and should be treated as product UI proof, not brand proof.
- Repository implementation shows Up.computer branding in the shared/runtime app code.
- Existing T3 Code testimonials are upstream proof and should not be used as Up.computer testimonials.

## Sources Inspected

- `README.md`
- `apps/desktop/package.json`
- `packages/shared/src/branding.ts`
- `apps/desktop/src/app/DesktopEnvironment.ts`
- `apps/desktop/src/app/DesktopApp.ts`
- `apps/web/src/components/workspace/ChatWorkspace.tsx`
- `apps/web/src/components/chat/ChatComposer.tsx`
- `apps/web/src/components/ThreadTerminalDrawer.tsx`
- `apps/web/src/components/DiffPanel.tsx`
- `apps/web/src/components/GitActionsControl.tsx`
- `apps/web/src/components/settings/ConnectionsSettings.tsx`
- `apps/marketing/src/pages/index.astro`
- `apps/marketing/src/layouts/Layout.astro`

## Confirmation

User confirmed the audience and corrected the positioning toward: best GUI for all your CLIs: Codex CLI, Cursor CLI, Pi, OpenCode.
