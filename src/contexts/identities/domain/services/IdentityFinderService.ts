import { IdentityId } from '@app/contexts/shared/domain/IdentityId';

import { Identity } from '../Identity';
import { IdentityRepository } from '../repositories/IdentityRepository';

// TODO: Test
export default class IdentityFinderService {
  constructor(private readonly repository: IdentityRepository) {}

  public async findById(identityId: IdentityId): Promise<Identity> {
    const identity = await this.repository.findById(identityId);

    return identity;
  }
}
