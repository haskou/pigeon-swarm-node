import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { Identity } from '../Identity';
import { IdentityExternalIdentifier } from '../value-objects/IdentityExternalIdentifier';

export type PreviousIdentityResolver = (
  externalIdentifier: IdentityExternalIdentifier,
) => Promise<Identity | undefined>;

export class IdentityCandidateValidationDomainService {
  private keepsPreviousNetworks(
    candidate: Identity,
    previousIdentity: Identity,
  ): boolean {
    const candidateNetworks = candidate.toPrimitives().networks;

    return previousIdentity
      .toPrimitives()
      .networks.every((networkId) => candidateNetworks.includes(networkId));
  }

  public isValidFor(identityId: IdentityId, candidate: Identity): boolean {
    return candidate.toPrimitives().id === identityId.valueOf();
  }

  public async isValidChainFor(
    identityId: IdentityId,
    candidate: Identity,
    resolvePrevious: PreviousIdentityResolver,
    visitedExternalIdentifiers: Set<string> = new Set(),
  ): Promise<boolean> {
    if (!this.isValidFor(identityId, candidate)) {
      return false;
    }

    const primitives = candidate.toPrimitives();

    if (primitives.version === 1) {
      return primitives.previousIdentityExternalIdentifier === undefined;
    }

    if (!primitives.previousIdentityExternalIdentifier) {
      return false;
    }

    if (
      visitedExternalIdentifiers.has(
        primitives.previousIdentityExternalIdentifier,
      )
    ) {
      return false;
    }

    visitedExternalIdentifiers.add(
      primitives.previousIdentityExternalIdentifier,
    );

    const previousIdentity = await resolvePrevious(
      new IdentityExternalIdentifier(
        primitives.previousIdentityExternalIdentifier,
      ),
    );

    if (!previousIdentity) {
      return false;
    }

    const previousPrimitives = previousIdentity.toPrimitives();

    if (previousPrimitives.version !== primitives.version - 1) {
      return false;
    }

    if (!this.keepsPreviousNetworks(candidate, previousIdentity)) {
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
