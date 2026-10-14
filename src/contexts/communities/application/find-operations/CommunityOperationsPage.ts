import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';

import { CommunityOperation } from '../../domain/operations/CommunityOperation';
import { CommunityId } from '../../domain/value-objects/CommunityId';

/** One digest-ordered page of the operations a member replays the community from. */
export class CommunityOperationsPage {
  constructor(
    private readonly communityId: CommunityId,
    private readonly networkId: NetworkId,
    private readonly operations: CommunityOperation[],
  ) {}

  public getCommunityId(): CommunityId {
    return this.communityId;
  }

  public getNetworkId(): NetworkId {
    return this.networkId;
  }

  public getOperations(): CommunityOperation[] {
    return [...this.operations];
  }
}
