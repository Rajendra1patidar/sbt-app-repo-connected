const zlib = require("zlib");

// Minimal single/multi-file ZIP writer and reader using only Node's built-in
// zlib (deflateRawSync / inflateRawSync) — no new npm dependency for what is
// otherwise a one-file backup attachment. The reader only has to understand
// archives this file wrote (plus any ordinary ZIP without ZIP64 or encryption),
// which is all the restore script needs to unwrap an emailed backup.
//
// Why this exists: Brevo's transactional email API validates attachments
// by file extension against an allow-list, and ".gz" isn't on it (see
// mailer.js's Brevo error: "Unsupported file format: gz"). ".zip" is
// allowed, so backupJob's gzip buffer is repackaged as a proper ZIP
// container instead of switching backup transports entirely.

// Standard reflected CRC-32 (zlib polynomial), table-based.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Builds a ZIP archive (store-or-deflate, no encryption, no ZIP64 —
 * fine for the small single-file backups this is used for) from a list
 * of { name, data: Buffer } entries.
 */
function buildZip(files) {
  const localChunks = [];
  const centralChunks = [];
  let offset = 0;

  for (const { name, data } of files) {
    const nameBuf = Buffer.from(name, "utf8");
    const crc = crc32(data);
    const compressed = zlib.deflateRawSync(data);
    // Only use the deflated bytes if they're actually smaller; otherwise
    // store raw, which keeps this correct even for incompressible input.
    const useStore = compressed.length >= data.length;
    const method = useStore ? 0 : 8;
    const payload = useStore ? data : compressed;

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0, 6); // flags
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt16LE(0, 10); // mod time
    localHeader.writeUInt16LE(0, 12); // mod date
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(payload.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28); // extra length

    localChunks.push(localHeader, nameBuf, payload);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4); // version made by
    centralHeader.writeUInt16LE(20, 6); // version needed
    centralHeader.writeUInt16LE(0, 8); // flags
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt16LE(0, 12); // mod time
    centralHeader.writeUInt16LE(0, 14); // mod date
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(payload.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30); // extra length
    centralHeader.writeUInt16LE(0, 32); // comment length
    centralHeader.writeUInt16LE(0, 34); // disk number start
    centralHeader.writeUInt16LE(0, 36); // internal attrs
    centralHeader.writeUInt32LE(0, 38); // external attrs
    centralHeader.writeUInt32LE(offset, 42); // local header offset

    centralChunks.push(centralHeader, nameBuf);

    offset += localHeader.length + nameBuf.length + payload.length;
  }

  const centralDirStart = offset;
  const centralDir = Buffer.concat(centralChunks);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4); // disk number
  end.writeUInt16LE(0, 6); // disk with central dir
  end.writeUInt16LE(files.length, 8); // entries on this disk
  end.writeUInt16LE(files.length, 10); // total entries
  end.writeUInt32LE(centralDir.length, 12); // size of central dir
  end.writeUInt32LE(centralDirStart, 16); // offset of central dir

  return Buffer.concat([...localChunks, centralDir, end]);
}


/**
 * Reads a ZIP archive (stored or deflated entries, no encryption, no ZIP64)
 * into a list of { name, data: Buffer }. Directory entries are skipped. Every
 * entry's CRC-32 is checked, so a damaged download is reported instead of
 * silently restoring bad data.
 */
function readZip(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 22) throw new Error("Not a ZIP file");

  // The end-of-central-directory record sits at the very end (followed only by an optional comment).
  const lowest = Math.max(0, buf.length - 22 - 0xffff);
  let end = -1;
  for (let i = buf.length - 22; i >= lowest; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error("Not a ZIP file");

  const entryCount = buf.readUInt16LE(end + 10);
  let pos = buf.readUInt32LE(end + 16);
  const out = [];

  for (let n = 0; n < entryCount; n++) {
    if (pos + 46 > buf.length || buf.readUInt32LE(pos) !== 0x02014b50) throw new Error("Damaged ZIP directory");
    const method = buf.readUInt16LE(pos + 10);
    const crc = buf.readUInt32LE(pos + 16);
    const compressedSize = buf.readUInt32LE(pos + 20);
    const nameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    const localOffset = buf.readUInt32LE(pos + 42);
    const name = buf.toString("utf8", pos + 46, pos + 46 + nameLen);
    pos += 46 + nameLen + extraLen + commentLen;

    if (name.endsWith("/")) continue; // a folder, nothing to extract

    if (localOffset + 30 > buf.length || buf.readUInt32LE(localOffset) !== 0x04034b50) {
      throw new Error("Damaged ZIP entry");
    }
    const dataStart = localOffset + 30 + buf.readUInt16LE(localOffset + 26) + buf.readUInt16LE(localOffset + 28);
    const raw = buf.subarray(dataStart, dataStart + compressedSize);

    let data;
    if (method === 0) data = Buffer.from(raw);
    else if (method === 8) data = zlib.inflateRawSync(raw);
    else throw new Error(`Unsupported ZIP compression method ${method}`);

    if (crc32(data) !== crc) throw new Error(`ZIP entry "${name}" is damaged (checksum mismatch)`);
    out.push({ name, data });
  }
  return out;
}

module.exports = { buildZip, readZip, crc32 };
