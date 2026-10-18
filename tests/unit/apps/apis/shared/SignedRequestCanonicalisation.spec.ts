import { InvalidSignedRequestError } from '@app/apps/apis/shared/errors/InvalidSignedRequestError';
import { MissingSignedRequestHeaderError } from '@app/apps/apis/shared/errors/MissingSignedRequestHeaderError';
import {
  SignedHttpRequest,
  SignedHttpRequestVerifier,
} from '@app/apps/apis/shared/SignedHttpRequestVerifier';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import {
  KeyPair,
  SignedHttpRequestBody,
  SignedHttpRequestSignature,
} from '@haskou/pigeon-swarm-crypto';

/** Ed25519 group order L, so S and S+L are two encodings of one scalar. */
const ED25519_ORDER = BigInt(
  '7237005577332262213973186563042994240857116359379907606001950938285454250989',
);
const BYTE = BigInt(256);
const PATH = '/resource';
const TIMESTAMP = Date.now();

type Wire = {
  body?: SignedHttpRequestBody;
  headers: Record<string, string>;
  method: string;
  path: string;
};

/** Signs the canonical payload exactly as a client does and returns the wire request. */
function sign(
  keyPair: KeyPair,
  signed: {
    body?: SignedHttpRequestBody;
    method: string;
    path: string;
    timestamp: number;
  },
  identityId = new IdentityId(keyPair.toPrimitives().publicKey),
): Wire {
  const canonical = SignedHttpRequestSignature.signingContent({
    body: signed.body,
    method: signed.method,
    path: signed.path,
    timestamp: signed.timestamp,
  });

  return {
    body: signed.body,
    headers: {
      'x-identity-id': identityId.valueOf(),
      'x-signature': keyPair.sign(canonical).valueOf(),
      'x-timestamp': String(signed.timestamp),
    },
    method: signed.method,
    path: signed.path,
  };
}

function toRequest(wire: Wire): SignedHttpRequest {
  return {
    body: wire.body,
    header: (name: string) => wire.headers[name.toLowerCase()],
    method: wire.method,
    path: wire.path,
  };
}

function littleEndianToBigInt(bytes: Uint8Array): bigint {
  return Array.from(bytes).reduceRight(
    (value, byte) => value * BYTE + BigInt(byte),
    BigInt(0),
  );
}

function bigIntToLittleEndian(value: bigint, length: number): Buffer {
  const bytes = Buffer.alloc(length);
  let rest = value;

  for (let index = 0; index < length; index += 1) {
    bytes[index] = Number(rest % BYTE);
    rest /= BYTE;
  }

  return bytes;
}

/** Same R and the scalar S+L: the same Ed25519 equation with different bytes. */
function malleate(signature: string): string {
  const bytes = Buffer.from(signature, 'base64');
  const scalar = littleEndianToBigInt(bytes.subarray(32));

  return Buffer.concat([
    bytes.subarray(0, 32),
    bigIntToLittleEndian(scalar + ED25519_ORDER, 32),
  ]).toString('base64');
}

