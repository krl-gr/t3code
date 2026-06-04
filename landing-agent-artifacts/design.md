# Design Direction

## Audience Feeling

Calm, fast, technical, and tool-native. The visitor should feel that Up.computer is a serious desktop app for developers who already know why coding agents matter.

## Chosen Version

Version 1: CLI Cockpit. It best matches the confirmed positioning: the best GUI for all your coding CLIs.

## Page Structure

1. Hero: Up.computer as the first-viewport signal, headline, download CTA, GitHub CTA, and real product screenshot.
2. CLI rail: Codex CLI, Cursor CLI, Pi, OpenCode, plus "bring the next one."
3. Workflow band: choose agent, run thread, inspect diff, ship PR.
4. Product detail: terminals, diffs, source control, environments.
5. Honest early-stage/open-source block.
6. Final download CTA.

## Typography

Use the existing DM Sans + JetBrains Mono stack. Keep hero type large but restrained. Use mono for CLI labels, commands, branch names, and status chips.

## Color Direction

Stay dark and product-focused, but avoid an all-purple SaaS look. Use charcoal base, white foreground, green/blue/orange accents for status, provider, and git states. Keep cards at 8px radius where possible.

## Media Treatment

Use the real app screenshot in the hero. Do not hide it in a decorative mockup; keep it visible and inspectable. Use compact product cards below for specific workflow states.

## Interaction / Motion

Keep motion subtle: hover lift on CTA/buttons, no decorative orbs. The product should feel fast and stable.

## What To Avoid

- Generic "AI platform" language.
- Upstream T3 Code testimonials as Up.computer proof.
- Abstract gradients, floating decoration, or fake metrics.
- Overclaiming support if a CLI/provider is not fully implemented yet.

## Five Page Versions

1. CLI Cockpit: one desktop GUI for all coding CLIs. Recommended.
2. Review First: lead with visual diffs, changed files, source-control confidence.
3. Parallel Sessions: lead with projects, branches, and multiple agents working at once.
4. Local/Remote Control: lead with local machine, LAN, SSH, and pairing.
5. Open Early Tool: lead with open source, forkability, and early developer trust.

## Implementation Notes

- Replace marketing page copy and structure in `apps/marketing/src/pages/index.astro`.
- Update default layout title/description/nav/footer branding in `apps/marketing/src/layouts/Layout.astro`.
- Update download page title/heading copy in `apps/marketing/src/pages/download.astro`.
- Preserve release/download logic unless final release repository changes.
