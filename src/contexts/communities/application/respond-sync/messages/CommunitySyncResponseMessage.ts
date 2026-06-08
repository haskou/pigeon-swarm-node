import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';

import { CommunityId } from '../../../domain/value-objects/CommunityId';

export class CommunitySyncResponseMessage {
  public readonly communityId: CommunityId;
  public readonly networkId: NetworkId;

  constructor(
    communityId: string,
    networkId: string,
    public readonly requestId?: string,
  ) {
    this.communityId = new CommunityId(communityId);
    this.networkId = new NetworkId(networkId);
  }
}
