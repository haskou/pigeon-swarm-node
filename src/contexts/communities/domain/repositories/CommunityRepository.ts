import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';

import { Community } from '../Community';
import { CommunityId } from '../value-objects/CommunityId';

export interface CommunityRepository {
  delete(community: Community): Promise<void>;
  findDiscoverable(options: {
    networkId?: string;
    query?: string;
  }): Promise<Community[]>;
  findById(id: CommunityId): Promise<Community | undefined>;
  findByMember(identityId: IdentityId): Promise<Community[]>;
  findByNetworkId(networkId: NetworkId, limit?: number): Promise<Community[]>;
  save(community: Community): Promise<void>;
}
