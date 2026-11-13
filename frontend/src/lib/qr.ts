/**
 * A small, dependency-free QR Code generator (byte mode, versions 1–12, error
 * correction L/M/Q/H). It exists so a UPI payment QR can be drawn on a bill
 * without adding a package. Algorithm after Project Nayuki's QR Code generator
 * (MIT licence): Reed–Solomon over GF(256), the eight mask patterns and the
 * standard penalty scoring.
 */

export type Ecc = "L" | "M" | "Q" | "H";
export interface QrMatrix { size: number; version: number; modules: boolean[][] }

const ECC_INDEX: Record<Ecc, number> = { L: 0, M: 1, Q: 2, H: 3 };
const ECC_FORMAT_BITS: Record<Ecc, number> = { L: 1, M: 0, Q: 3, H: 2 };
const MAX_VERSION = 12;

// Index [ecc][version]; index 0 of each row is padding.
const ECC_CODEWORDS_PER_BLOCK = [
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24],
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22],
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26],
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28],
];
const NUM_ERROR_CORRECTION_BLOCKS = [
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4],
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8],
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10],
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11],
];

const PENALTY_N1 = 3;
const PENALTY_N2 = 3;
const PENALTY_N3 = 40;
const PENALTY_N4 = 10;

const getBit = (x: number, i: number) => ((x >>> i) & 1) !== 0;

function numRawDataModules(ver: number): number {
  let result = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const numAlign = Math.floor(ver / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (ver >= 7) result -= 36;
  }
  return result;
}

function numDataCodewords(ver: number, ecc: Ecc): number {
  const e = ECC_INDEX[ecc];
  return Math.floor(numRawDataModules(ver) / 8) - ECC_CODEWORDS_PER_BLOCK[e][ver] * NUM_ERROR_CORRECTION_BLOCKS[e][ver];
}

function alignmentPositions(ver: number): number[] {
  if (ver === 1) return [];
  const numAlign = Math.floor(ver / 7) + 2;
  const step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (numAlign * 2 - 2)) * 2;
  const result = [6];
  for (let pos = ver * 4 + 10; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
  return result;
}

/* ---- Reed–Solomon over GF(2^8) / 0x11D ---- */

function rsMultiply(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

function rsDivisor(degree: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < degree - 1; i++) result.push(0);
  result.push(1);
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = rsMultiply(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = rsMultiply(root, 0x02);
  }
  return result;
}

function rsRemainder(data: number[], divisor: number[]): number[] {
  const result = divisor.map(() => 0);
  for (const b of data) {
    const factor = b ^ (result.shift() as number);
    result.push(0);
    divisor.forEach((coef, i) => { result[i] ^= rsMultiply(coef, factor); });
  }
  return result;
}

function addEccAndInterleave(data: number[], ver: number, ecc: Ecc): number[] {
  const e = ECC_INDEX[ecc];
  const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[e][ver];
  const blockEccLen = ECC_CODEWORDS_PER_BLOCK[e][ver];
  const rawCodewords = Math.floor(numRawDataModules(ver) / 8);
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
  const shortBlockLen = Math.floor(rawCodewords / numBlocks);

  const blocks: number[][] = [];
  const div = rsDivisor(blockEccLen);
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const dat = data.slice(k, k + shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1));
    k += dat.length;
    const ec = rsRemainder(dat, div);
    if (i < numShortBlocks) dat.push(0);
    blocks.push(dat.concat(ec));
  }
  const result: number[] = [];
  for (let i = 0; i < blocks[0].length; i++) {
    blocks.forEach((block, j) => {
      if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) result.push(block[i]);
    });
  }
  return result;
}

/* ---- the matrix ---- */

class Builder {
  readonly size: number;
  readonly modules: boolean[][];
  private readonly isFunction: boolean[][];

