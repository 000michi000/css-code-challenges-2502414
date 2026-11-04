import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { Activity, AgentRow, Task } from '../types'

const PANE = 'savvy-progress'
const PANE_TITLE = 'Progress'
const IDLE: Activity = { isWorking: false, startedAt: 0, endedAt: 0, tools: 0 }
const NO_TASKS: Task[] = []
const NO_AGENTS: AgentRow[] = []
const LIVE = new Set(['pending', 'running', 'waiting'])

const tasks = atom({ plugin: 'savvy-progress', key: 'tasks' } as const, NO_TASKS, {
  shape: 'tasks-1',
})
const activity = atom({ plugin: 'savvy-progress', key: 'activity' } as const, IDLE, {
  shape: 'activity-1',
})
const agents = atom({ plugin: 'savvy-progress', key: 'agents' } as const, NO_AGENTS, {
  shape: 'agents-1',
})
// Bumped each second while anything runs, so elapsed times redraw.
const tick = atom({ plugin: 'savvy-progress', key: 'tick' } as const, 0)
const isHidden = atom({ plugin: 'savvy-progress', key: 'isHidden' } as const, false)
// Whether the compact (mobile) pane shows the full task and subagent list.
const isExpanded = atom({ plugin: 'savvy-progress', key: 'isExpanded' } as const, false)

