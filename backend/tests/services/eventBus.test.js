// eventBus is a singleton (module-level EventEmitter instance), so each test
// registers its own uniquely-named event to avoid leaking listeners between
// tests in this file.
const eventBus = require("../../services/eventBus");

function flush() {
  // emit() schedules listeners with setImmediate — give the event loop one
  // tick to run them before asserting.
  return new Promise((resolve) => setImmediate(resolve));
}

describe("eventBus", () => {
  test("delivers the payload to a registered listener", async () => {
    const received = [];
    eventBus.on("test.basic", (payload) => received.push(payload));

    eventBus.emit("test.basic", { hello: "world" });
    await flush();

    expect(received).toEqual([{ hello: "world" }]);
  });

  test("a throwing listener does not stop other listeners or throw synchronously", async () => {
    const received = [];
    eventBus.on("test.throwing", () => {
      throw new Error("boom");
    });
    eventBus.on("test.throwing", (payload) => received.push(payload));

    expect(() => eventBus.emit("test.throwing", { ok: true })).not.toThrow();
    await flush();

    expect(received).toEqual([{ ok: true }]);
  });

  test("emitting with no listeners is a safe no-op", () => {
    expect(() => eventBus.emit("test.nobody-listening", {})).not.toThrow();
  });
});
