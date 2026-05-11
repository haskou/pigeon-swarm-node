import { DomainError } from '@haskou/value-objects';

import { IdentityId } from '../../../shared/domain/value-objects/IdentityId';

export class KeychainNotFoundError extends DomainError {
  constructor(ownerIdentityId: IdentityId) {
    super(`Keychain for identity ${ownerIdentityId.valueOf()} not found`);
  }
}
