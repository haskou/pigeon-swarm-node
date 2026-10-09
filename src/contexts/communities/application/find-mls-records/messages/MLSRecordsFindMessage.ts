import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { CommunityId } from '../../../domain/value-objects/CommunityId';
import { MLSRecordKind } from '../../../domain/value-objects/MLSRecordKind';

export class MLSRecordsFindMessage {
  public readonly actorIdentityId: IdentityId;
  public readonly communityId: CommunityId;
  public readonly kind?: MLSRecordKind;

  constructor(
    actorIdentityId: string,
    communityId: string,
    public readonly groupId: string,
    kind?: string,
    public readonly afterEpoch?: number,
  ) {
    this.actorIdentityId = new IdentityId(actorIdentityId);
    this.communityId = new CommunityId(communityId);
    this.kind = kind ? new MLSRecordKind(kind) : undefined;
  }
}
