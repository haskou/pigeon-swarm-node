import { Enum } from '@haskou/value-objects';

import { communityRequestTypes } from './types/CommunityRequestTypes';
import { CommunityRequestTypeValue } from './types/CommunityRequestTypeValue';

export { CommunityRequestTypeValue } from './types/CommunityRequestTypeValue';

export class CommunityRequestType extends Enum<CommunityRequestTypeValue> {
  public static readonly INVITATION = new CommunityRequestType(
    communityRequestTypes.INVITATION,
  );

  public static readonly REQUEST = new CommunityRequestType(
    communityRequestTypes.REQUEST,
  );

  public getValues(): CommunityRequestTypeValue[] {
    return Object.values(communityRequestTypes);
  }

  public isInvitation(): boolean {
    return this.isEqual(CommunityRequestType.INVITATION);
  }

  public isRequest(): boolean {
    return this.isEqual(CommunityRequestType.REQUEST);
  }
}
