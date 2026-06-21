import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { IdentityNotFoundError } from '../errors/IdentityNotFoundError';
import { Identity } from '../Identity';
import { IdentityCandidate } from '../IdentityCandidate';

export default class IdentityResolutionDomainService {
  public resolve(identityId: IdentityId, candidates: Identity[]): Identity {
    const matchingCandidates = candidates.filter((candidate) =>
      candidate.isIdentifiedBy(identityId),
    );

    if (matchingCandidates.length === 0) {
      throw new IdentityNotFoundError(identityId.valueOf());
    }

    return matchingCandidates.sort((left, right) => {
      if (right.isNewerThan(left)) {
        return 1;
      }

      if (left.isNewerThan(right)) {
        return -1;
      }

      return 0;
    })[0];
  }

  public resolveCandidate(
    identityId: IdentityId,
    candidates: IdentityCandidate[],
  ): IdentityCandidate {
    const matchingCandidates = candidates.filter((candidate) =>
      candidate.isIdentifiedBy(identityId),
    );

    if (matchingCandidates.length === 0) {
      throw new IdentityNotFoundError(identityId.valueOf());
    }

    return matchingCandidates.sort((left, right) => {
      if (right.isNewerThan(left)) {
        return 1;
      }

      if (left.isNewerThan(right)) {
        return -1;
      }

      return 0;
    })[0];
  }
}
