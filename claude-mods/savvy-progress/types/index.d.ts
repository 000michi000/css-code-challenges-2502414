export type TaskStatus = 'pending' | 'in_progress' | 'completed'
export type Task = { id: string; subject: string; activeForm?: string; status: TaskStatus }
export type Activity = {
  isWorking: boolean
  startedAt: number
  endedAt: number
  tools: number
  tool?: string
}
export type AgentRow = {
  id: string
  description: string
  type: string
  status: string
  startedAt: number
  endedAt: number
  tools: number
  tool?: string
}

declare module 'claude-code' {
  interface PluginState {
    'savvy-progress': {
      tasks: Shaped<Task[]>
      activity: Shaped<Activity>
      agents: Shaped<AgentRow[]>
      tick: number
      isHidden: boolean
      isExpanded: boolean
    }
  }
}
