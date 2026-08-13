const test = require("node:test");
const assert = require("node:assert/strict");

const { LlmLiveBroker } = require("../dist/platform/llm/live/LlmLiveBroker.js");

test("LLM 实况会话按任务发布片段并保留最新快照", () => {
  const broker = new LlmLiveBroker();
  const taskOneEvents = [];
  const taskTwoEvents = [];
  const stopOne = broker.subscribe({ taskId: "task-1" }, (event) => taskOneEvents.push(event));
  const stopTwo = broker.subscribe({ taskId: "task-2" }, (event) => taskTwoEvents.push(event));

  const session = broker.begin({
    label: "章节正文",
    mode: "text",
    taskId: "task-1",
  });
  session.phase("streaming", "模型正在返回内容");
  session.delta("第一段");
  session.delta("第二段");
  session.complete();

  stopOne();
  stopTwo();

  assert.equal(taskTwoEvents.length, 0);
  assert.deepEqual(
    taskOneEvents.map((event) => event.type),
    ["session_started", "phase_changed", "output_delta", "output_delta", "phase_changed", "session_completed"],
  );
  assert.deepEqual(
    taskOneEvents.map((event) => event.seq),
    [1, 2, 3, 4, 5, 6],
  );
  const [snapshot] = broker.getSnapshots({ taskId: "task-1" });
  assert.equal(snapshot.preview, "第一段第二段");
  assert.equal(snapshot.totalChars, 6);
  assert.equal(snapshot.phase, "completed");
});

test("LLM 实况会话支持用户中断并 abort signal", () => {
  const broker = new LlmLiveBroker();
  const events = [];
  const stop = broker.subscribe({}, (event) => events.push(event));

  const session = broker.begin({
    label: "大纲生成",
    mode: "structured",
    taskId: "task-cancel",
  });
  session.phase("streaming", "模型正在返回内容");
  assert.equal(session.signal?.aborted, false);

  const cancelled = broker.requestCancel(session.interactionId);
  assert.equal(cancelled, true);
  assert.equal(session.signal?.aborted, true);
  assert.equal(session.isCancelled(), true);
  assert.equal(broker.requestCancel(session.interactionId), false);

  stop();
  assert.ok(events.some((event) => event.type === "session_cancelled"));
  const [snapshot] = broker.getSnapshots({ taskId: "task-cancel" });
  assert.equal(snapshot.phase, "cancelled");
});
