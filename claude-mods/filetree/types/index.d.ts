export type ExpandedDirs = string[]

declare module 'claude-code' {
  interface PluginState {
    filetree: { expanded: Shaped<ExpandedDirs>; version: number }
  }
}
