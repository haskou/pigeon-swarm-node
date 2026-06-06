import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { Identity } from '../Identity';
import { IdentityExternalIdentifier } from '../value-objects/IdentityExternalIdentifier';
import { ProfileHandle } from '../value-objects/ProfileHandle';
import { IdentityCandidate } from './types/IdentityCandidate';

export { IdentityCandidate } from './types/IdentityCandidate';

export interface IdentityRepository {
  save(identity: Identity): Promise<void>;
  findById(id: IdentityId): Promise<Identity>;
  findCandidateReferencesById(id: IdentityId): Promise<IdentityCandidate[]>;
  findByHandle(handle: ProfileHandle): Promise<Identity>;
  findByExternalIdentifier(
    externalIdentifier: IdentityExternalIdentifier,
  ): Promise<Identity | undefined>;
  findCandidatesById(id: IdentityId): Promise<Identity[]>;
}
