import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { Identity } from '../Identity';
import IdentityRepository from '../repositories/IdentityRepository';
import IdentityResolutionDomainService from './IdentityResolutionDomainService';

export default class IdentityRegistrarService {
  constructor(
    private readonly repository: IdentityRepository,
    private readonly resolver: IdentityResolutionDomainService,
  ) {}

  public async register(identityId: IdentityId): Promise<Identity> {
    const candidates = await this.repository.findCandidatesById(identityId);

    return this.resolver.resolve(identityId, candidates);
  }
}
