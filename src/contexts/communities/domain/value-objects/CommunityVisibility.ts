import { Enum } from '@haskou/value-objects';

const communityVisibilities = {
  PRIVATE: 'private',
  PUBLIC: 'public',
} as const;

export class CommunityVisibility extends Enum<string> {
  public static readonly PRIVATE = new CommunityVisibility(
    communityVisibilities.PRIVATE,
  );

  public static readonly PUBLIC = new CommunityVisibility(
    communityVisibilities.PUBLIC,
  );

  public getValues(): string[] {
    return Object.values(communityVisibilities);
  }

  public isPrivate(): boolean {
    return this.isEqual(CommunityVisibility.PRIVATE);
  }

  public isPublic(): boolean {
    return this.isEqual(CommunityVisibility.PUBLIC);
  }
}
