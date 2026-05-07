import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { Identity } from '../Identity';

export class IdentityCandidateValidationDomainService {
  public isValidFor(identityId: IdentityId, candidate: Identity): boolean {
    return candidate.toPrimitives().id === identityId.valueOf();
  }
}
