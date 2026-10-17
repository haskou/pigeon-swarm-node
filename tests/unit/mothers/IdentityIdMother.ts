import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { generateKeyPairSync } from 'crypto';

const BASE64_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const ED25519_SPKI_PREFIX = '302a300506032b6570032100';
const ED25519_KEY_BYTES = 32;
const PADDING_VALUES = 4;
const SET_TAG = 0x31;
const SMALL_ORDER_Y = 1;
const OFF_CURVE_Y = 2;

/**
 * Identity ids for the canonical-key checks. The forged ones all parse as an
 * Ed25519 public key, yet none is the one canonical encoding of a usable key.
 */
export class IdentityIdMother {
  private static spkiOfPoint(y: number): IdentityId {
    const key = Buffer.alloc(ED25519_KEY_BYTES);
    key[0] = y;

    return new IdentityId(
      Buffer.concat([Buffer.from(ED25519_SPKI_PREFIX, 'hex'), key]).toString(
        'base64',
      ),
    );
  }

  public static canonical(): IdentityId {
    const { publicKey } = generateKeyPairSync('ed25519');

    return new IdentityId(
      publicKey.export({ format: 'pem', type: 'spki' }).toString(),
    );
  }

  /** The key bytes of a real key behind another DER prefix byte. */
  public static aliasPrefix(): IdentityId {
    const der = Buffer.from(IdentityIdMother.canonical().valueOf(), 'base64');
    der[0] = SET_TAG;

    return new IdentityId(der.toString('base64'));
  }

  /**
   * A real key under another base64 text: the last data character of the
   * 60-character body carries 4 data bits and 2 padding bits, so changing
   * only the padding bits decodes to equal bytes.
   */
  public static reencoded(): IdentityId {
    const body = IdentityIdMother.canonical().valueOf();
    const index = body.length - 2;
    const value = BASE64_ALPHABET.indexOf(body[index]);
    const padding = value % PADDING_VALUES;
    const reencoded = value - padding + ((padding + 1) % PADDING_VALUES);

    return new IdentityId(
      `${body.slice(0, index)}${BASE64_ALPHABET[reencoded]}${body.slice(index + 1)}`,
    );
  }

  /** The neutral point, which any signature verifies against. */
  public static smallOrder(): IdentityId {
    return IdentityIdMother.spkiOfPoint(SMALL_ORDER_Y);
  }

  /** A y coordinate with no point on the curve, so no key at all. */
  public static offCurve(): IdentityId {
    return IdentityIdMother.spkiOfPoint(OFF_CURVE_Y);
  }

  public static forged(): [string, IdentityId][] {
    return [
      ['an alias DER prefix', IdentityIdMother.aliasPrefix()],
      ['a non-canonical base64 encoding', IdentityIdMother.reencoded()],
      ['a small-order point', IdentityIdMother.smallOrder()],
      ['an off-curve point', IdentityIdMother.offCurve()],
    ];
  }
}
