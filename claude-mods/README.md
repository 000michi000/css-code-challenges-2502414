# Claude Code mods

Two Claude Code mods (hooks-module plugins) used with this repo.

- **filetree**: a pane showing the working directory as a collapsible file tree, refreshed after file-changing tool calls. `/filetree` opens it.
- **savvy-progress**: a progress bar above the prompt (and a compact pane above the input on mobile) tracking Claude's task list, subagents, or turn activity, plus a Progress sidebar listing each task and subagent with status, tool calls, elapsed time and current tool. `/progress` opens it, `/progress reset` clears it.

## Using them

Load a mod folder while developing:

```
claude --plugin-dir claude-mods/filetree --plugin-dir claude-mods/savvy-progress
```

Check a mod:

```
claude plugin validate claude-mods/savvy-progress
claude plugin test claude-mods/savvy-progress
```
