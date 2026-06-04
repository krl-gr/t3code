# AGENTS.md

## Task Completion Requirements

- Do not run `bun fmt`, `bun lint`, `bun typecheck`, `bun lint:mobile`, or any tests unless the user explicitly asks for verification in that turn.
- If the user asks for a fix/change without explicitly asking to verify, implement the change and report that verification was intentionally skipped per this instruction.
- NEVER run `bun test`. If the user explicitly asks for tests, use `bun run test` (runs Vitest).

## Project Snapshot

T3 Code is a minimal web GUI for using coding agents like Codex and Claude.

This repository is a VERY EARLY WIP. Proposing sweeping changes that improve long-term maintainability is encouraged.

## Core Priorities

1. Performance first.
2. Reliability first.
3. Keep behavior predictable under load and during failures (session restarts, reconnects, partial streams).

If a tradeoff is required, choose correctness and robustness over short-term convenience.

## Maintainability

Long term maintainability is a core priority. If you add new functionality, first check if there is shared logic that can be extracted to a separate module. Duplicate logic across multiple files is a code smell and should be avoided. Don't be afraid to change existing code. Don't take shortcuts by just adding local logic to solve a problem.

## Project-Local Skills

Reusable agent workflows for this repository live in `agents/skills/`.

Treat this `AGENTS.md` file as the canonical project instruction source. When a project-local skill applies, read the relevant `SKILL.md` after reading this file and follow both; `AGENTS.md` takes precedence if there is a conflict.

Landing-page skills copied from TheUICodex App Landing Core:

- `agents/skills/app-landing-workflow/SKILL.md`: full app landing-page workflow from product understanding through page versions.
- `agents/skills/landing-workspace-setup/SKILL.md`: workspace setup and initial landing plan.
- `agents/skills/landing-product-audience-discovery/SKILL.md`: product problem, audience, goals, and source discovery.
- `agents/skills/landing-customer-research-tone/SKILL.md`: customer research, objections, alternatives, and tone.
- `agents/skills/landing-content-screenshot-plan/SKILL.md`: landing-page copy, screenshot choices, proof blocks, and CTA direction.
- `agents/skills/landing-visual-directions/SKILL.md`: visual references, design direction, and multiple page versions.

Other CLIs that do not auto-discover Codex skills should be pointed directly at these files when landing-page work is requested.

## Package Roles

- `apps/server`: Node.js WebSocket server. Wraps Codex app-server (JSON-RPC over stdio), serves the React web app, and manages provider sessions.
- `apps/web`: React/Vite UI. Owns session UX, conversation/event rendering, and client-side state. Connects to the server via WebSocket.
- `packages/contracts`: Shared effect/Schema schemas and TypeScript contracts for provider events, WebSocket protocol, and model/session types. Keep this package schema-only — no runtime logic.
- `packages/shared`: Shared runtime utilities consumed by both server and web. Uses explicit subpath exports (e.g. `@t3tools/shared/git`) — no barrel index.

## Codex App Server (Important)

T3 Code is currently Codex-first. The server starts `codex app-server` (JSON-RPC over stdio) per provider session, then streams structured events to the browser through WebSocket push messages.

How we use it in this codebase:

- Session startup/resume and turn lifecycle are brokered in `apps/server/src/codexAppServerManager.ts`.
- Provider dispatch and thread event logging are coordinated in `apps/server/src/providerManager.ts`.
- WebSocket server routes NativeApi methods in `apps/server/src/wsServer.ts`.
- Web app consumes orchestration domain events via WebSocket push on channel `orchestration.domainEvent` (provider runtime activity is projected into orchestration events server-side).

Docs:

- Codex App Server docs: https://developers.openai.com/codex/sdk/#app-server

## Reference Repos

- Open-source Codex repo: https://github.com/openai/codex
- Codex-Monitor (Tauri, feature-complete, strong reference implementation): https://github.com/Dimillian/CodexMonitor

Use these as implementation references when designing protocol handling, UX flows, and operational safeguards.
