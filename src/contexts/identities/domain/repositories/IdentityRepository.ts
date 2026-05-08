import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { Identity } from '../Identity';

export interface IdentityRepository {
  save(identity: Identity): Promise<void>;
  findById(id: IdentityId): Promise<Identity>;
  findCandidatesById(id: IdentityId): Promise<Identity[]>;
}
