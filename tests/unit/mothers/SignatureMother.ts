const BASE64_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const PADDING_VALUES = 16;

export class SignatureMother {
  /**
   * The same signature bytes under another base64 text: the last data
   * character of an 88-character Ed25519 signature carries 2 data bits and 4
   * padding bits, so changing only the padding bits decodes to equal bytes.
   */
  public static reencoded(signature: string): string {
    const index = signature.length - 3;
    const value = BASE64_ALPHABET.indexOf(signature[index]);
    const padding = value % PADDING_VALUES;
    const reencoded = value - padding + ((padding + 1) % PADDING_VALUES);

    return `${signature.slice(0, index)}${BASE64_ALPHABET[reencoded]}${signature.slice(index + 1)}`;
  }
}
