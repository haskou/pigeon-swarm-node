import { PrivateFreshnessGate } from '@app/contexts/private-authorization/application/accept-operation/PrivateFreshnessGate';
import { InvalidPrivateAuthorizationError } from '@app/contexts/private-authorization/domain/errors/InvalidPrivateAuthorizationError';
import { PrivateAuthorizationCheckpoint } from '@app/contexts/private-authorization/domain/PrivateAuthorizationCheckpoint';
import { PrivateControlOperation } from '@app/contexts/private-authorization/domain/PrivateControlOperation';
import { randomBytes } from 'crypto';
import { performance } from 'perf_hooks';

import PrivateFreshnessVerifier from '../crypto/PrivateFreshnessVerifier';

interface OutstandingChallenge {
  expectedHeadHash: string;
  expectedRevision: number;
  issuedAt: number;
  nonce: string;
  requestJson: string;
}

export default class InMemoryPrivateFreshnessGate extends PrivateFreshnessGate {
  private static readonly MAX_AGE_MILLISECONDS = 10_000;
  private static readonly MAX_OUTSTANDING_CHALLENGES_PER_PRINCIPAL = 64;
  private static readonly MAX_OUTSTANDING_CHALLENGES_PER_SCOPE = 1024;
  private readonly challenges = new Map<
    string,
    Map<string, Map<string, OutstandingChallenge>>
  >();

  public constructor(
    private readonly verifier: PrivateFreshnessVerifier,
    private readonly now: () => number = () => performance.now(),
    private readonly nonce: () => string = () =>
      randomBytes(32).toString('base64url'),
  ) {
    super();
  }

  private removeExpiredChallenges(
    challenges: Map<string, OutstandingChallenge>,
    now: number,
  ): void {
    for (const [digest, challenge] of challenges) {
      if (this.isExpired(challenge, now)) challenges.delete(digest);
    }
  }

  private removeExpired(now: number): void {
    for (const [scopeId, scope] of this.challenges) {
      for (const [authorDeviceKey, challenges] of scope) {
        this.removeExpiredChallenges(challenges, now);

        if (challenges.size === 0) {
          scope.delete(authorDeviceKey);
        }
      }

      if (scope.size === 0) {
        this.challenges.delete(scopeId);
      }
    }
  }

  private scopeSize(
    scope: Map<string, Map<string, OutstandingChallenge>>,
  ): number {
    return [...scope.values()].reduce(
      (total, challenges) => total + challenges.size,
      0,
    );
  }

  private isExpired(challenge: OutstandingChallenge, now: number): boolean {
    return (
      now - challenge.issuedAt >
      InMemoryPrivateFreshnessGate.MAX_AGE_MILLISECONDS
    );
  }

  private matchesCheckpoint(
    challenge: OutstandingChallenge,
    checkpoint: ReturnType<PrivateAuthorizationCheckpoint['toPrimitives']>,
  ): boolean {
    return (
      challenge.expectedHeadHash === checkpoint.headHash &&
      challenge.expectedRevision === checkpoint.revision
    );
  }

  private assertAdmitted(
    checkpoint: ReturnType<PrivateAuthorizationCheckpoint['toPrimitives']>,
    operation: ReturnType<PrivateControlOperation['toPrimitives']>,
  ): void {
    if (
      operation.scopeId !== checkpoint.scopeId ||
      !checkpoint.admittedDeviceKeys.includes(operation.authorDeviceKey) ||
      checkpoint.revokedDeviceKeys.includes(operation.authorDeviceKey)
    ) {
      throw new InvalidPrivateAuthorizationError();
    }
  }

  private findChallenge(
    scopeId: string,
    authorDeviceKey: string,
    digest: string,
  ): OutstandingChallenge | undefined {
    return this.challenges.get(scopeId)?.get(authorDeviceKey)?.get(digest);
  }

  private takeChallenge(
    scopeId: string,
    authorDeviceKey: string,
    digest: string,
  ): OutstandingChallenge | undefined {
    const scope = this.challenges.get(scopeId);
    const challenges = scope?.get(authorDeviceKey);
    const challenge = this.findChallenge(scopeId, authorDeviceKey, digest);
    challenges?.delete(digest);
    this.removeEmptyStores(scopeId, authorDeviceKey, scope, challenges);

    return challenge;
  }

