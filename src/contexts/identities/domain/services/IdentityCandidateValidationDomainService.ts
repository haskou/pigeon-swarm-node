import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { Identity } from '../Identity';
import { IdentityExternalIdentifier } from '../value-objects/IdentityExternalIdentifier';

export default class IdentityCandidateValidationDomainService {
  private static readonly MAX_CHAIN_DEPTH = 256;

  private isValidPreviousLink(
    candidate: Identity,
    previousIdentity: Identity,
  ): boolean {
    return (
      candidate.isNextVersionAfter(previousIdentity) &&
      candidate.usesSameGenesisAuthorizationAs(previousIdentity) &&
      candidate.doesNotRollbackAuthorizationFrom(previousIdentity) &&
      candidate.keepsNetworksFrom(previousIdentity)
    );
  }

  private isValidGenesis(candidate: Identity): boolean {
    return (
      candidate.hasNoPreviousReference() &&
      candidate.hasInitialAuthorizationRevision()
    );
  }

  private hasVisitedOrExceededDepth(
    externalIdentifier: IdentityExternalIdentifier,
    visitedExternalIdentifiers: IdentityExternalIdentifier[],
  ): boolean {
    if (
      visitedExternalIdentifiers.length >=
      IdentityCandidateValidationDomainService.MAX_CHAIN_DEPTH
    ) {
      return true;
    }

    return visitedExternalIdentifiers.some((visited) =>
      visited.isEqual(externalIdentifier),
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
      return this.isValidGenesis(candidate);
    }

    const previousReference = candidate.getPreviousReference();

    if (!previousReference) {
      return false;
    }

    if (
      this.hasVisitedOrExceededDepth(
        previousReference,
        visitedExternalIdentifiers,
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
