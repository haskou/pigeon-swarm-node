import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';

import { CommunityOperation } from '../../domain/operations/CommunityOperation';
import { CommunityId } from '../../domain/value-objects/CommunityId';

/** One digest-ordered page of the operations a member replays the community from. */
export class CommunityOperationsPage {
  constructor(
    private readonly communityId: CommunityId,
    private readonly networkId: NetworkId,
    private readonly operations: CommunityOperation[],
    private readonly limit: number,
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

  /** The digest to read after next: the last operation of a full page, otherwise none. */
  public getNextPosition(): string | undefined {
    return this.operations.length === this.limit
      ? this.operations[this.operations.length - 1].getHash()
      : undefined;
  }
}
