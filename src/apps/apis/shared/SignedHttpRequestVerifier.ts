import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import {
  PublicKey,
  Signature,
  SignedHttpRequestBody,
  SignedHttpRequestSignature,
} from '@haskou/pigeon-swarm-crypto';

import { InvalidSignedRequestError } from './errors/InvalidSignedRequestError';
import { MissingSignedRequestHeaderError } from './errors/MissingSignedRequestHeaderError';
import { SignedHttpRequest } from './SignedHttpRequest';
import { SignedRequestBodyHash } from './SignedRequestBodyHash';

export type { SignedHttpRequest } from './SignedHttpRequest';

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
          path: request.path,
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
