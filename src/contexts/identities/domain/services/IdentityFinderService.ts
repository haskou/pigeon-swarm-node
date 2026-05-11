import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { Identity } from '../Identity';
import { IdentityRepository } from '../repositories/IdentityRepository';
import { ProfileHandle } from '../value-objects/ProfileHandle';
import { IdentityResolutionDomainService } from './IdentityResolutionDomainService';

export default class IdentityFinderService {
  constructor(
    private readonly repository: IdentityRepository,
    private readonly resolver: IdentityResolutionDomainService,
  ) {}

  public async findById(identityId: IdentityId): Promise<Identity> {
    const candidates = await this.repository.findCandidatesById(identityId);
    const identity = this.resolver.resolve(identityId, candidates);

    return identity;
  }

  public async findByHandle(handle: ProfileHandle): Promise<Identity> {
    return this.repository.findByHandle(handle);
  }
}
