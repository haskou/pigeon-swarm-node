import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { Identity } from '../Identity';
import { IdentityExternalIdentifier } from '../value-objects/IdentityExternalIdentifier';

export type PreviousIdentityResolver = (
  externalIdentifier: IdentityExternalIdentifier,
) => Promise<Identity | undefined>;

export class IdentityCandidateValidationDomainService {
  public isValidFor(identityId: IdentityId, candidate: Identity): boolean {
    return candidate.isIdentifiedBy(identityId);
  }

  public async isValidChainFor(
    identityId: IdentityId,
    candidate: Identity,
    resolvePrevious: PreviousIdentityResolver,
    visitedExternalIdentifiers: IdentityExternalIdentifier[] = [],
  ): Promise<boolean> {
    if (!this.isValidFor(identityId, candidate)) {
      return false;
    }

    if (candidate.isFirstVersion()) {
      return candidate.hasNoPreviousReference();
    }

    const previousReference = candidate.getPreviousReference();

    if (!previousReference) {
      return false;
    }

    if (
      visitedExternalIdentifiers.some((externalIdentifier) =>
        externalIdentifier.isEqual(previousReference),
      )
    ) {
      return false;
    }

    visitedExternalIdentifiers.push(previousReference);

    const previousIdentity = await resolvePrevious(previousReference);

    if (!previousIdentity) {
      return false;
    }

    if (!candidate.isNextVersionAfter(previousIdentity)) {
      return false;
    }

    if (!candidate.keepsNetworksFrom(previousIdentity)) {
      return false;
    }

    return this.isValidChainFor(
      identityId,
      previousIdentity,
      resolvePrevious,
      visitedExternalIdentifiers,
    );
  }
}
