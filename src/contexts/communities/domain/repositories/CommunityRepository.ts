import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { Community } from '../Community';
import { CommunityId } from '../value-objects/CommunityId';

export default abstract class CommunityRepository {
  public abstract delete(community: Community): Promise<void>;
  public abstract findDiscoverable(options: {
    networkId?: string;
    query?: string;
  }): Promise<Community[]>;

  public abstract findById(id: CommunityId): Promise<Community | undefined>;
  public abstract findByMember(identityId: IdentityId): Promise<Community[]>;
  public abstract findSyncable(): Promise<Community[]>;
  public abstract save(community: Community): Promise<void>;
}
