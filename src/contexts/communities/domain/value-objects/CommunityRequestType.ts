import { Enum } from '@haskou/value-objects';

export type CommunityRequestTypeValue = 'invitation' | 'request';

const types: Record<string, CommunityRequestTypeValue> = {
  INVITATION: 'invitation',
  REQUEST: 'request',
};

export class CommunityRequestType extends Enum<CommunityRequestTypeValue> {
  public static readonly INVITATION = new CommunityRequestType(
    types.INVITATION,
  );

  public static readonly REQUEST = new CommunityRequestType(types.REQUEST);

  public getValues(): CommunityRequestTypeValue[] {
    return Object.values(types);
  }

  public isInvitation(): boolean {
    return this.isEqual(CommunityRequestType.INVITATION);
  }

  public isRequest(): boolean {
    return this.isEqual(CommunityRequestType.REQUEST);
  }
}
