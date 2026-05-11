import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { IdentityNotFoundError } from '../errors/IdentityNotFoundError';
import { Identity } from '../Identity';
import { IdentityCandidate } from '../repositories/IdentityRepository';

export class IdentityResolutionDomainService {
  public resolve(identityId: IdentityId, candidates: Identity[]): Identity {
    const matchingCandidates = candidates.filter(
      (candidate) => candidate.toPrimitives().id === identityId.valueOf(),
    );

    if (matchingCandidates.length === 0) {
      throw new IdentityNotFoundError(identityId.valueOf());
    }

    return matchingCandidates.sort(
      (left, right) =>
        right.toPrimitives().version - left.toPrimitives().version,
    )[0];
  }

  public resolveCandidate(
    identityId: IdentityId,
    candidates: IdentityCandidate[],
  ): IdentityCandidate {
    const matchingCandidates = candidates.filter(
      (candidate) =>
        candidate.identity.toPrimitives().id === identityId.valueOf(),
    );

    if (matchingCandidates.length === 0) {
      throw new IdentityNotFoundError(identityId.valueOf());
    }

    return matchingCandidates.sort(
      (left, right) =>
        right.identity.toPrimitives().version -
        left.identity.toPrimitives().version,
    )[0];
  }
}
