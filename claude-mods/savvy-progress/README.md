# savvy-progress

A Claude Code mod with two views of what Claude is doing.

The band above the prompt shows a progress bar of Claude's task list (TaskCreate /
TaskUpdate, or TodoWrite) with completed/total, the task in progress, the turn's
elapsed time, its tool count, the tool running now, and how many subagents run.

The Progress sidebar lists every task (done, in progress, pending) and every
subagent: its description, type, status, tool calls, elapsed time and current tool,
synced each second from the engine's agent list. It opens by itself the first time
a task list or a subagent appears. `/progress` opens it and shows the band again;
`/progress reset` clears everything.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install savvy-progress --marketplace 000michi000/css-code-challenges-2502414
```

From a shell:

```
claude plugin install savvy-progress --marketplace 000michi000/css-code-challenges-2502414
```

Answer `y` to add the marketplace, then pick a scope (user scope loads it in every session). In the desktop app, click + next to the prompt box, then Plugins, Add marketplace with `000michi000/css-code-challenges-2502414`, then Add plugin.
