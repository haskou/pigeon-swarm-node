import { PrivateFreshnessGate } from '@app/contexts/private-authorization/application/accept-operation/PrivateFreshnessGate';
import { InvalidPrivateAuthorizationError } from '@app/contexts/private-authorization/domain/errors/InvalidPrivateAuthorizationError';
import { PrivateAuthorizationCheckpoint } from '@app/contexts/private-authorization/domain/PrivateAuthorizationCheckpoint';
import { PrivateControlOperation } from '@app/contexts/private-authorization/domain/PrivateControlOperation';
import { randomBytes } from 'crypto';
import { performance } from 'perf_hooks';

import PrivateFreshnessVerifier from '../crypto/PrivateFreshnessVerifier';

interface OutstandingChallenge {
  issuedAt: number;
  nonce: string;
  requestJson: string;
}

export default class InMemoryPrivateFreshnessGate extends PrivateFreshnessGate {
  private static readonly MAX_AGE_MILLISECONDS = 10_000;
  private static readonly MAX_OUTSTANDING_CHALLENGES = 1024;
  private static readonly challenges = new Map<string, OutstandingChallenge>();

  public constructor(
    private readonly verifier: PrivateFreshnessVerifier,
    private readonly now: () => number = () => performance.now(),
    private readonly nonce: () => string = () =>
      randomBytes(32).toString('base64url'),
  ) {
    super();
  }

  private key(scopeId: string, digest: string): string {
    return `${scopeId}:${digest}`;
  }

  private removeExpired(now: number): void {
    for (const [key, challenge] of InMemoryPrivateFreshnessGate.challenges) {
      if (
        now - challenge.issuedAt >
        InMemoryPrivateFreshnessGate.MAX_AGE_MILLISECONDS
      ) {
        InMemoryPrivateFreshnessGate.challenges.delete(key);
      }
    }
  }

  private verifyNow(
    checkpoint: PrivateAuthorizationCheckpoint,
    operation: PrivateControlOperation,
    signedProofJson: string,
  ): { replayMarkerId: string } {
    const trusted = checkpoint.toPrimitives();
    const candidate = operation.toPrimitives();
    const key = this.key(trusted.scopeId, candidate.digest);
    const challenge = InMemoryPrivateFreshnessGate.challenges.get(key);
    InMemoryPrivateFreshnessGate.challenges.delete(key);

    if (
      !challenge ||
      this.now() - challenge.issuedAt >
        InMemoryPrivateFreshnessGate.MAX_AGE_MILLISECONDS
    ) {
      throw new InvalidPrivateAuthorizationError();
    }
    this.verifier.verify(
      signedProofJson,
      trusted.freshnessAuthorityKey,
      challenge.requestJson,
    );

    return { replayMarkerId: challenge.nonce };
  }

  public issue(
    checkpoint: PrivateAuthorizationCheckpoint,
    operation: PrivateControlOperation,
  ): string {
    const trusted = checkpoint.toPrimitives();
    const candidate = operation.toPrimitives();

    if (candidate.scopeId !== trusted.scopeId) {
      throw new InvalidPrivateAuthorizationError();
    }
    const now = this.now();
    this.removeExpired(now);
    const key = this.key(trusted.scopeId, candidate.digest);

    if (
      !InMemoryPrivateFreshnessGate.challenges.has(key) &&
      InMemoryPrivateFreshnessGate.challenges.size >=
        InMemoryPrivateFreshnessGate.MAX_OUTSTANDING_CHALLENGES
    ) {
      throw new InvalidPrivateAuthorizationError();
    }
    const nonce = this.nonce();
    const requestJson = JSON.stringify({
      batchCommitment: candidate.digest,
      expectedHeadHash: trusted.headHash,
      expectedRevision: trusted.revision,
      nonce,
      scopeId: trusted.scopeId,
      version: 1,
    });
    InMemoryPrivateFreshnessGate.challenges.set(key, {
      issuedAt: now,
      nonce,
      requestJson,
    });

    return requestJson;
  }

  public verify(
    checkpoint: PrivateAuthorizationCheckpoint,
    operation: PrivateControlOperation,
    signedProofJson: string,
  ): Promise<{ replayMarkerId: string }> {
    return Promise.resolve().then(() =>
      this.verifyNow(checkpoint, operation, signedProofJson),
    );
  }
}
