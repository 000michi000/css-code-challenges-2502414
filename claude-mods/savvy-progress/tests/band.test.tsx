import { expect, mock, test } from 'claude-code/testing'

const BAND = {
  plugin: 'savvy-progress',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: true, rows: 10 },
} as const

test('tracks tasks into a progress bar', async ($, on) => {
  const clock = mock.clock(on)
  on('ui.status', () => ({ value: undefined }))
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
  on('command.register', () => ({ value: { command: 'progress' } }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  let n = 0
  on('tool.call', (_, e) => {
    if (e.tool === 'TaskCreate') {
      n += 1
      return { result: { task: { id: String(n), subject: e.subject } } }
    }
    return { result: { success: true } }
  })

  on('ui.open', () => ({ value: { isPlaced: true } }))
  let agentStatus = 'running'
  on('agent.spawn', () => ({ model: 'm', agentId: 'ag1' }))
  on('agent.list', () => ({
    value: [{ id: 'ag1', description: 'Scan repo', type: 'Explore', status: agentStatus }],
  }))

  await $.prompt.submit({ text: 'go' })
  await $.tool.call({ tool: 'TaskCreate', subject: 'Write code', description: 'x', activeForm: 'Writing code' })
  await $.tool.call({ tool: 'TaskCreate', subject: 'Test it', description: 'y', activeForm: 'Testing' })
  await $.tool.call({ tool: 'TaskUpdate', taskId: '1', status: 'completed' })
  await $.tool.call({ tool: 'TaskUpdate', taskId: '2', status: 'in_progress' })

  await $.agent.spawn({ prompt: 'look', description: 'Scan repo', subagentType: 'Explore' })
  await $.tool.call({ tool: 'Grep', pattern: 'x', agentId: 'ag1' } as never)
  await clock.advance(65_000)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ type: 'Text', text: /1\/2/ }))?.text).toBe('1/2 · Testing · 1m 05s · 4 tools ')
    expect(await ui.find({ type: 'Text', text: /^████████░░░░░░░░ $/ })).toBeTruthy()
    await ui.unmount()
  }
})

test('the sidebar shows tasks and subagent progress', async ($, on) => {
  const clock = mock.clock(on)
  on('ui.status', () => ({ value: undefined }))
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
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('tool.call', () => ({ result: { task: { id: '1', subject: 'Write code' } } }))
  let agentStatus = 'running'
  on('agent.spawn', () => ({ model: 'm', agentId: 'ag1' }))
  on('agent.list', () => ({
    value: [{ id: 'ag1', description: 'Scan repo', type: 'Explore', status: agentStatus }],
  }))

  await $.prompt.submit({ text: 'go' })
  await $.tool.call({ tool: 'TaskCreate', subject: 'Write code', description: 'x', activeForm: 'Writing code' })
  await $.agent.spawn({ prompt: 'look', description: 'Scan repo', subagentType: 'Explore' })
  await $.tool.call({ tool: 'Grep', pattern: 'x', agentId: 'ag1' } as never)
  await $.tool.call({ tool: 'Read', file_path: '/a', agentId: 'ag1' } as never)
  await clock.advance(30_000)

  const PANE = {
    plugin: 'savvy-progress', component: 'Pane', requestId: 'savvy-progress',
    props: { title: 'Progress', isFocused: false, bodyColumns: 40, placement: 'dock',
      scroll: { offset: 0, bodyRows: 30 }, view: {} },
  } as const

  for (const surface of ['terminal', 'desktop', 'vscode'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /○ Write code/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /● Scan repo/ })).toBeTruthy()
    expect((await ui.find({ type: 'Text', text: /Explore ·/ }))?.text).toMatch(/Explore · running · 2 tools · 30s/)
    await ui.unmount()
  }

  // Mobile seats the pane above the input: a compact bar with Details.
  const phone = await $.ui.mount({ ...PANE, surface: 'mobile', props: { ...PANE.props, placement: 'inline' } })
  expect(await phone.find({ type: 'Text', text: /^░+$/ })).toBeTruthy()
  expect((await phone.find({ type: 'Text', text: /0\/1/ }))?.text).toMatch(/0\/1 · next task pending · 30s · 1 tool/)
  expect(await phone.find({ type: 'Text', text: /Scan repo/ })).toBeFalsy()
  await phone.press({ key: 'details' })
  await phone.unmount()
  const opened = await $.ui.mount({ ...PANE, surface: 'mobile', props: { ...PANE.props, placement: 'inline' } })
  expect(await opened.find({ type: 'Text', text: /● Scan repo/ })).toBeTruthy()
  await opened.unmount()

  agentStatus = 'completed'
  await clock.advance(5_000)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /✓ Scan repo/ })).toBeTruthy()
  expect((await ui.find({ type: 'Text', text: /Explore ·/ }))?.text).toMatch(/completed · 2 tools · 31s/)
  await ui.unmount()
})

test('a bar shows even with no tasks or subagents', async ($, on) => {
  const clock = mock.clock(on)
  on('ui.status', () => ({ value: undefined }))
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
  on('agent.list', () => ({ value: [] }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('turn.complete', () => ({}))
  const PANE = {
    plugin: 'savvy-progress', component: 'Pane', requestId: 'savvy-progress', surface: 'mobile',
    props: { title: 'Progress', isFocused: false, bodyColumns: 24, placement: 'inline',
      scroll: { offset: 0, bodyRows: 10 }, view: {} },
  } as const

  const fresh = await $.ui.mount(PANE)
  expect(await fresh.find({ type: 'Text', text: /^█{20}$/ })).toBeTruthy()
  expect((await fresh.find({ type: 'Text', text: /Ready/ }))?.text).toBe('Ready')
  await fresh.unmount()

  await $.prompt.submit({ text: 'go' })
  await clock.advance(3_000)
  const busy = await $.ui.mount(PANE)
  expect(await busy.find({ type: 'Text', text: /^[█░]{20}$/ })).toBeTruthy()
  expect((await busy.find({ type: 'Text', text: /Working/ }))?.text).toBe('Working · 3s · 0 tools')
  await busy.unmount()
})
