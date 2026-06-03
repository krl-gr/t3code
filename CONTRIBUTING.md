# Contributing

Up.computer is early. The project is open source, but the product direction,
runtime boundaries, and upstream-sync strategy are still settling. Contributions
are welcome when they are small, focused, and easy to review.

## What We Are Most Likely To Accept

- Focused bug fixes.
- Reliability fixes, especially around session lifecycle, reconnects, provider
  runtime behavior, source control, and desktop startup.
- Performance improvements with a clear before/after explanation.
- Documentation fixes that make setup, provider configuration, or release
  behavior easier to understand.
- Small UI fixes with screenshots or short recordings when visual behavior
  changes.

## What Needs Discussion First

Open an issue before working on:

- new product areas or major feature work
- broad UI redesigns
- changes to provider contracts, persistence, or orchestration semantics
- upstream-sync strategy changes
- large refactors, package renames, or repository structure changes

Opening an issue first helps keep scope clear and avoids work that may not fit
the current direction.

## Pull Request Guidelines

- Keep PRs small and focused.
- Do not mix unrelated fixes together.
- Explain what changed and why.
- Call out any tradeoffs or behavior changes.
- Include before/after screenshots for UI changes.
- Include a short recording for motion, timing, transitions, or interaction
  changes.
- Mention whether verification was run. If not, say why.

Large PRs may be declined or deferred even when the idea is good. Smaller PRs
are much easier to review and merge.

## Trust And PR Labels

PRs may be automatically labeled with a `vouch:*` trust status and a `size:*`
diff-size status. External contributors should expect `vouch:unvouched` until
they are explicitly added to [.github/VOUCHED.td](.github/VOUCHED.td).

These labels are review aids. They are not a judgment on the person opening the
PR.

## Local Development

Install dependencies:

```bash
bun install
```

Run the app:

```bash
bun run dev
```

Useful commands:

```bash
bun run dev:web
bun run dev:server
bun run dev:desktop
```

## Project Priorities

When tradeoffs are necessary, the project prioritizes:

1. Performance.
2. Reliability.
3. Predictable behavior during failures, reconnects, partial streams, and
   session restarts.

Correctness and robustness matter more than short-term convenience.