  constructor(private readonly ver: number, private readonly ecc: Ecc, dataCodewords: number[]) {
    this.size = ver * 4 + 17;
    this.modules = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false));
    this.isFunction = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false));

    this.drawFunctionPatterns();
    this.drawCodewords(addEccAndInterleave(dataCodewords, ver, ecc));

    let best = 0;
    let minPenalty = Infinity;
    for (let m = 0; m < 8; m++) {
      this.applyMask(m);
      this.drawFormatBits(m);
      const p = this.penalty();
      if (p < minPenalty) { best = m; minPenalty = p; }
      this.applyMask(m); // XOR again to undo
    }
    this.applyMask(best);
    this.drawFormatBits(best);
  }

  private setFn(x: number, y: number, dark: boolean) { this.modules[y][x] = dark; this.isFunction[y][x] = true; }

  private drawFunctionPatterns() {
    const size = this.size;
    for (let i = 0; i < size; i++) { this.setFn(6, i, i % 2 === 0); this.setFn(i, 6, i % 2 === 0); }
    this.drawFinder(3, 3); this.drawFinder(size - 4, 3); this.drawFinder(3, size - 4);
    const pos = alignmentPositions(this.ver);
    const n = pos.length;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
        this.drawAlignment(pos[i], pos[j]);
      }
    }
    this.drawFormatBits(0);
    this.drawVersion();
  }

  private drawFormatBits(mask: number) {
    const size = this.size;
    const data = (ECC_FORMAT_BITS[this.ecc] << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;
    for (let i = 0; i <= 5; i++) this.setFn(8, i, getBit(bits, i));
    this.setFn(8, 7, getBit(bits, 6));
    this.setFn(8, 8, getBit(bits, 7));
    this.setFn(7, 8, getBit(bits, 8));
    for (let i = 9; i < 15; i++) this.setFn(14 - i, 8, getBit(bits, i));
    for (let i = 0; i < 8; i++) this.setFn(size - 1 - i, 8, getBit(bits, i));
    for (let i = 8; i < 15; i++) this.setFn(8, size - 15 + i, getBit(bits, i));
    this.setFn(8, size - 8, true);
  }

  private drawVersion() {
    if (this.ver < 7) return;
    let rem = this.ver;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (this.ver << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const color = getBit(bits, i);
      const a = this.size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      this.setFn(a, b, color);
      this.setFn(b, a, color);
    }
  }

  private drawFinder(x: number, y: number) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && xx < this.size && yy >= 0 && yy < this.size) this.setFn(xx, yy, dist !== 2 && dist !== 4);
      }
    }
  }

  private drawAlignment(x: number, y: number) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) this.setFn(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }

  private drawCodewords(data: number[]) {
    const size = this.size;
    let i = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? size - 1 - vert : vert;
          if (!this.isFunction[y][x] && i < data.length * 8) {
            this.modules[y][x] = getBit(data[i >>> 3], 7 - (i & 7));
            i++;
          }
        }
      }
    }
  }

  private applyMask(mask: number) {
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        let invert: boolean;
        switch (mask) {
          case 0: invert = (x + y) % 2 === 0; break;
          case 1: invert = y % 2 === 0; break;
          case 2: invert = x % 3 === 0; break;
          case 3: invert = (x + y) % 3 === 0; break;
          case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: invert = ((x * y) % 2) + ((x * y) % 3) === 0; break;
          case 6: invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
          default: invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0; break;
        }
        if (!this.isFunction[y][x] && invert) this.modules[y][x] = !this.modules[y][x];
      }
    }
  }

  private penalty(): number {
    const size = this.size;
    const m = this.modules;
    let result = 0;

    const countPatterns = (h: number[]) => {
      const n = h[1];
      const core = n > 0 && h[2] === n && h[3] === n * 3 && h[4] === n && h[5] === n;
      return (core && h[0] >= n * 4 && h[6] >= n ? 1 : 0) + (core && h[6] >= n * 4 && h[0] >= n ? 1 : 0);
    };
    const addHistory = (len: number, h: number[]) => {
      if (h[0] === 0) len += size;
      h.pop();
      h.unshift(len);
    };
    const terminateAndCount = (color: boolean, len: number, h: number[]) => {
      if (color) { addHistory(len, h); len = 0; }
      len += size;
      addHistory(len, h);
      return countPatterns(h);
    };

    for (let y = 0; y < size; y++) {
      let runColor = false, runLen = 0;
      const h = [0, 0, 0, 0, 0, 0, 0];
      for (let x = 0; x < size; x++) {
        if (m[y][x] === runColor) {
          runLen++;
          if (runLen === 5) result += PENALTY_N1; else if (runLen > 5) result++;
        } else {
          addHistory(runLen, h);
          if (!runColor) result += countPatterns(h) * PENALTY_N3;
          runColor = m[y][x];
          runLen = 1;
        }
      }
      result += terminateAndCount(runColor, runLen, h) * PENALTY_N3;
    }
    for (let x = 0; x < size; x++) {
      let runColor = false, runLen = 0;
      const h = [0, 0, 0, 0, 0, 0, 0];
      for (let y = 0; y < size; y++) {
        if (m[y][x] === runColor) {
          runLen++;
          if (runLen === 5) result += PENALTY_N1; else if (runLen > 5) result++;
        } else {
          addHistory(runLen, h);
          if (!runColor) result += countPatterns(h) * PENALTY_N3;
          runColor = m[y][x];
          runLen = 1;
        }
      }
      result += terminateAndCount(runColor, runLen, h) * PENALTY_N3;
    }
    for (let y = 0; y < size - 1; y++) {
      for (let x = 0; x < size - 1; x++) {
        const c = m[y][x];
        if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) result += PENALTY_N2;
      }
    }
    let dark = 0;
    for (const row of m) for (const c of row) if (c) dark++;
    const total = size * size;
    const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
    result += k * PENALTY_N4;
    return result;
  }
}

