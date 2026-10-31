export type McpStatus = 'untested'|'online'|'offline';

// Only a real challenge or submission probe may change the displayed status.
export function challengeStatus(previous:McpStatus, outcome:'connected'|'unreachable'|'not_checked'):McpStatus {
  if (outcome === 'not_checked') return previous;
  return outcome === 'connected' ? 'online' : 'offline';
}

export function challengeLabel(status:McpStatus):string {
  return status === 'online' ? '可对战' : status === 'offline' ? 'MCP 离线' : '尚未检测';
}
