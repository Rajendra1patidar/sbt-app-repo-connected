const crypto = require("crypto");

// Password-based encryption for database backups, using only Node's built-in
// crypto (no new dependency): scrypt turns BACKUP_PASSPHRASE into a 256-bit key,
// AES-256-GCM encrypts and authenticates the data. A wrong passphrase or a
// damaged/tampered file is detected on decrypt instead of producing garbage.
//
// File layout (everything needed to decrypt except the passphrase is in the header):
//   0   5 bytes  "SBTBK"      magic, so we can tell a backup from any other file
//   5   1 byte   version      1
//   6   1 byte   scrypt log2(N)
//   7   1 byte   scrypt r
//   8   1 byte   scrypt p
//   9   16 bytes random salt
//   25  12 bytes random IV
//   37  ...      ciphertext
//   end 16 bytes GCM authentication tag
// The header is also fed to GCM as "additional authenticated data", so changing
// any header byte makes decryption fail.

const MAGIC = Buffer.from("SBTBK", "ascii");
const VERSION = 1;
const LOG_N = 15; // N = 32768: ~0.1s and 32 MB per key derivation, plenty for a passphrase
const R = 8;
const P = 1;
const SALT_LEN = 16;
const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_LEN = 32;
const HEADER_LEN = MAGIC.length + 4 + SALT_LEN + IV_LEN; // 37
const MIN_PASSPHRASE_LENGTH = 8;

function deriveKey(passphrase, salt, logN, r, p) {
  const N = 2 ** logN;
  // scrypt needs about 128 * N * r bytes of memory; Node's default cap (32 MB) is
  // just below what N = 32768, r = 8 needs, so state the limit explicitly.
  return crypto.scryptSync(passphrase, salt, KEY_LEN, { N, r, p, maxmem: 128 * N * r * 2 });
}

/** Returns a plain-words problem with the passphrase, or null when it is usable. */
function passphraseProblem(passphrase) {
  if (!passphrase) return "BACKUP_PASSPHRASE is not set";
  if (String(passphrase).length < MIN_PASSPHRASE_LENGTH) {
    return `BACKUP_PASSPHRASE is too short (use at least ${MIN_PASSPHRASE_LENGTH} characters)`;
  }
  return null;
}

/** The passphrase from the environment, exactly as set (never trimmed or altered). */
function getPassphrase() {
  return process.env.BACKUP_PASSPHRASE || "";
}

function encryptBackup(plain, passphrase) {
  const problem = passphraseProblem(passphrase);
  if (problem) throw new Error(problem);

  const salt = crypto.randomBytes(SALT_LEN);
  const iv = crypto.randomBytes(IV_LEN);
  const header = Buffer.concat([MAGIC, Buffer.from([VERSION, LOG_N, R, P]), salt, iv]);
  const key = deriveKey(String(passphrase), salt, LOG_N, R, P);

  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_LEN });
  cipher.setAAD(header);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([header, body, cipher.getAuthTag()]);
}

function isEncryptedBackup(buf) {
  return Buffer.isBuffer(buf) && buf.length >= MAGIC.length && buf.subarray(0, MAGIC.length).equals(MAGIC);
}

function decryptBackup(file, passphrase) {
  if (!isEncryptedBackup(file) || file.length < HEADER_LEN + TAG_LEN) {
    const err = new Error("This is not an SBT backup file (or it is cut short).");
    err.code = "NOT_A_BACKUP";
    throw err;
  }
  const version = file[MAGIC.length];
  if (version !== VERSION) {
    const err = new Error(`This backup was made by a newer version of the app (format ${version}).`);
    err.code = "UNSUPPORTED_VERSION";
    throw err;
  }
  const logN = file[MAGIC.length + 1];
  const r = file[MAGIC.length + 2];
  const p = file[MAGIC.length + 3];
  // Refuse absurd work factors so a doctored file cannot make the machine run out of memory.
  if (logN < 10 || logN > 20 || r < 1 || r > 16 || p < 1 || p > 4) {
    const err = new Error("This backup file's header is damaged.");
    err.code = "NOT_A_BACKUP";
    throw err;
  }

  const header = file.subarray(0, HEADER_LEN);
  const salt = file.subarray(MAGIC.length + 4, MAGIC.length + 4 + SALT_LEN);
  const iv = file.subarray(MAGIC.length + 4 + SALT_LEN, HEADER_LEN);
  const tag = file.subarray(file.length - TAG_LEN);
  const body = file.subarray(HEADER_LEN, file.length - TAG_LEN);

  try {
    const key = deriveKey(String(passphrase || ""), salt, logN, r, p);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_LEN });
    decipher.setAAD(header);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]);
  } catch (cause) {
    const err = new Error("Could not open the backup: the passphrase is wrong, or the file is damaged.");
    err.code = "BAD_PASSPHRASE";
    throw err;
  }
}

module.exports = {
  encryptBackup,
  decryptBackup,
  isEncryptedBackup,
  passphraseProblem,
  getPassphrase,
  MIN_PASSPHRASE_LENGTH,
  HEADER_LEN,
  TAG_LEN,
};
