import { atom, read, update } from 'claude-code'
import type { Register, FsEntry, EngineInterface } from 'claude-code'

import type { ExpandedDirs } from '../types'

const PANE = 'filetree'
const TITLE = 'File tree'
const HIDDEN = new Set(['.git', 'node_modules', '.DS_Store'])
const CHANGING = new Set(['Write', 'Edit', 'NotebookEdit', 'Bash'])

// Directories the person opened, by path relative to the working directory.
const initialExpanded: ExpandedDirs = []
const expanded = atom({ plugin: 'filetree', key: 'expanded' } as const, initialExpanded, {
  shape: 'expanded-1',
})
// Bumped after a tool that may change files, so the pane redraws.
const version = atom({ plugin: 'filetree', key: 'version' } as const, 0)

type Row = { path: string; name: string; depth: number; isDir: boolean }

const sortEntries = (list: FsEntry[]) =>
  [...list]
    .filter(entry => !HIDDEN.has(entry.name))
    .sort((a, b) =>
      a.kind === 'dir' && b.kind !== 'dir'
        ? -1
        : b.kind === 'dir' && a.kind !== 'dir'
          ? 1
          : a.name.localeCompare(b.name),
    )

async function walk(
  $: EngineInterface,
  dir: string,
  depth: number,
  open: Set<string>,
  rows: Row[],
  limit: number,
): Promise<void> {
  if (rows.length >= limit) return
  const entries = await $.fs.list(dir === '' ? undefined : dir).catch(() => [] as FsEntry[])
  for (const entry of sortEntries(entries)) {
    if (rows.length >= limit) return
    const path = dir === '' ? entry.name : `${dir}/${entry.name}`
    const isDir = entry.kind === 'dir'
    rows.push({ path, name: entry.name, depth, isDir })
    if (isDir && open.has(path)) {
      await walk($, path, depth + 1, open, rows, limit)
    }
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'filetree',
      description: 'Show the working directory as a file tree in a pane',
    })
    void $.ui.open({ id: PANE, title: TITLE })

    return next(e)
  })

  on('command.run', { command: 'filetree' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE })

    return { text: 'File tree pane opened.' }
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (CHANGING.has(e.tool)) {
      await update($, version, n => n + 1).catch(() => undefined)
    }

    return ran
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    await read($, version)
    const open = new Set(await read($, expanded))
    const room = Math.max(5, (e.viewport?.rows ?? 30) - 4)
    const rows: Row[] = []
    await walk($, '', 0, open, rows, 500)
    const cwd = await $.session.cwd()
    const root = cwd.split('/').filter(Boolean).pop() ?? cwd

    const toggle = (path: string) => async () => {
      await update($, expanded, list =>
        list.includes(path) ? list.filter(p => p !== path) : [...list, path],
      )
    }

    return (
      <Box flexDirection="column">
        <Box flexDirection="row">
          <Text bold>{root}/</Text>
          <Text> </Text>
          <Button key="collapse-all" plain onPress={async () => {
            await update($, expanded, () => [])
          }}>
            collapse all
          </Button>
        </Box>
        {rows.length === 0 && <Text dimColor>Empty directory.</Text>}
        {rows.slice(0, Math.max(room, 200)).map(row =>
          row.isDir ? (
            <Button key={`d:${row.path}`} plain onPress={toggle(row.path)}>
              {'  '.repeat(row.depth)}
              {open.has(row.path) ? 'v ' : '> '}
              {row.name}/
            </Button>
          ) : (
            <Text key={`f:${row.path}`}>
              {'  '.repeat(row.depth)}
              {'  '}
              {row.name}
            </Text>
          ),
        )}
        {rows.length >= 500 && <Text dimColor>(truncated at 500 entries)</Text>}
      </Box>
    )
  })
}