describe('signed request canonicalisation', () => {
  const verifier = new SignedHttpRequestVerifier();

  it('refuses the malleable twin of a valid signature (S offset by the group order)', async () => {
    const keyPair = await KeyPair.generate();
    const valid = sign(keyPair, {
      method: 'GET',
      path: PATH,
      timestamp: TIMESTAMP,
    });
    const twin: Wire = {
      ...valid,
      headers: {
        ...valid.headers,
        'x-signature': malleate(valid.headers['x-signature']),
      },
    };

    expect(() => verifier.verifySignature(toRequest(valid))).not.toThrow();
    expect(() => verifier.verifySignature(toRequest(twin))).toThrow(
      InvalidSignedRequestError,
    );
  });

  const SIGNED_PATH = '/resource/a%2Fb';

  it.each([
    '/resource/a/b',
    '/resource/a%2fb',
    '/resource/a%2Fb/',
    '/Resource/a%2Fb',
    '/resource/%61%2Fb',
  ])(
    'refuses a signature over %s presented as a different raw path',
    async (presentedPath) => {
      const keyPair = await KeyPair.generate();
      const signed = sign(keyPair, {
        method: 'GET',
        path: SIGNED_PATH,
        timestamp: TIMESTAMP,
      });

      expect(() =>
        verifier.verifySignature(toRequest({ ...signed, path: presentedPath })),
      ).toThrow(InvalidSignedRequestError);
    },
  );

  it('treats an absent body as an empty object, so both spellings share one signature', async () => {
    const keyPair = await KeyPair.generate();
    const absent = sign(keyPair, {
      method: 'POST',
      path: PATH,
      timestamp: TIMESTAMP,
    });
    const empty = sign(keyPair, {
      body: {},
      method: 'POST',
      path: PATH,
      timestamp: TIMESTAMP,
    });

    expect(absent.headers['x-signature']).toBe(empty.headers['x-signature']);
    expect(() =>
      verifier.verifySignature(toRequest({ ...absent, body: {} })),
    ).not.toThrow();
    expect(() =>
      verifier.verifySignature(toRequest({ ...empty, body: undefined })),
    ).not.toThrow();
  });

  it('signs the body in key order, so the same members in another order are refused', async () => {
    const keyPair = await KeyPair.generate();
    const signed = sign(keyPair, {
      body: { a: 1, b: 2 },
      method: 'POST',
      path: PATH,
      timestamp: TIMESTAMP,
    });

    const reversed: SignedHttpRequestBody = JSON.parse('{"b":2,"a":1}');
    expect(() =>
      verifier.verifySignature(toRequest({ ...signed, body: reversed })),
    ).toThrow(InvalidSignedRequestError);
  });

  it('refuses a signature presented under another identity', async () => {
    const signer = await KeyPair.generate();
    const other = await KeyPair.generate();
    const signed = sign(
      signer,
      { method: 'GET', path: PATH, timestamp: TIMESTAMP },
      new IdentityId(other.toPrimitives().publicKey),
    );

    expect(() => verifier.verifySignature(toRequest(signed))).toThrow(
      InvalidSignedRequestError,
    );
  });

  it.each(['abc', 'NaN', '-1', '1e308', '1700000000000.5'])(
    'refuses an X-Timestamp of %j that does not name the signed integer',
    async (timestamp) => {
      const keyPair = await KeyPair.generate();
      const signed = sign(keyPair, {
        method: 'GET',
        path: PATH,
        timestamp: TIMESTAMP,
      });

      expect(() =>
        verifier.verifySignature(
          toRequest({
            ...signed,
            headers: { ...signed.headers, 'x-timestamp': timestamp },
          }),
        ),
      ).toThrow(InvalidSignedRequestError);
    },
  );

  it('refuses an empty X-Timestamp as a missing signed header', async () => {
    const keyPair = await KeyPair.generate();
    const signed = sign(keyPair, {
      method: 'GET',
      path: PATH,
      timestamp: TIMESTAMP,
    });

    expect(() =>
      verifier.verifySignature(
        toRequest({
          ...signed,
          headers: { ...signed.headers, 'x-timestamp': '' },
        }),
      ),
    ).toThrow(MissingSignedRequestHeaderError);
  });

  it.each([
    String(TIMESTAMP),
    `${TIMESTAMP}.0`,
    `+${TIMESTAMP}`,
    `0x${TIMESTAMP.toString(16)}`,
  ])(
    'reads X-Timestamp %s through Number(), so each spelling of the signed integer verifies',
    async (timestamp) => {
      const keyPair = await KeyPair.generate();
      const signed = sign(keyPair, {
        method: 'GET',
        path: PATH,
        timestamp: TIMESTAMP,
      });

      expect(() =>
        verifier.verifySignature(
          toRequest({
            ...signed,
            headers: { ...signed.headers, 'x-timestamp': timestamp },
          }),
        ),
      ).not.toThrow();
    },
  );
});
