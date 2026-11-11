# filetree

A Claude Code mod that opens a pane beside the chat showing the session's working
directory as a collapsible file tree. Press a folder to expand or collapse it, or use
"collapse all" to fold everything. The tree refreshes after Write, Edit, NotebookEdit
and Bash tool calls, so new and changed files appear as Claude works. `.git` and
`node_modules` are hidden. Reopen the pane any time with `/filetree`.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install filetree --marketplace 000michi000/css-code-challenges-2502414
```

From a shell:

```
claude plugin install filetree --marketplace 000michi000/css-code-challenges-2502414
```

Answer `y` to add the marketplace, then pick a scope (user scope loads it in every session). In the desktop app, click + next to the prompt box, then Plugins, Add marketplace with `000michi000/css-code-challenges-2502414`, then Add plugin.
