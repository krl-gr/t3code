# Upstream Strategy

This document defines how this fork should work with the original
`pingdotgg/t3code` repository.

The goal is to keep receiving upstream reliability, performance, provider,
protocol, and desktop fixes while still allowing this fork to develop its own
product direction, UI, defaults, and local features.

## Strategy

Use a **full-upstream core with a local product layer**.

In practice, this means:

- Keep the project structurally close to upstream T3 Code.
- Regularly merge `upstream/main` into the local product branch.
- Avoid deleting large upstream subsystems just because the local UI does not
  currently expose them.
- Put local product decisions behind small, explicit modules, feature flags,
  wrappers, settings, or UI composition points.
- Treat local UI and workflow changes as a layer on top of upstream runtime
  behavior, not as a fork of the entire architecture.

This is the preferred strategy because T3 Code is still moving quickly. The
most valuable upstream changes are likely to happen in provider orchestration,
contracts, persistence, terminal/runtime behavior, VCS handling, desktop
startup, and update/release infrastructure. Those areas are expensive to
maintain independently.

## Why Not Strip The Project Down

Removing unused-looking upstream pieces may make the tree feel cleaner in the
short term, but it makes future upstream syncs much harder.

Avoid removing these categories unless there is a strong long-term reason:

- shared contracts and schemas
- provider runtime and orchestration code
- persistence migrations
- terminal backend/RPC/contracts
- diff backend/RPC/contracts
- VCS/source-control support
- desktop startup, update, and release plumbing
- settings fields that upstream still owns

If a feature is not wanted in the local product UI, prefer hiding or rerouting
the UI entry point while leaving the underlying upstream system intact.

## Local Product Layer

Local behavior should be centralized instead of scattered across large upstream
files.

Preferred places for local product policy:

- `apps/web/src/productConfig.ts`
- `apps/web/src/productFeatures.ts`
- `apps/web/src/productCopy.ts`
- small product-specific wrapper components under `apps/web/src/components`
- server-side product policy modules only when behavior truly belongs on the
  server

Examples of product-layer responsibilities:

- whether a UI entry point is visible
- labels and copy
- default settings chosen by this fork
- local feature flags
- local navigation/layout decisions
- mapping local UX concepts onto upstream runtime concepts

Avoid encoding product decisions directly inside deep runtime modules unless
there is no better boundary.

## Upstream Sync Workflow

Use temporary sync branches for upstream updates.

Recommended flow:

```bash
git fetch upstream --prune
git switch local-desktop-build
git switch -c sync/upstream-YYYY-MM-DD
git merge upstream/main
```

Then:

1. Resolve conflicts.
2. Preserve local product behavior intentionally.
3. Run verification proportional to the merge.
4. Review the resulting diff.
5. Merge the sync branch back into the product branch.

Do not mix feature work into upstream sync commits. A sync should answer only
one question: "What changed when we absorbed upstream?"

## Merge Frequency

Merge upstream regularly.

Recommended cadence:

- every 1-2 weeks during active development
- before starting a large UI rewrite
- immediately for urgent security, data-loss, or provider reliability fixes

Do not let the fork drift for too long. Large gaps make conflicts harder to
understand and encourage accidental rewrites of upstream behavior.

## Full Merge vs Cherry-Pick

Prefer a full merge from `upstream/main` when changes touch:

- contracts
- provider runtime
- orchestration
- persistence migrations
- VCS/source control
- terminal backend
- desktop startup/build/release
- package versions and lockfile

Use cherry-pick only for:

- urgent bug fixes
- isolated security fixes
- small release/build fixes needed immediately
- small UI fixes that do not depend on broader upstream changes

Cherry-picking broad runtime changes is risky because upstream commits often
depend on nearby schema, test, package, or migration changes.

## How To Handle Future Local UI Changes

The fork is expected to make significant UI changes over time. That is fine,
but these changes should be structured so upstream updates remain manageable.

Guidelines:

- Extract local UI composition into smaller components instead of repeatedly
  rewriting large upstream files.
- Keep data flow, contracts, and server behavior close to upstream unless the
  product requirement truly needs a runtime change.
- Prefer local labels and wrappers over renaming upstream protocol concepts.
- Hide unwanted UI entry points instead of deleting the underlying subsystem.
- Keep broad styling changes separate from runtime behavior changes.
- Make local UI changes in focused commits so conflicts can be understood later.

Future product ideas such as external-terminal workflows, hiding diff entry
points, changing interaction-mode labels, or moving composer/sidebar controls
should follow this rule: first decide whether the change is UI policy or runtime
behavior. UI policy belongs in the product layer; runtime behavior needs a
careful contract/server plan.

## Subsystem Policy

### Terminal

Keep upstream terminal contracts and backend code unless there is a clear
long-term replacement.

If the product wants an external terminal workflow, add that as a product
behavior or separate shell/open capability. Do not remove the embedded terminal
runtime just because the main UI no longer opens it.

### Diff

Keep diff contracts, server APIs, and data derivation. If the product does not
want a visible diff button, hide the entry point in the UI.

Direct diff routes and internal diff summaries should continue to avoid
breaking existing upstream assumptions.

### Interaction Modes

Keep upstream interaction-mode values stable at the contract level unless a
separate runtime behavior is required.

If the product wants different naming, prefer a UI label or local mapping first.
Only change contracts when the provider/runtime semantics actually diverge.

### Sidebar And Composer

These are expected to diverge visually from upstream. Keep the divergence
focused:

- isolate reusable local row/action/control components
- keep upstream selectors and store contracts when possible
- avoid unnecessary rewrites of orchestration or provider state
- sync upstream before large layout changes

## Conflict Policy

When an upstream merge conflicts:

1. Identify whether the conflict is product UI, runtime logic, schema, or build
   tooling.
2. Prefer upstream for runtime correctness unless the local fork has a specific
   product reason to differ.
3. Preserve local product UI intentionally, not by blindly accepting our side.
4. Add or update tests around the conflict if behavior changed.
5. Keep conflict-resolution commits small enough to review.

Known high-conflict areas for this fork:

- `apps/web/src/components/Sidebar.tsx`
- `apps/web/src/components/chat/ChatComposer.tsx`
- `apps/web/src/components/ChatView.tsx`
- product styling in `apps/web/src/index.css`
- local desktop build scripts
- settings and contracts touched by local UI defaults

## Verification

For upstream syncs that touch TypeScript or runtime behavior, run:

```bash
bun fmt
bun lint
bun typecheck
```

Run targeted tests with `bun run test`, never `bun test`.

Examples:

```bash
bun run test apps/server/src/open.test.ts
bun run test apps/web/src/components/Sidebar.logic.test.ts
bun run test packages/contracts/src/settings.test.ts
```

For docs-only changes, `bun fmt` is enough unless the change affects typed or
runtime behavior.

## Commit Hygiene

Keep these commit types separate:

- upstream sync commits
- conflict-resolution commits
- local product UI commits
- local runtime feature commits
- formatting-only commits
- release/build commits

This separation makes future merges easier to reason about and helps identify
which local changes are intentional product decisions.

## Default Decision Rule

When unsure:

1. Keep upstream runtime and contracts.
2. Add local product behavior at the UI/config boundary.
3. Avoid deleting code that upstream still evolves.
4. Prefer regular full merges over long drift plus selective cherry-picks.

The fork should feel like its own product in the UI, but it should stay close to
T3 Code in the engine.
