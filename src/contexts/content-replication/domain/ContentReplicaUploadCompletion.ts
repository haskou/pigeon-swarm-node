import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';

export class ContentReplicaUploadCompletion {
  constructor(
    private readonly claimedNetworkIds: NetworkId[],
    private readonly completedNetworkIds: NetworkId[],
  ) {}

  public pendingClaimedNetworkIds(): NetworkId[] {
    return this.completedNetworkIds.filter(
      (completedNetworkId) =>
        !this.claimedNetworkIds.some((claimedNetworkId) =>
          claimedNetworkId.isEqual(completedNetworkId),
        ),
    );
  }

  public hasPendingClaims(): boolean {
    return this.pendingClaimedNetworkIds().length > 0;
  }
}
