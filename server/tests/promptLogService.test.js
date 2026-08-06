const test = require("node:test");
const assert = require("node:assert/strict");

const {
  PromptLogService,
  prepareMessagesPayload,
} = require("../dist/platform/llm/promptLog/PromptLogService.js");

function createMemoryStore(seed = []) {
  const rows = [...seed];
  let seq = 1;
  return {
    rows,
    async create({ data }) {
      const row = {
        id: `log-${seq++}`,
        createdAt: new Date(),
        ...data,
      };
      rows.unshift(row);
      return row;
    },
    async findMany({ where = {}, orderBy, skip = 0, take, select } = {}) {
      let filtered = rows.filter((row) => matchWhere(row, where));
      if (orderBy?.createdAt === "desc") {
        filtered = [...filtered].sort((a, b) => b.createdAt - a.createdAt);
      }
      if (orderBy?.createdAt === "asc") {
        filtered = [...filtered].sort((a, b) => a.createdAt - b.createdAt);
      }
      const sliced = filtered.slice(skip, take == null ? undefined : skip + take);
      if (select?.id && !select.messagesJson) {
        return sliced.map((row) => ({ id: row.id }));
      }
      return sliced;
    },
    async findFirst({ where }) {
      return rows.find((row) => row.id === where.id) ?? null;
    },
    async count({ where = {} } = {}) {
      return rows.filter((row) => matchWhere(row, where)).length;
    },
    async deleteMany({ where = {} } = {}) {
      const before = rows.length;
      const keep = [];
      for (const row of rows) {
        if (!matchWhere(row, where)) {
          keep.push(row);
        }
      }
      rows.length = 0;
      rows.push(...keep);
      return { count: before - rows.length };
    },
  };
}

function matchWhere(row, where) {
  if (!where || Object.keys(where).length === 0) {
    return true;
  }
  if (where.id?.in) {
    return where.id.in.includes(row.id);
  }
  if (where.id?.notIn) {
    return !where.id.notIn.includes(row.id);
  }
  if (where.id && typeof where.id === "string") {
    return row.id === where.id;
  }
  if (where.provider && row.provider !== where.provider) {
    return false;
  }
  return true;
}

function createSettingsService(initial = { enabled: true, retentionCount: 3 }) {
  let settings = { ...initial };
  return {
    async getSettings() {
      return { ...settings };
    },
    async saveSettings(input) {
      settings = {
        enabled: input.enabled === undefined ? settings.enabled : Boolean(input.enabled),
        retentionCount: input.retentionCount === undefined ? settings.retentionCount : input.retentionCount,
      };
      return { ...settings };
    },
  };
}

test("prepareMessagesPayload truncates oversized prompts", () => {
  const huge = "x".repeat(600 * 1024);
  const prepared = prepareMessagesPayload([{ role: "user", content: huge }], 1024);
  assert.equal(prepared.truncated, true);
  assert.ok(prepared.messagesJson.length <= 1024 + 128);
  assert.equal(prepared.messageCount, 1);
});

test("PromptLogService skips writes when disabled", async () => {
  const store = createMemoryStore();
  const service = new PromptLogService({
    store,
    settingsService: createSettingsService({ enabled: false, retentionCount: 10 }),
  });

  service.recordRequest({
    requestId: "req-1",
    provider: "openai",
    model: "gpt-test",
    method: "invoke",
    messages: [{ role: "user", content: "hello" }],
  });
  await service.flushPendingWrites();

  assert.equal(store.rows.length, 0);
});

test("PromptLogService persists request prompts and prunes by retention", async () => {
  const store = createMemoryStore();
  const service = new PromptLogService({
    store,
    settingsService: createSettingsService({ enabled: true, retentionCount: 2 }),
  });

  for (let index = 1; index <= 3; index += 1) {
    service.recordRequest({
      requestId: `req-${index}`,
      provider: "openai",
      model: "gpt-test",
      method: "invoke",
      promptAssetKey: `prompt.${index}`,
      messages: [{ role: "user", content: `message-${index}` }],
    });
  }
  await service.flushPendingWrites();

  assert.equal(store.rows.length, 2);
  const listed = await service.list({ page: 1, pageSize: 10 });
  assert.equal(listed.total, 2);
  assert.equal(listed.items[0].requestId, "req-3");
  assert.equal(listed.items[1].requestId, "req-2");

  const detail = await service.getById(listed.items[0].id);
  assert.ok(detail);
  assert.deepEqual(detail.messages, [{ role: "user", content: "message-3" }]);

  const exported = await service.exportRecords({});
  assert.equal(exported.length, 2);
  assert.ok(exported[0].messages);

  const cleared = await service.clear({});
  assert.equal(cleared.deletedCount, 2);
  assert.equal(store.rows.length, 0);
});
