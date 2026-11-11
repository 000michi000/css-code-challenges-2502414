import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'filetree',
  component: 'Pane',
  requestId: 'filetree',
  props: {
    title: 'File tree',
    isFocused: false,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

const entry = (name: string, kind: 'file' | 'dir') => ({
  name, kind, size: 0, mtimeMs: 0, isLink: false,
})

test('lists the root and expands a folder on press', async ($, on) => {
  // In-memory state beneath the plugin, so a press's write is read back.
  const kept = new Map<string, { value: unknown; version: number }>()
  on('state.get', (_, e) => ({
    value: kept.get(`${e.plugin}/${e.key}`) ?? { value: undefined, version: 0 },
  }))
  on('state.set', (_, e) => {
    const id = `${e.plugin}/${e.key}`
    const version = (kept.get(id)?.version ?? 0) + 1
    kept.set(id, { value: e.value, version })
    return { value: { isSet: true, version } }
  })
  on('session.cwd', () => ({ value: '/work/project' }))
  on('fs.list', (_, e) => ({
    value: /(^|\/)src$/.test(e.path)
      ? [entry('main.ts', 'file')]
      : [entry('README.md', 'file'), entry('src', 'dir'), entry('.git', 'dir')],
  }))

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /README\.md/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /\.git/ })).toBeFalsy()
    await ui.unmount()
  }

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'd:src' })
  await ui.unmount()

  // The press kept `src` open: the next drawing shows its contents.
  const again = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await again.find({ type: 'Text', text: /main\.ts/ })).toBeTruthy()
  expect((await again.find({ key: 'd:src' }))?.text).toMatch(/v src/)
  await again.unmount()
})
