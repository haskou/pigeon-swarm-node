import { Enum } from '@haskou/value-objects';

import { communityVisibilities } from './types/CommunityVisibilities';
import { CommunityVisibilityValue } from './types/CommunityVisibilityValue';

export { CommunityVisibilityValue } from './types/CommunityVisibilityValue';

export class CommunityVisibility extends Enum<CommunityVisibilityValue> {
  public static readonly PRIVATE = new CommunityVisibility(
    communityVisibilities.PRIVATE,
  );

  public static readonly PUBLIC = new CommunityVisibility(
    communityVisibilities.PUBLIC,
  );

  public getValues(): CommunityVisibilityValue[] {
    return Object.values(communityVisibilities);
  }

  public isPrivate(): boolean {
    return this.isEqual(CommunityVisibility.PRIVATE);
  }

  public isPublic(): boolean {
    return this.isEqual(CommunityVisibility.PUBLIC);
  }
}
