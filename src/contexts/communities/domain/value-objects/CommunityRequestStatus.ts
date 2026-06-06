import { Enum } from '@haskou/value-objects';

import { communityRequestStatuses } from './types/CommunityRequestStatuses';
import { CommunityRequestStatusValue } from './types/CommunityRequestStatusValue';

export { CommunityRequestStatusValue } from './types/CommunityRequestStatusValue';

export class CommunityRequestStatus extends Enum<CommunityRequestStatusValue> {
  public static readonly ACCEPTED = new CommunityRequestStatus(
    communityRequestStatuses.ACCEPTED,
  );

  public static readonly DECLINED = new CommunityRequestStatus(
    communityRequestStatuses.DECLINED,
  );

  public static readonly PENDING = new CommunityRequestStatus(
    communityRequestStatuses.PENDING,
  );

  public getValues(): CommunityRequestStatusValue[] {
    return Object.values(communityRequestStatuses);
  }

  public isAccepted(): boolean {
    return this.isEqual(CommunityRequestStatus.ACCEPTED);
  }

  public isPending(): boolean {
    return this.isEqual(CommunityRequestStatus.PENDING);
  }
}
