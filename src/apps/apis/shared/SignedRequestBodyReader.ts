import { createHash } from 'crypto';
import { Request } from 'express';

import { InvalidSignedRequestError } from './errors/InvalidSignedRequestError';
import { SignedRequestBodyIsTooLargeError } from './errors/SignedRequestBodyIsTooLargeError';
import { SignedRequestBodyHash } from './SignedRequestBodyHash';

/**
 * Streams a request body whose hash the signature already covers. It stops
 * reading as soon as the body exceeds `maxBytes`, and resolves only when the
 * bytes hash to the declared value, so callers never parse unsigned bytes.
 */
export class SignedRequestBodyReader {
  public constructor(private readonly maxBytes: number) {}

  public async read(
    request: Request,
    declaredHash: SignedRequestBodyHash,
  ): Promise<Buffer> {
    if (Number(request.header('content-length')) > this.maxBytes) {
      throw new SignedRequestBodyIsTooLargeError(this.maxBytes);
    }

    const { promise, reject, resolve } = Promise.withResolvers<Buffer>();
    const hash = createHash('sha256');
    const chunks: Buffer[] = [];
    let receivedBytes = 0;
    let settled = false;

    // Stops consuming the body at the first outcome; later events are ignored.
    const settle = (outcome: () => void): void => {
      if (settled) {
        return;
      }

      settled = true;
      request.pause();
      outcome();
    };

    request.on('data', (chunk: Buffer) => {
      if (settled) {
        return;
      }

      receivedBytes += chunk.length;

      if (receivedBytes > this.maxBytes) {
        settle(() =>
          reject(new SignedRequestBodyIsTooLargeError(this.maxBytes)),
        );

        return;
      }

      hash.update(chunk);
      chunks.push(chunk);
    });
    request.once('end', () =>
      settle(() =>
        declaredHash.isEqual(new SignedRequestBodyHash(hash.digest('hex')))
          ? resolve(Buffer.concat(chunks, receivedBytes))
          : reject(new InvalidSignedRequestError()),
      ),
    );
    request.on('error', (error: Error) => settle(() => reject(error)));
    request.once('close', () =>
      settle(() => reject(new InvalidSignedRequestError())),
    );

    return promise;
  }
}
