import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import {
  PublicKey,
  Signature,
  SignedHttpRequestBody,
  SignedHttpRequestSignature,
} from '@haskou/pigeon-swarm-crypto';

import { InvalidSignedRequestError } from './errors/InvalidSignedRequestError';
import { MissingSignedRequestHeaderError } from './errors/MissingSignedRequestHeaderError';
import { SignedRequestTargetIsTooLongError } from './errors/SignedRequestTargetIsTooLongError';
import { SignedHttpRequest } from './SignedHttpRequest';
import { SignedRequestBodyHash } from './SignedRequestBodyHash';

export type { SignedHttpRequest } from './SignedHttpRequest';

/** Matches the crypto package's signed path bound (8192 characters), measured here in UTF-8 bytes. */
const MAX_TARGET_BYTES = 8192;

export class SignedHttpRequestVerifier {
  private verifyOver(
    request: SignedHttpRequest,
    body: SignedHttpRequestBody,
    timestamp: string,
    signature: string,
    key: PublicKey,
  ): Signature {
    try {
      const parsed = new Signature(signature);
      SignedHttpRequestSignature.verify(
        {
          body,
          method: request.method,
          path: request.originalUrl,
          timestamp: Number(timestamp),
        },
        parsed,
        key,
      );

      return parsed;
    } catch {
      throw new InvalidSignedRequestError();
    }
  }

  /**
   * Refuses an oversized raw request target before any header is read, hashed
   * or verified: the crypto package never verifies a longer path, so this only
   * answers earlier and says why.
   */
  private assertTargetWithinLimit(request: SignedHttpRequest): void {
    if (Buffer.byteLength(request.originalUrl, 'utf8') > MAX_TARGET_BYTES) {
      throw new SignedRequestTargetIsTooLongError(MAX_TARGET_BYTES);
    }
  }

  private verifyIdentitySignature(
    request: SignedHttpRequest,
    body: SignedHttpRequestBody,
  ): {
    identityId: IdentityId;
    signature: Signature;
    timestamp: string;
  } {
    const identityId = new IdentityId(
      this.getRequiredHeader(request, 'x-identity-id'),
    );

    // An alias encoding of the signer's key verifies its signature too, yet
    // names another identity to block lists, owner checks and replay keys.
    if (!identityId.isCanonicalKey()) {
      throw new InvalidSignedRequestError();
    }

    const timestamp = this.getRequiredHeader(request, 'x-timestamp');
    const signature = this.verifyOver(
      request,
      body,
      timestamp,
      this.getRequiredHeader(request, 'x-signature'),
      PublicKey.fromPEM(identityId.toString()),
    );

    return { identityId, signature, timestamp };
  }

  private declaredBodyHash(request: SignedHttpRequest): SignedRequestBodyHash {
    const header = this.getRequiredHeader(request, 'x-body-hash');

    try {
      return new SignedRequestBodyHash(header);
    } catch {
      throw new InvalidSignedRequestError();
    }
  }

  public getRequiredHeader(request: SignedHttpRequest, header: string): string {
    const value = request.header(header);
    const normalizedValue = Array.isArray(value) ? value[0] : value;

    if (!normalizedValue) {
      throw new MissingSignedRequestHeaderError(header);
    }

    return normalizedValue;
  }

  /**
   * Verifies that `key` signed the request at `timestamp` with `signature`,
   * which must be the single canonical encoding of the signature bytes.
   */
  public verifyWith(
    request: SignedHttpRequest,
    timestamp: string,
    signature: string,
    key: PublicKey,
  ): Signature {
    this.assertTargetWithinLimit(request);

    return this.verifyOver(
      request,
      request.body as SignedHttpRequestBody,
      timestamp,
      signature,
      key,
    );
  }

  public verifySignature(request: SignedHttpRequest): {
    identityId: IdentityId;
    signature: Signature;
    timestamp: string;
  } {
    this.assertTargetWithinLimit(request);

    return this.verifyIdentitySignature(
      request,
      request.body as SignedHttpRequestBody,
    );
  }

  /**
   * Verifies a request whose signature covers the `X-Body-Hash` header in
   * place of the body, so it is authenticated from its headers alone. The
   * caller must still check the streamed body against the returned hash.
   */
  public verifyDeclaredBodySignature(request: SignedHttpRequest): {
    bodyHash: SignedRequestBodyHash;
    identityId: IdentityId;
    signature: Signature;
    timestamp: string;
  } {
    this.assertTargetWithinLimit(request);
    const bodyHash = this.declaredBodyHash(request);

    return {
      bodyHash,
      ...this.verifyIdentitySignature(request, bodyHash.valueOf()),
    };
  }

  public verify(request: SignedHttpRequest): IdentityId {
    return this.verifySignature(request).identityId;
  }
}
