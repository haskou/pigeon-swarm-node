import { InvalidSignedRequestError } from '@app/apps/apis/shared/errors/InvalidSignedRequestError';
import { SignedRequestBodyHash } from '@app/apps/apis/shared/SignedRequestBodyHash';
import { SignedRequestBodyReader } from '@app/apps/apis/shared/SignedRequestBodyReader';
import { SHA256Hash } from '@haskou/pigeon-swarm-crypto';
import vectors from '@haskou/pigeon-swarm-crypto/vectors/signed-http-request.json';
import { Request } from 'express';
import { EventEmitter } from 'node:events';

type VectorInput = { body?: unknown; bodyBase64?: string };

/** The exact bytes a client sends for the body it signed. */
const bytesOf = ({ body, bodyBase64 }: VectorInput): Buffer => {
  if (bodyBase64 !== undefined) {
    return Buffer.from(bodyBase64, 'base64');
  }

  return Buffer.from(body === undefined ? '{}' : JSON.stringify(body));
};

const streamed = (body: Buffer): Request => {
  const request = Object.assign(new EventEmitter(), {
    header: (name: string) =>
      name === 'content-length' ? String(body.length) : undefined,
    pause: jest.fn(),
  });

  setImmediate(() => {
    request.emit('data', body.subarray(0, 1));
    request.emit('data', body.subarray(1));
    request.emit('end');
  });

  return request as unknown as Request;
};

describe('Signed request body reader vectors', () => {
  const reader = new SignedRequestBodyReader(1024, 1000);

  afterEach(() => jest.restoreAllMocks());

  it.each(vectors.cases)(
    'accepts the body of $name under its signed hash',
    async ({ derived, input }) => {
      const body = bytesOf(input);

      await expect(
        reader.read(
          streamed(body),
          new SignedRequestBodyHash(derived.canonicalPayload.bodyHash),
        ),
      ).resolves.toEqual(body);
    },
  );

  it('hashes the received bytes with the protocol library', async () => {
    const [{ derived, input }] = vectors.cases;
    const body = bytesOf(input);
    const hash = jest.spyOn(SHA256Hash, 'from');

    await reader.read(
      streamed(body),
      new SignedRequestBodyHash(derived.canonicalPayload.bodyHash),
    );

    expect(hash).toHaveBeenCalledWith(body);
  });

  it('refuses a body that does not hash to the signed value', async () => {
    const [first, second] = vectors.cases;

    await expect(
      reader.read(
        streamed(bytesOf(first.input)),
        new SignedRequestBodyHash(second.derived.canonicalPayload.bodyHash),
      ),
    ).rejects.toThrow(InvalidSignedRequestError);
  });
});
