import { KeychainCandidate } from '@app/contexts/keychains/domain/KeychainCandidate';
import KeychainRepository from '@app/contexts/keychains/domain/repositories/KeychainRepository';
import KeychainCandidateValidationDomainService from '@app/contexts/keychains/domain/services/KeychainCandidateValidationDomainService';
import KeychainSignatureDomainService from '@app/contexts/keychains/domain/services/KeychainSignatureDomainService';
import Kernel from '@haskou/ddd-kernel';

import { KeychainNotFoundError } from '../../domain/errors/KeychainNotFoundError';
import { CurrentKeychainFindMessage } from './messages/CurrentKeychainFindMessage';

export default class CurrentKeychainFinder {
  private readonly TIE_LOG_INTERVAL_MS = 60_000;
  private lastTieLogAt = 0;
  private suppressedTieLogs = 0;

  constructor(
    private readonly repository: KeychainRepository,
    private readonly validator: KeychainCandidateValidationDomainService,
    private readonly signatureService: KeychainSignatureDomainService,
  ) {}

  private async isValidCandidate(
    message: CurrentKeychainFindMessage,
    candidate: KeychainCandidate,
  ): Promise<boolean> {
    if (candidate.isLocal()) {
      return (
        candidate.belongsTo(message.ownerIdentityId) &&
        this.signatureService.isValidSignature(candidate.getKeychain())
      );
    }

    return this.validator.isValidChainFor(
      message.ownerIdentityId,
      candidate.getKeychain(),
      async (externalIdentifier) =>
        (await this.repository.hasByExternalIdentifier(externalIdentifier))
          ? this.repository.requireByExternalIdentifier(externalIdentifier)
          : undefined,
    );
  }

  private logSameVersionTie(candidateCount: number): void {
    const now = Date.now();

    if (now - this.lastTieLogAt < this.TIE_LOG_INTERVAL_MS) {
      this.suppressedTieLogs += 1;

      return;
    }

    Kernel.logger.warn?.(
      `Resolved same-version keychain tie: candidates=${candidateCount} suppressedSinceLastLog=${this.suppressedTieLogs}`,
    );
    this.lastTieLogAt = now;
    this.suppressedTieLogs = 0;
  }

  public async find(
    message: CurrentKeychainFindMessage,
  ): Promise<KeychainCandidate> {
    const candidates = await this.repository.findCandidateReferencesByOwnerId(
      message.ownerIdentityId,
    );
    const validCandidates: KeychainCandidate[] = [];

    for (const candidate of candidates) {
      if (await this.isValidCandidate(message, candidate)) {
        validCandidates.push(candidate);
      }
    }

    if (validCandidates.length === 0) {
      throw new KeychainNotFoundError(message.ownerIdentityId);
    }

    const [winner] = validCandidates.sort((left, right) => {
      if (left.takesPrecedenceOver(right)) {
        return -1;
      }

      if (right.takesPrecedenceOver(left)) {
        return 1;
      }

      return 0;
    });
    const sameVersionCount = validCandidates.filter((candidate) =>
      candidate.hasSameVersionAs(winner),
    ).length;

    if (sameVersionCount > 1) {
      this.logSameVersionTie(sameVersionCount);
    }

    return winner;
  }
}
