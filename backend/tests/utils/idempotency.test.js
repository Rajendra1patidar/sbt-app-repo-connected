// The model is replaced with a small in-memory stand-in that behaves like a
// collection with a unique {owner,key} index.
jest.mock("../../models/IdempotencyKey", () => {
  const rows = new Map();
  const k = (o, key) => `${o}|${key}`;
  const dup = () => Object.assign(new Error("E11000 duplicate key"), { code: 11000 });
  return {
    __rows: rows,
    create: jest.fn(async (doc) => {
      if (rows.has(k(doc.owner, doc.key))) throw dup();
      rows.set(k(doc.owner, doc.key), { createdAt: new Date(), ...doc });
    }),
    findOne: jest.fn((q) => ({ lean: async () => rows.get(k(q.owner, q.key)) || null })),
    updateOne: jest.fn(async (q, upd) => {
      const row = rows.get(k(q.owner, q.key));
      if (row) Object.assign(row, upd.$set);
    }),
    deleteOne: jest.fn(async (q) => {
      const row = rows.get(k(q.owner, q.key));
      if (row && (!q.state || row.state === q.state)) rows.delete(k(q.owner, q.key));
    }),
  };
});

const IdempotencyKey = require("../../models/IdempotencyKey");
const idempotency = require("../../utils/idempotency");

beforeEach(() => {
  IdempotencyKey.__rows.clear();
  jest.clearAllMocks();
});

describe("idempotency.begin", () => {
  test("no key (or a silly one) means no protection and no database traffic", async () => {
    const a = await idempotency.begin("o1", undefined);
    const b = await idempotency.begin("o1", "x".repeat(300));
    expect(a.replay).toBe(false);
    expect(b.replay).toBe(false);
    expect(IdempotencyKey.create).not.toHaveBeenCalled();
  });

  test("the first request with a key reserves it and carries on", async () => {
    const h = await idempotency.begin("o1", "key-1");
    expect(h.replay).toBe(false);
    expect(h.inProgress).toBe(false);
    expect(IdempotencyKey.__rows.get("o1|key-1").state).toBe("pending");
  });

  test("after finish(), the same key replays the stored response - also on a later retry", async () => {
    const first = await idempotency.begin("o1", "key-2");
    await first.finish({ doc: { _id: "d1", number: "EST-0001" }, lowStock: [] });
    const retry = await idempotency.begin("o1", "key-2");
    expect(retry.replay).toBe(true);
    expect(retry.response).toEqual({ doc: { _id: "d1", number: "EST-0001" }, lowStock: [] });
  });

  test("keys are per owner: another business's identical key is unrelated", async () => {
    await (await idempotency.begin("o1", "same")).finish({ ok: 1 });
    const other = await idempotency.begin("o2", "same");
    expect(other.replay).toBe(false);
  });

  test("abort() releases the key so a failed save can be retried for real", async () => {
    const first = await idempotency.begin("o1", "key-3");
    await first.abort();
    const retry = await idempotency.begin("o1", "key-3");
    expect(retry.replay).toBe(false);
    expect(retry.inProgress).toBe(false);
  });

  test("abort() after finish() does not delete the stored result", async () => {
    const first = await idempotency.begin("o1", "key-4");
    await first.finish({ ok: true });
    await first.abort();
    expect((await idempotency.begin("o1", "key-4")).replay).toBe(true);
  });

  test("a duplicate that arrives while the first is still running waits, then gets its result", async () => {
    const first = await idempotency.begin("o1", "key-5");
    setTimeout(() => first.finish({ done: "yes" }), 400);
    const second = await idempotency.begin("o1", "key-5");
    expect(second.replay).toBe(true);
    expect(second.response).toEqual({ done: "yes" });
  });

  test("a pending reservation left by a crashed request is taken over after 2 minutes", async () => {
    IdempotencyKey.__rows.set("o1|key-6", { owner: "o1", key: "key-6", state: "pending", createdAt: new Date(Date.now() - 3 * 60 * 1000) });
    const h = await idempotency.begin("o1", "key-6");
    expect(h.replay).toBe(false);
    expect(h.inProgress).toBe(false);
  });

  test("if the key store itself is down, the save goes ahead unprotected instead of failing", async () => {
    IdempotencyKey.create.mockRejectedValueOnce(new Error("connection lost"));
    const h = await idempotency.begin("o1", "key-7");
    expect(h.replay).toBe(false);
    expect(h.inProgress).toBe(false);
    await expect(h.finish({ x: 1 })).resolves.toBeUndefined();
  });
});
