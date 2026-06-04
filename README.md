# Up.computer

The best GUI for your coding CLIs.

Up.computer is a desktop workspace for running coding-agent CLIs from one
visual surface. Keep Codex CLI, Cursor CLI, Claude Code, Pi, OpenCode, your
editor, and your git workflow. Add durable threads, terminals, diffs, branches,
source-control actions, and local or remote environment controls around them.

## Status

Up.computer is an alpha project. It is usable, but the app and repository are
moving quickly. Expect rough edges, incomplete docs, and occasional breaking
changes while the product direction settles.

Bug reports and focused feedback are welcome. Large feature work should start
with an issue before a pull request.

## Install

Download the latest alpha build from GitHub Releases:

<https://github.com/krl-gr/upcomputer/releases>

Provider CLIs are installed and authenticated separately. At minimum, install
and log in to one runtime you want to use:

- Codex CLI: install the [Codex CLI](https://developers.openai.com/codex/cli)
  and run `codex login`.
- Claude Code: install [Claude Code](https://claude.com/product/claude-code)
  and run `claude auth login`.
- OpenCode: install [OpenCode](https://opencode.ai) and run
  `opencode auth login`.
- Cursor CLI and Pi support are alpha and follow their respective CLI/runtime
  setup paths.

Package-manager installs such as Homebrew, winget, and AUR are not the official
install path for this fork yet.

## Run From Source

Requirements:

- Bun 1.3.11+
- Node 24.13.1+
- Git
- At least one supported coding-agent CLI installed and authenticated

```bash
bun install
bun run dev
```

Useful development commands:

```bash
bun run dev:web
bun run dev:server
bun run dev:desktop
bun run dev:marketing
```

## What It Does

- Run multiple coding-agent CLIs from one desktop GUI.
- Keep agent work grouped into project threads instead of scattered terminal
  sessions.
- Review changed files and diffs before trusting or shipping a run.
- Use integrated terminals in the same project/worktree context.
- Commit, push, publish repositories, and open pull requests from the app.
- Work against local, network, and SSH-backed environments as that support
  matures.

For a fuller overview of the product surface, see
[FEATURES.md](./FEATURES.md).

## Product Philosophy

Up.computer is designed as an agentic workspace that integrates with your real
development tools instead of replacing them. For more detail, see
[Philosophy.md](./Philosophy.md).

## Repository Layout

- `apps/desktop`: Electron desktop shell and desktop release integration.
- `apps/server`: Node.js WebSocket server that brokers provider sessions and
  serves the web app.
- `apps/web`: React/Vite application for the main product UI.
- `apps/marketing`: Astro marketing and download site.
- `apps/mobile`: Experimental Expo/React Native app.
- `packages/contracts`: Shared Effect Schema contracts for provider events,
  WebSocket protocol, settings, and session types.
- `packages/shared`: Shared runtime utilities consumed by server and clients.
- `packages/ssh` and `packages/tailscale`: Remote-environment support.
- `docs`: User-facing and operational docs.
- `.docs` and `.plans`: Internal architecture notes and planning artifacts.

## Relationship To T3 Code

Up.computer is built as a fork of the open-source T3 Code project:

<https://github.com/pingdotgg/t3code>

This fork keeps the upstream runtime, provider orchestration, contracts,
desktop infrastructure, and release plumbing close to upstream while developing
a different product direction, UI, branding, and workflow layer.

Some package names, storage keys, docs, and internal identifiers still refer to
T3 Code while the fork is being separated. That is expected during the alpha.

For more detail, see [docs/upstream-strategy.md](./docs/upstream-strategy.md).

## Contributing

The project is early and the architecture is still settling. Small, focused
bug fixes, reliability improvements, performance improvements, and clear docs
fixes are the easiest contributions to review.

If you want to make a non-trivial product, UI, or architecture change, open an
issue first so scope can be discussed before you spend time on a large branch.

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a pull request.

## Security

Please do not report security vulnerabilities in public issues. See
[SECURITY.md](./SECURITY.md) for the current reporting process.

## License And Brand

The source code is MIT licensed. See [LICENSE](./LICENSE).

The MIT license does not grant trademark rights in the Up.computer name, logo,
or visual identity. You may use the name to refer to this project, but do not
use the branding in a way that implies endorsement or an official build unless
you have permission.
