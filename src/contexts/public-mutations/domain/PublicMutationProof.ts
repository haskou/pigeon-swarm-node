import { Signature } from '@haskou/pigeon-swarm-crypto';
import canonicalize from 'canonicalize';
import { createHash } from 'crypto';

import { InvalidPublicMutationError } from './errors/InvalidPublicMutationError';
import { PublicMutationAuthorPrimitives } from './PublicMutationAuthorPrimitives';
import { PublicMutationBodyPrimitives } from './PublicMutationBodyPrimitives';
import { PublicMutationKind } from './PublicMutationKind';
import { PublicMutationProofPrimitives } from './PublicMutationProofPrimitives';

/**
 * Client-signed proof that an authorized device mutated one public record.
 * It binds operation kind, record scope, author, causal position and a digest
 * of the immutable payload, so that a replicated record never wins through
 * sender-controlled timestamps or flags.
 */
export class PublicMutationProof {
  private static readonly MAX_TEXT = 1024;
  private static readonly OPERATION_ID = /^[A-Za-z0-9_-]{22,64}$/;
  private static readonly DIGEST = /^[A-Za-z0-9_-]{43}$/;
  private static readonly DOMAIN = 'pigeon:public-mutation:v2\n';

  private static exact(
    value: unknown,
    fields: string[],
  ): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new InvalidPublicMutationError();
    }
    const record = value as Record<string, unknown>;

    if (
      Object.keys(record).length !== fields.length ||
      fields.some((field) => !Object.hasOwn(record, field))
    ) {
      throw new InvalidPublicMutationError();
    }

    return record;
  }

  private static text(value: unknown): string {
    if (
      typeof value !== 'string' ||
      value.length === 0 ||
      value.length > PublicMutationProof.MAX_TEXT
    ) {
      throw new InvalidPublicMutationError();
    }

    return value;
  }

  private static counter(value: unknown): number {
    if (
      typeof value !== 'number' ||
      !Number.isSafeInteger(value) ||
      value < 0
    ) {
      throw new InvalidPublicMutationError();
    }

    return value;
  }

  private static pattern(value: unknown, pattern: RegExp): string {
    if (typeof value !== 'string' || !pattern.test(value)) {
      throw new InvalidPublicMutationError();
    }

    return value;
  }

  private static author(value: unknown): PublicMutationAuthorPrimitives {
    const author = PublicMutationProof.exact(value, [
      'authorizationRevision',
      'identityId',
      'deviceCredential',
    ]);

    return {
      authorizationRevision: PublicMutationProof.counter(
        author.authorizationRevision,
      ),
      deviceCredential: PublicMutationProof.text(author.deviceCredential),
      identityId: PublicMutationProof.text(author.identityId),
    };
  }

  private static kind(value: unknown): PublicMutationKind {
    if (value !== 'put' && value !== 'delete') {
      throw new InvalidPublicMutationError();
    }

    return value;
  }

  public static digestOf(payload: Record<string, unknown>): string {
    const canonical = canonicalize(payload);

    if (canonical === undefined) {
      throw new InvalidPublicMutationError();
    }

    return createHash('sha256').update(canonical).digest('base64url');
  }

  /** Strict decoder: unknown, missing or malformed fields are rejected. */
  public static fromPrimitives(value: unknown): PublicMutationProof {
    const proof = PublicMutationProof.exact(value, [
      'version',
      'operationId',
      'kind',
      'store',
      'recordId',
      'predecessor',
      'sequence',
      'payloadDigest',
      'author',
      'signature',
    ]);

    if (proof.version !== 2) {
      throw new InvalidPublicMutationError();
    }

    const sequence = PublicMutationProof.counter(proof.sequence);
    const predecessor =
      proof.predecessor === null
        ? null
        : PublicMutationProof.pattern(
            proof.predecessor,
            PublicMutationProof.DIGEST,
          );

    if ((predecessor === null) !== (sequence === 0)) {
      throw new InvalidPublicMutationError();
    }

    try {
      return new PublicMutationProof(
        {
          author: PublicMutationProof.author(proof.author),
          kind: PublicMutationProof.kind(proof.kind),
          operationId: PublicMutationProof.pattern(
            proof.operationId,
            PublicMutationProof.OPERATION_ID,
          ),
          payloadDigest: PublicMutationProof.pattern(
            proof.payloadDigest,
            PublicMutationProof.DIGEST,
          ),
          predecessor,
          recordId: PublicMutationProof.text(proof.recordId),
          sequence,
          store: PublicMutationProof.text(proof.store),
          version: 2,
        },
        new Signature(PublicMutationProof.text(proof.signature)),
      );
    } catch (error) {
      if (error instanceof InvalidPublicMutationError) throw error;

      throw new InvalidPublicMutationError();
    }
  }

  public static signed(
    body: PublicMutationBodyPrimitives,
    signature: Signature,
  ): PublicMutationProof {
    return PublicMutationProof.fromPrimitives({
      ...body,
      signature: signature.valueOf(),
    });
  }

  public static signingContentOf(body: PublicMutationBodyPrimitives): string {
    const canonical = canonicalize(body);

    if (canonical === undefined) {
      throw new InvalidPublicMutationError();
    }

    return `${PublicMutationProof.DOMAIN}${canonical}`;
  }

  private constructor(
    private readonly body: PublicMutationBodyPrimitives,
    private readonly signature: Signature,
  ) {}

  public getBody(): PublicMutationBodyPrimitives {
    return this.body;
  }

  public getSignature(): Signature {
    return this.signature;
  }

  public getAuthor(): PublicMutationAuthorPrimitives {
    return this.body.author;
  }

  public isDeletion(): boolean {
    return this.body.kind === 'delete';
  }

  public signingContent(): string {
    return PublicMutationProof.signingContentOf(this.body);
  }

  /** Stable identifier of this exact signed mutation, used as predecessor. */
  public digest(): string {
    return PublicMutationProof.digestOf({ ...this.toPrimitives() });
  }

  /**
   * Deterministic, clock-free ordering between two verified mutations of the
   * same record: higher causal sequence first, then the lower digest.
   */
  public winsOver(other: PublicMutationProof): boolean {
    if (this.body.sequence !== other.body.sequence) {
      return this.body.sequence > other.body.sequence;
    }

    return this.digest() < other.digest();
  }

  public toPrimitives(): PublicMutationProofPrimitives {
    return { ...this.body, signature: this.signature.valueOf() };
  }
}