function bar(done: number, total: number, width: number): string {
  const filled = total === 0 ? 0 : Math.round((done / total) * width)
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

function duration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

// A bar for every moment: tasks done when there is a task list, else
// subagents finished, else a sweep while a turn runs and a full bar at rest.
type Progress = { bar: string; label: string; tone: 'busy' | 'done' | 'idle' }

function sweep(step: number, width: number): string {
  const span = 3
  const pos = step % (width + span)
  return Array.from({ length: width }, (_, i) =>
    i >= pos - span && i < pos ? '█' : '░',
  ).join('')
}

function progress(
  list: Task[],
  act: Activity,
  crew: AgentRow[],
  now: number,
  step: number,
  width: number,
): Progress {
  const running = crew.filter(a => LIVE.has(a.status)).length
  const turn = act.isWorking
    ? `${duration(now - act.startedAt)} · ${plural(act.tools, 'tool')}${act.tool ? ` · ${act.tool}` : ''}`
    : ''
  const join = (...parts: string[]) => parts.filter(Boolean).join(' · ')

  if (list.length > 0) {
    const done = list.filter(t => t.status === 'completed').length
    const active = list.find(t => t.status === 'in_progress')
    const isAllDone = done === list.length
    return {
      bar: bar(done, list.length, width),
      label: join(
        `${done}/${list.length}`,
        isAllDone ? 'all tasks done' : (active?.activeForm ?? active?.subject ?? 'next task pending'),
        turn,
      ),
      tone: isAllDone ? 'done' : 'busy',
    }
  }
  if (crew.length > 0 && (running > 0 || act.isWorking)) {
    const finished = crew.length - running
    return {
      bar: bar(finished, crew.length, width),
      label: join(`${finished}/${crew.length} subagents done`, turn),
      tone: running === 0 ? 'done' : 'busy',
    }
  }
  if (act.isWorking) {
    return { bar: sweep(step, width), label: join('Working', turn), tone: 'busy' }
  }
  return {
    bar: '█'.repeat(width),
    label: act.startedAt > 0
      ? `Ready · last turn ${duration(act.endedAt - act.startedAt)}, ${plural(act.tools, 'tool')}`
      : 'Ready',
    tone: 'idle',
  }
}

type Summary = { bar?: string; counts?: string; current?: string; meta: string }

function summarize(
  list: Task[],
  act: Activity,
  crew: AgentRow[],
  now: number,
): Summary | undefined {
  const done = list.filter(t => t.status === 'completed').length
  const active = list.find(t => t.status === 'in_progress')
  const running = crew.filter(a => LIVE.has(a.status)).length
  const elapsed = duration((act.isWorking ? now : act.endedAt) - act.startedAt)
  const parts = act.isWorking
    ? [elapsed, plural(act.tools, 'tool'), act.tool]
    : act.startedAt > 0
      ? [`last turn ${elapsed}, ${plural(act.tools, 'tool')}`]
      : []
  if (running > 0) parts.push(`${plural(running, 'subagent')} running`)
  const meta = parts.filter(Boolean).join(' · ')

  if (list.length > 0) {
    const allDone = done === list.length
    return {
      bar: bar(done, list.length, 12),
      counts: `${done}/${list.length}`,
      current: allDone
        ? 'all tasks done'
        : (active?.activeForm ?? active?.subject ?? 'next task pending'),
      meta,
    }
  }
  if (act.isWorking || running > 0) return { current: 'Working', meta }
  return undefined
}

async function refreshStatus($: EngineInterface): Promise<void> {
  const s = summarize(
    await read($, tasks),
    await read($, activity),
    await read($, agents),
    await $.clock.now(),
  )
  const text =
    s && [s.counts && `${s.bar} ${s.counts}`, s.current, s.meta].filter(Boolean).join(' · ')
  $.ui.status(text || undefined)
}

// Folds the engine's own view of each subagent into the rows: status, and
// the time a row stopped running.
async function syncAgents($: EngineInterface): Promise<boolean> {
  const listed = await $.agent.list().catch(() => [])
  const now = await $.clock.now()
  const byId = new Map(listed.map(info => [info.id, info]))
  const rows = await update($, agents, list =>
    list.map(row => {
      const info = byId.get(row.id)
      if (info === undefined || info.status === row.status) return row
      const isEnding = LIVE.has(row.status) && !LIVE.has(info.status)
      return {
        ...row,
        status: info.status,
        endedAt: isEnding ? now : row.endedAt,
        tool: isEnding ? undefined : row.tool,
      }
    }),
  )
  return rows.some(row => LIVE.has(row.status))
}

async function openPane($: EngineInterface): Promise<void> {
  await $.ui.open({ id: PANE, title: PANE_TITLE })
}

// Module variables start over on a reload; the state atoms do not.
let timer: Timer | undefined
let hasOpened = false

function ensureTicking($: EngineInterface): void {
  if (timer !== undefined) return
  timer = $.clock.every(1000, () => {
    void onTick($).catch(() => undefined)
  })
}

async function onTick($: EngineInterface): Promise<void> {
  await update($, tick, n => n + 1)
  const anyRunning = await syncAgents($)
  const act = await read($, activity)
  await refreshStatus($)
  if (!anyRunning && !act.isWorking) {
    timer?.cancel()
    timer = undefined
  }
}

async function openOnce($: EngineInterface): Promise<void> {
  if (hasOpened) return
  hasOpened = true
  await openPane($)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'progress',
      description: 'Open the Progress sidebar and show the band; "reset" clears it',
    })
    hasOpened = true
    void openPane($).catch(() => undefined)

    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    const now = await $.clock.now()
    await update($, activity, () => ({ isWorking: true, startedAt: now, endedAt: 0, tools: 0 }))
    ensureTicking($)
    await refreshStatus($)

    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const ran = await next(e)
    if (e.agentId === undefined) {
      const now = await $.clock.now()
      await update($, activity, a => ({ ...a, isWorking: false, endedAt: now, tool: undefined }))
      await syncAgents($)
      await refreshStatus($)
    }

    return ran
  })

  on('agent.spawn', async ($, e, next) => {
    const ran = await next(e)
    if (ran.agentId !== undefined) {
      const now = await $.clock.now()
      const row: AgentRow = {
        id: ran.agentId,
        description: e.description || 'subagent',
        type: e.subagentType ?? 'general-purpose',
        status: 'running',
        startedAt: now,
        endedAt: 0,
        tools: 0,
      }
      await update($, agents, list => [...list.filter(a => a.id !== row.id), row].slice(-30))
      ensureTicking($)
      await openOnce($)
      await refreshStatus($)
    }

    return ran
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    const inAgent = e.agentId
    try {
      if (inAgent === undefined) {
        await update($, activity, a => ({ ...a, tools: a.tools + 1, tool: e.tool }))
      } else {
        await update($, agents, list =>
          list.map(a => (a.id === inAgent ? { ...a, tools: a.tools + 1, tool: e.tool } : a)),
        )
      }
    } catch {
      // Progress tracking never gets in the way of a tool call.
    }

    const ran = await next(e)

    try {
      if (ran.deny === undefined && !ran.isError) {
        const made = (ran.result as { task?: { id?: unknown; subject?: unknown } } | undefined)
          ?.task
        if (e.tool === 'TaskCreate' && typeof made?.id === 'string') {
          const task: Task = {
            id: made.id,
            subject: typeof made.subject === 'string' ? made.subject : e.subject,
            activeForm: e.activeForm,
            status: 'pending',
          }
          await update($, tasks, list => [...list.filter(t => t.id !== task.id), task])
          await openOnce($)
        } else if (e.tool === 'TaskUpdate') {
          const status = e.status === 'deleted' ? undefined : e.status
          await update($, tasks, list =>
            e.status === 'deleted'
              ? list.filter(t => t.id !== e.taskId)
              : list.map(t =>
                  t.id !== e.taskId
                    ? t
                    : {
                        ...t,
                        subject: e.subject ?? t.subject,
                        activeForm: e.activeForm ?? t.activeForm,
                        status: status ?? t.status,
                      },
                ),
          )
        } else if (e.tool === 'TodoWrite') {
          await update($, tasks, () =>
            e.todos.map((todo, i) => ({
              id: `todo-${i}`,
              subject: todo.content,
              activeForm: todo.activeForm,
              status: todo.status,
            })),
          )
          await openOnce($)
        }
      }
      if (inAgent === undefined) {
        await update($, activity, a => (a.tool === e.tool ? { ...a, tool: undefined } : a))
      } else {
        await update($, agents, list =>
          list.map(a => (a.id === inAgent && a.tool === e.tool ? { ...a, tool: undefined } : a)),
        )
      }
      if (e.tool === 'Agent') await syncAgents($)
      await refreshStatus($)
    } catch {
      // Progress tracking never gets in the way of a tool call.
    }

    return ran
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const step = await read($, tick)
    if (e.props.hasSurvey || (await read($, isHidden))) return next(e)

    const p = progress(
      await read($, tasks), await read($, activity), await read($, agents),
      await $.clock.now(), step, 16,
    )
    const { Box, Button, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="row">
        <Text color={p.tone === 'done' ? 'green' : p.tone === 'busy' ? 'cyan' : undefined} dimColor={p.tone === 'idle'}>
          {p.bar}{' '}
        </Text>
        <Text>{p.label} </Text>
        <Button key="sidebar" label="Sidebar" plain onPress={async () => {
          await openPane($)
        }} />
        <Text> </Text>
        <Button key="hide" label="Hide" plain onPress={async () => {
          await update($, isHidden, () => true)
        }} />
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const step = await read($, tick)
    const { Box, Button, Text } = $.ui.resolve(e)
    const list = await read($, tasks)
    const act = await read($, activity)
    const crew = await read($, agents)
    const now = await $.clock.now()
    const isCompact = e.surface === 'mobile' || e.props.placement === 'inline'
    const width = Math.max(8, Math.min(30, (e.props.bodyColumns ?? 40) - 4))
    const p = progress(list, act, crew, now, step, width)
    const header = (
      <Box flexDirection="column">
        <Text color={p.tone === 'done' ? 'green' : p.tone === 'busy' ? 'cyan' : undefined} dimColor={p.tone === 'idle'}>
          {p.bar}
        </Text>
        <Text>{p.label}</Text>
      </Box>
    )
    const isOpen = await read($, isExpanded)

    if (isCompact && !isOpen) {
      return (
        <Box flexDirection="column">
          {header}
          {(list.length > 0 || crew.length > 0) && (
            <Button key="details" label="Details" plain onPress={async () => {
              await update($, isExpanded, () => true)
            }} />
          )}
        </Box>
      )
    }
    const done = list.filter(t => t.status === 'completed').length
    const allDone = list.length > 0 && done === list.length
    const finished = crew.filter(a => !LIVE.has(a.status)).length
    const turn = act.isWorking
      ? `Working · ${duration(now - act.startedAt)} · ${plural(act.tools, 'tool')}${act.tool ? ` · ${act.tool}` : ''}`
      : act.startedAt > 0
        ? `Idle · last turn ${duration(act.endedAt - act.startedAt)}, ${plural(act.tools, 'tool')}`
        : 'Idle'

    return (
      <Box flexDirection="column">
        {header}
        {isCompact && (
          <Button key="less" label="Less" plain onPress={async () => {
            await update($, isExpanded, () => false)
          }} />
        )}
        {!isCompact && <Text dimColor>{turn}</Text>}
        <Text> </Text>

        <Text bold>Tasks {list.length > 0 ? `${done}/${list.length}` : ''}</Text>
        {list.length === 0 && <Text dimColor>No task list yet.</Text>}
        {list.length > 0 && (
          <Text color={allDone ? 'green' : 'cyan'}>{bar(done, list.length, 20)}</Text>
        )}
        {list.map(t => (
          <Text
            key={`t:${t.id}`}
            dimColor={t.status === 'completed'}
            bold={t.status === 'in_progress'}
          >
            {t.status === 'completed' ? '✓ ' : t.status === 'in_progress' ? '▸ ' : '○ '}
            {t.status === 'in_progress' ? (t.activeForm ?? t.subject) : t.subject}
          </Text>
        ))}
        <Text> </Text>

        <Text bold>Subagents {crew.length > 0 ? `${crew.length - finished} running, ${finished} done` : ''}</Text>
        {crew.length === 0 && <Text dimColor>No subagents yet.</Text>}
        {crew.map(a => {
          const isLive = LIVE.has(a.status)
          const time = duration((isLive ? now : a.endedAt) - a.startedAt)
          const mark = isLive ? '● ' : a.status === 'completed' || a.status === 'idle' ? '✓ ' : '✗ '
          return (
            <Box key={`a:${a.id}`} flexDirection="column">
              <Text bold={isLive} color={isLive ? 'cyan' : a.status === 'failed' || a.status === 'killed' ? 'red' : undefined}>
                {mark}
                {a.description}
              </Text>
              <Text dimColor>
                {'  '}
                {a.type} · {a.status} · {plural(a.tools, 'tool')} · {time}
                {isLive && a.tool ? ` · ${a.tool}` : ''}
              </Text>
            </Box>
          )
        })}

        {(list.length > 0 || crew.length > 0) && !act.isWorking && (
          <Box flexDirection="row">
            <Text> </Text>
            <Button key="clear" label="Clear finished" plain onPress={async () => {
              await update($, tasks, l => (l.every(t => t.status === 'completed') ? [] : l))
              await update($, agents, l => l.filter(a => LIVE.has(a.status)))
              await refreshStatus($)
            }} />
          </Box>
        )}
      </Box>
    )
  })

  on('command.run', { command: 'progress' }, async ($, e) => {
    const isReset = e.args.trim() === 'reset'
    if (isReset) {
      await update($, tasks, () => [])
      await update($, agents, () => [])
      await update($, activity, () => IDLE)
    }
    await update($, isHidden, () => false)
    await openPane($)
    await refreshStatus($)

    return { text: isReset ? 'Progress reset.' : 'Progress sidebar opened.' }
  })
}
