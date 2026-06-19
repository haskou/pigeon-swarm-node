import { Enum } from '@haskou/value-objects';

const communityRequestTypes = {
  INVITATION: 'invitation',
  REQUEST: 'request',
} as const;

export class CommunityRequestType extends Enum<string> {
  public static readonly INVITATION = new CommunityRequestType(
    communityRequestTypes.INVITATION,
  );

  public static readonly REQUEST = new CommunityRequestType(
    communityRequestTypes.REQUEST,
  );

  public getValues(): string[] {
    return Object.values(communityRequestTypes);
  }

  public isInvitation(): boolean {
    return this.isEqual(CommunityRequestType.INVITATION);
  }

  public isRequest(): boolean {
    return this.isEqual(CommunityRequestType.REQUEST);
  }
}
