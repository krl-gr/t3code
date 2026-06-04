# Features

This page describes the current product surface in practical terms: what the
feature does and how to use it in the app. Up.computer is still alpha, so some
labels and entry points may move as the UI changes.

## Tabs And Workspace

1. Click `+` in the workspace tab bar to create a new thread tab.
2. Click another chat in the sidebar to load it into the active tab.
3. Drag a tab to split it into another workspace group.
4. Use `...` when a tab group has more tabs than fit in the header.
5. Click `x` on the active tab to close it.

## Drafts

Drafts are saved prompt drafts for an existing chat. They are not the same as
unsent text in the main composer.

1. Open an existing chat.
2. Click the Drafts icon in the context bar, or open `More chat actions` >
   `View` > `Drafts`.
3. Click `+` or the empty `New draft` state to create a prompt draft.
4. Type the draft in the Drafts panel.
5. Select a draft to see its save state, send button, and delete button.
6. Click the send arrow to send the selected draft to the chat.
7. Drag drafts up or down to reorder them.

## Chat Forks

1. Open the thread context menu for a chat in the sidebar and choose
   `Fork thread` to fork the whole chat.
2. Or hover a completed assistant message and click the branch icon to fork
   from that message.
3. The fork opens as a new chat titled `Fork: <source title>`.
4. The fork keeps the source model, runtime mode, interaction mode, branch, and
   worktree.
5. Message forks attach source context only up to the selected assistant
   message.

## Chat Context

Chat context attaches another chat as snapshot context for the current chat.

1. Open the target chat.
2. Click the branch icon labeled `Attach chat context` in the composer toolbar.
3. Search for another chat in the dialog.
4. Select the source chat and click `Attach`.
5. The composer shows a `Snapshot: <chat title>` chip.
6. Click `x` on the chip to remove that attached context.
7. When you send a message, the attached chat snapshot is prepended as explicit
   chat context.

## File Context

1. Click `+` labeled `Add files to context` in the composer toolbar.
2. Pick files or folders inside the current workspace.
3. Selected paths are inserted into the prompt as context mentions at the
   cursor.
4. Files outside the current workspace are skipped.

## Browser Use

Browser use is currently wired through Pi browser tools on the server side. The
composer browser button still shows a placeholder.

1. Open `Settings` > `Browser`.
2. Add allowed origins, or enable `Allow all HTTPS websites`.
3. Use `Open login window` if the isolated browser profile needs a manual
   login.
4. Start a Pi chat.
5. Ask Pi to open, search, click, scroll, read, or screenshot an allowed page.
6. Browser actions can be blocked by origin settings, unknown target pages, or
   mutating social/account actions.

## Computer Use

Computer Use is currently exposed to supported providers through the configured
MCP backend and Pi computer-use tools.

1. Open `Settings` > `Computer Use`.
2. Enable `Computer Use`.
3. Choose `Observe` to allow desktop inspection only, or `Control` to allow
   clicks, typing, keys, scroll, drag, and value changes.
4. Confirm the backend command, usually `open-codex-computer-use` with the
   `mcp` argument.
5. Use `Doctor`, `Refresh tools`, or `Restart` if the backend is not ready.
6. Optionally require approvals for control actions.
7. Optionally set an allowed-apps list. Leave it empty to allow visible apps
   except sensitive credential surfaces.
8. Start a supported provider chat and ask it to inspect or operate the desktop.

## Pi Agent Workflows

1. Enable and configure the Pi provider.
2. Select a Pi model in the composer model picker.
3. Use Pi for agent runs that need Pi's SDK-backed tools.
4. Browser and Computer Use tools are registered into Pi sessions when their
   server services are available.

## Product Direction

Up.computer favors integration over replacement. For the deeper product
philosophy, see [Philosophy.md](./Philosophy.md).
