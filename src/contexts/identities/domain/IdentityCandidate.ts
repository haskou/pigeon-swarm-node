import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { Identity } from './Identity';
import { IdentityExternalIdentifier } from './value-objects/IdentityExternalIdentifier';
import { ProfileHandle } from './value-objects/ProfileHandle';

export class IdentityCandidate {
  constructor(
    private readonly externalIdentifier: IdentityExternalIdentifier,
    private readonly identity: Identity,
  ) {}

  public getExternalIdentifier(): IdentityExternalIdentifier {
    return this.externalIdentifier;
  }

  public getIdentity(): Identity {
    return this.identity;
  }

  public hasHandle(handle: ProfileHandle): boolean {
    return this.identity.hasHandle(handle);
  }

  public isIdentifiedBy(identityId: IdentityId): boolean {
    return this.identity.isIdentifiedBy(identityId);
  }

  public isNewerThan(other: IdentityCandidate): boolean {
    return this.identity.isNewerThan(other.identity);
  }
}
