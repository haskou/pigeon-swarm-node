import { Enum } from '@haskou/value-objects';

export type CommunityRequestStatusValue = 'accepted' | 'declined' | 'pending';

const statuses: Record<string, CommunityRequestStatusValue> = {
  ACCEPTED: 'accepted',
  DECLINED: 'declined',
  PENDING: 'pending',
};

export class CommunityRequestStatus extends Enum<CommunityRequestStatusValue> {
  public static readonly ACCEPTED = new CommunityRequestStatus(
    statuses.ACCEPTED,
  );

  public static readonly DECLINED = new CommunityRequestStatus(
    statuses.DECLINED,
  );

  public static readonly PENDING = new CommunityRequestStatus(statuses.PENDING);

  public getValues(): CommunityRequestStatusValue[] {
    return Object.values(statuses);
  }

  public isAccepted(): boolean {
    return this.isEqual(CommunityRequestStatus.ACCEPTED);
  }

  public isPending(): boolean {
    return this.isEqual(CommunityRequestStatus.PENDING);
  }
}
