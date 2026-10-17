import { Enum } from '@haskou/value-objects';

const communityRequestTypes = {
  REQUEST: 'request',
} as const;

export class CommunityRequestType extends Enum<string> {
  public static readonly REQUEST = new CommunityRequestType(
    communityRequestTypes.REQUEST,
  );

  public getValues(): string[] {
    return Object.values(communityRequestTypes);
  }

  public isRequest(): boolean {
    return this.isEqual(CommunityRequestType.REQUEST);
  }
}
