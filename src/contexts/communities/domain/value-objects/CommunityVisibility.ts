import { Enum } from '@haskou/value-objects';

export type CommunityVisibilityValue = 'private' | 'public';

const visibilities: Record<string, CommunityVisibilityValue> = {
  PRIVATE: 'private',
  PUBLIC: 'public',
};

export class CommunityVisibility extends Enum<CommunityVisibilityValue> {
  public static readonly PRIVATE = new CommunityVisibility(
    visibilities.PRIVATE,
  );

  public static readonly PUBLIC = new CommunityVisibility(visibilities.PUBLIC);

  public getValues(): CommunityVisibilityValue[] {
    return Object.values(visibilities);
  }

  public isPrivate(): boolean {
    return this.isEqual(CommunityVisibility.PRIVATE);
  }

  public isPublic(): boolean {
    return this.isEqual(CommunityVisibility.PUBLIC);
  }
}
