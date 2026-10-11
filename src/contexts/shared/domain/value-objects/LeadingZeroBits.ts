/** Leading zero bits of a digest, the difficulty measure of hashcash-style proofs of work. */
export function leadingZeroBits(digest: Buffer): number {
  let bits = 0;

  for (const byte of digest) {
    if (byte === 0) {
      bits += 8;
      continue;
    }

    return bits + Math.clz32(byte) - 24;
  }

  return bits;
}