  private removeEmptyStores(
    scopeId: string,
    authorDeviceKey: string,
    scope: Map<string, Map<string, OutstandingChallenge>> | undefined,
    challenges: Map<string, OutstandingChallenge> | undefined,
  ): void {
    if (challenges?.size === 0) scope?.delete(authorDeviceKey);

    if (scope?.size === 0) {
      this.challenges.delete(scopeId);
    }
  }

  private assertChallenge(
    challenge: OutstandingChallenge | undefined,
    checkpoint: ReturnType<PrivateAuthorizationCheckpoint['toPrimitives']>,
  ): asserts challenge is OutstandingChallenge {
    if (
      !challenge ||
      this.isExpired(challenge, this.now()) ||
      !this.matchesCheckpoint(challenge, checkpoint)
    ) {
      throw new InvalidPrivateAuthorizationError();
    }
  }

  private verifyNow(
    checkpoint: PrivateAuthorizationCheckpoint,
    operation: PrivateControlOperation,
    signedProofJson: string,
  ): { replayMarkerId: string } {
    const trusted = checkpoint.toPrimitives();
    const candidate = operation.toPrimitives();
    const challenge = this.findChallenge(
      trusted.scopeId,
      candidate.authorDeviceKey,
      candidate.digest,
    );
    this.assertChallenge(challenge, trusted);
    this.assertAdmitted(trusted, candidate);
    this.verifier.verify(
      signedProofJson,
      trusted.freshnessAuthorityKey,
      challenge.requestJson,
    );
    const consumed = this.takeChallenge(
      trusted.scopeId,
      candidate.authorDeviceKey,
      candidate.digest,
    );

    if (consumed !== challenge) throw new InvalidPrivateAuthorizationError();

    return { replayMarkerId: challenge.nonce };
  }

  private assertCapacity(
    scope: Map<string, Map<string, OutstandingChallenge>> | undefined,
    challenges: Map<string, OutstandingChallenge> | undefined,
  ): void {
    if (
      (challenges?.size ?? 0) >=
        InMemoryPrivateFreshnessGate.MAX_OUTSTANDING_CHALLENGES_PER_PRINCIPAL ||
      (scope ? this.scopeSize(scope) : 0) >=
        InMemoryPrivateFreshnessGate.MAX_OUTSTANDING_CHALLENGES_PER_SCOPE
    ) {
      throw new InvalidPrivateAuthorizationError();
    }
  }

  private challengeStore(
    scopeId: string,
    authorDeviceKey: string,
  ): Map<string, OutstandingChallenge> {
    let scope = this.challenges.get(scopeId);
    scope ??= new Map<string, Map<string, OutstandingChallenge>>();
    let challenges = scope.get(authorDeviceKey);
    challenges ??= new Map<string, OutstandingChallenge>();
    scope.set(authorDeviceKey, challenges);
    this.challenges.set(scopeId, scope);

    return challenges;
  }

  public issue(
    checkpoint: PrivateAuthorizationCheckpoint,
    operation: PrivateControlOperation,
  ): string {
    const trusted = checkpoint.toPrimitives();
    const candidate = operation.toPrimitives();

    this.assertAdmitted(trusted, candidate);
    const now = this.now();
    this.removeExpired(now);
    const scope = this.challenges.get(trusted.scopeId);
    let challenges = scope?.get(candidate.authorDeviceKey);
    const existing = challenges?.get(candidate.digest);

    if (existing && this.matchesCheckpoint(existing, trusted)) {
      return existing.requestJson;
    }

    if (existing) challenges?.delete(candidate.digest);
    this.assertCapacity(scope, challenges);
    challenges = this.challengeStore(
      trusted.scopeId,
      candidate.authorDeviceKey,
    );
    const nonce = this.nonce();
    const requestJson = JSON.stringify({
      batchCommitment: candidate.digest,
      expectedHeadHash: trusted.headHash,
      expectedRevision: trusted.revision,
      nonce,
      scopeId: trusted.scopeId,
      version: 1,
    });
    challenges.set(candidate.digest, {
      expectedHeadHash: trusted.headHash,
      expectedRevision: trusted.revision,
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
