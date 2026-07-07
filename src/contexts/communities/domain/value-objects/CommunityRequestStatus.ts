import { Enum } from '@haskou/value-objects';

const communityRequestStatuses = {
  ACCEPTED: 'accepted',
  DECLINED: 'declined',
  PENDING: 'pending',
} as const;

export class CommunityRequestStatus extends Enum<string> {
  public static readonly ACCEPTED = new CommunityRequestStatus(
    communityRequestStatuses.ACCEPTED,
  );

  public static readonly DECLINED = new CommunityRequestStatus(
    communityRequestStatuses.DECLINED,
  );

  public static readonly PENDING = new CommunityRequestStatus(
    communityRequestStatuses.PENDING,
  );

  public getValues(): string[] {
    return Object.values(communityRequestStatuses);
  }

  public isAccepted(): boolean {
    return this.isEqual(CommunityRequestStatus.ACCEPTED);
  }

  public isDeclined(): boolean {
    return this.isEqual(CommunityRequestStatus.DECLINED);
  }

  public isPending(): boolean {
    return this.isEqual(CommunityRequestStatus.PENDING);
  }

  public isResolution(): boolean {
    return this.isAccepted() || this.isDeclined();
  }
}
