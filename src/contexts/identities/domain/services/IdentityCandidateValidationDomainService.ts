import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { Identity } from '../Identity';
import { IdentityExternalIdentifier } from '../value-objects/IdentityExternalIdentifier';

export default class IdentityCandidateValidationDomainService {
  private isValidPreviousLink(
    candidate: Identity,
    previousIdentity: Identity,
  ): boolean {
    return (
      candidate.isNextVersionAfter(previousIdentity) &&
      candidate.usesSameSigningKeyAs(previousIdentity) &&
      candidate.keepsNetworksFrom(previousIdentity)
    );
  }

  public isValidFor(identityId: IdentityId, candidate: Identity): boolean {
    return candidate.isIdentifiedBy(identityId);
  }

  public async isValidChainFor(
    identityId: IdentityId,
    candidate: Identity,
    resolvePrevious: (
      externalIdentifier: IdentityExternalIdentifier,
    ) => Promise<Identity | undefined>,
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

    if (!this.isValidPreviousLink(candidate, previousIdentity)) {
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