/** Encode text (UTF-8, byte mode). Returns null when it doesn't fit in version 12. */
export function encodeQr(text: string, ecc: Ecc = "M"): QrMatrix | null {
  const bytes = Array.from(new TextEncoder().encode(text));
  let ver = 1;
  let capBits = 0;
  for (; ; ver++) {
    capBits = numDataCodewords(ver, ecc) * 8;
    const charCountBits = ver < 10 ? 8 : 16;
    if (4 + charCountBits + bytes.length * 8 <= capBits) break;
    if (ver >= MAX_VERSION) return null;
  }

  const bits: number[] = [];
  const append = (val: number, len: number) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  append(0b0100, 4);
  append(bytes.length, ver < 10 ? 8 : 16);
  for (const b of bytes) append(b, 8);
  append(0, Math.min(4, capBits - bits.length));
  append(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capBits; pad ^= 0xec ^ 0x11) append(pad, 8);

  const data: number[] = new Array(bits.length / 8).fill(0);
  bits.forEach((b, i) => { data[i >>> 3] |= b << (7 - (i & 7)); });

  const built = new Builder(ver, ecc, data);
  return { size: built.size, version: ver, modules: built.modules };
}

/** Draw a QR matrix onto a 2D canvas at (x, y), `px` pixels per module, with no quiet zone added. */
export function drawQr(ctx: CanvasRenderingContext2D, qr: QrMatrix, x: number, y: number, px: number, dark = "#161616", light = "#ffffff", quiet = 2) {
  const total = (qr.size + quiet * 2) * px;
  ctx.fillStyle = light;
  ctx.fillRect(x, y, total, total);
  ctx.fillStyle = dark;
  for (let r = 0; r < qr.size; r++) {
    for (let c = 0; c < qr.size; c++) {
      if (qr.modules[r][c]) ctx.fillRect(x + (c + quiet) * px, y + (r + quiet) * px, px, px);
    }
  }
  return total;
}

/** The standard UPI deep link a QR scanner turns into a payment request. */
export function upiPayLink({ upiId, name, amount, note }: { upiId: string; name?: string; amount?: number; note?: string }): string {
  const q = new URLSearchParams();
  q.set("pa", upiId.trim());
  if (name) q.set("pn", name);
  if (amount && amount > 0) q.set("am", (Math.round(amount * 100) / 100).toFixed(2));
  q.set("cu", "INR");
  if (note) q.set("tn", note);
  // UPI apps read the payee address as-is, so keep "@" readable; spaces become %20.
  return `upi://pay?${q.toString().replace(/\+/g, "%20").replace(/%40/g, "@")}`;
}
