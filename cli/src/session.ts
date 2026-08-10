export interface CliSession {
  novelId: string | null;
  novelTitle: string | null;
  directorTaskId: string | null;
  creativeHubThreadId: string | null;
}

export function createSession(): CliSession {
  return {
    novelId: null,
    novelTitle: null,
    directorTaskId: null,
    creativeHubThreadId: null,
  };
}

export function describeSession(session: CliSession): string {
  const novel = session.novelTitle
    ? `${session.novelTitle} (${shortId(session.novelId)})`
    : "未选择";
  const task = session.directorTaskId ? shortId(session.directorTaskId) : "无";
  return `当前小说：${novel}  |  导演任务：${task}`;
}

export function shortId(value: string | null | undefined): string {
  if (!value) {
    return "-";
  }
  return value.length <= 10 ? value : `${value.slice(0, 8)}…`;
}
