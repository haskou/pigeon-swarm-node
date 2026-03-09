import { IdentityId } from '@app/contexts/shared/domain/IdentityId';
import { IdentityRepository } from '../repositories/IdentityRepository';
import { Identity } from '../Identity';

// TODO: Test
export default class IdentityFinderService {
  constructor(private readonly repository: IdentityRepository) {}

  public async findById(identityId: IdentityId): Promise<Identity> {
    const identity = await this.repository.findById(identityId);

    return identity;
  }
}
