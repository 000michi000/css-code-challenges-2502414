# filetree

A Claude Code mod that opens a pane beside the chat showing the session's working
directory as a collapsible file tree. Press a folder to expand or collapse it, or use
"collapse all" to fold everything. The tree refreshes after Write, Edit, NotebookEdit
and Bash tool calls, so new and changed files appear as Claude works. `.git` and
`node_modules` are hidden. Reopen the pane any time with `/filetree`.
