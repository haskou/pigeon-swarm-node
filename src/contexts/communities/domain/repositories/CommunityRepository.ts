import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { Community } from '../Community';
import { CommunityId } from '../value-objects/CommunityId';

export interface CommunityRepository {
  findById(id: CommunityId): Promise<Community | undefined>;
  findByMember(identityId: IdentityId): Promise<Community[]>;
  save(community: Community): Promise<void>;
}
