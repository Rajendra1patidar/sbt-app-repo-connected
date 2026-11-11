const crypto = require("crypto");
const { buildZip, readZip, crc32 } = require("../../utils/zip");

describe("buildZip / readZip", () => {
  test("round-trips compressible and incompressible files", () => {
    const text = Buffer.from("hello backup ".repeat(400));
    const noise = crypto.randomBytes(500);
    const entries = readZip(buildZip([{ name: "a.txt", data: text }, { name: "b.bin", data: noise }]));

    expect(entries.map((e) => e.name)).toEqual(["a.txt", "b.bin"]);
    expect(entries[0].data.equals(text)).toBe(true);
    expect(entries[1].data.equals(noise)).toBe(true);
  });

  test("handles an empty file", () => {
    const entries = readZip(buildZip([{ name: "empty.txt", data: Buffer.alloc(0) }]));
    expect(entries[0].data.length).toBe(0);
  });

  test("detects a damaged archive instead of returning bad data", () => {
    const zip = Buffer.from(buildZip([{ name: "a.txt", data: Buffer.from("hello ".repeat(100)) }]));
    zip[45] ^= 1;
    expect(() => readZip(zip)).toThrow();
  });

  test("rejects something that is not a ZIP", () => {
    expect(() => readZip(Buffer.from("this is definitely not a zip archive"))).toThrow("Not a ZIP file");
    expect(() => readZip(Buffer.alloc(3))).toThrow("Not a ZIP file");
  });

  test("crc32 matches the well-known check value", () => {
    expect(crc32(Buffer.from("123456789"))).toBe(0xcbf43926);
  });
});
