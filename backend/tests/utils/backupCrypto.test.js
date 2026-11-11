const {
  encryptBackup,
  decryptBackup,
  isEncryptedBackup,
  passphraseProblem,
  getPassphrase,
  HEADER_LEN,
} = require("../../utils/backupCrypto");

const PASS = "correct horse battery";
const ORIGINAL_ENV = process.env;

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

describe("encryptBackup / decryptBackup", () => {
  test("round-trips the data with the right passphrase", () => {
    const plain = Buffer.from("customers, items and payments ".repeat(500));
    const file = encryptBackup(plain, PASS);
    expect(decryptBackup(file, PASS).equals(plain)).toBe(true);
  });

  test("the file is recognisably a backup and does not contain the plain text", () => {
    const file = encryptBackup(Buffer.from("Ramesh Patel owes 12400"), PASS);
    expect(isEncryptedBackup(file)).toBe(true);
    expect(file.toString("latin1")).not.toContain("Ramesh");
  });

  test("two backups of the same data are different files (fresh salt and IV each time)", () => {
    const plain = Buffer.from("same data");
    expect(encryptBackup(plain, PASS).equals(encryptBackup(plain, PASS))).toBe(false);
  });

  test("a wrong passphrase is refused with a clear code", () => {
    const file = encryptBackup(Buffer.from("secret"), PASS);
    let error;
    try {
      decryptBackup(file, "some other phrase");
    } catch (e) {
      error = e;
    }
    expect(error.code).toBe("BAD_PASSPHRASE");
  });

  test("a damaged file is refused, even if only one byte changed", () => {
    const file = encryptBackup(Buffer.from("secret data here"), PASS);
    const damaged = Buffer.from(file);
    damaged[HEADER_LEN + 2] ^= 1;
    expect(() => decryptBackup(damaged, PASS)).toThrow("passphrase is wrong, or the file is damaged");
  });

  test("changing a header byte is also detected", () => {
    const file = encryptBackup(Buffer.from("secret data here"), PASS);
    const damaged = Buffer.from(file);
    damaged[10] ^= 1; // inside the salt
    expect(() => decryptBackup(damaged, PASS)).toThrow();
  });

  test("something that is not a backup is reported as such", () => {
    let error;
    try {
      decryptBackup(Buffer.from("just some text file, nothing to see"), PASS);
    } catch (e) {
      error = e;
    }
    expect(error.code).toBe("NOT_A_BACKUP");
    expect(isEncryptedBackup(Buffer.from("PK\u0003\u0004"))).toBe(false);
  });

  test("a file from a newer format version is not silently misread", () => {
    const file = Buffer.from(encryptBackup(Buffer.from("x"), PASS));
    file[5] = 9;
    let error;
    try {
      decryptBackup(file, PASS);
    } catch (e) {
      error = e;
    }
    expect(error.code).toBe("UNSUPPORTED_VERSION");
  });

  test("refuses to encrypt with a missing or very short passphrase", () => {
    expect(() => encryptBackup(Buffer.from("x"), "")).toThrow("BACKUP_PASSPHRASE is not set");
    expect(() => encryptBackup(Buffer.from("x"), "short")).toThrow("too short");
  });
});

describe("passphraseProblem / getPassphrase", () => {
  test("describes what is wrong in plain words, or returns null", () => {
    expect(passphraseProblem("")).toContain("not set");
    expect(passphraseProblem(undefined)).toContain("not set");
    expect(passphraseProblem("1234567")).toContain("too short");
    expect(passphraseProblem("12345678")).toBeNull();
  });

  test("reads the passphrase exactly as set (no trimming)", () => {
    process.env = { ...ORIGINAL_ENV, BACKUP_PASSPHRASE: "  spaced out phrase  " };
    expect(getPassphrase()).toBe("  spaced out phrase  ");
    delete process.env.BACKUP_PASSPHRASE;
    expect(getPassphrase()).toBe("");
  });
});
