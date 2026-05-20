import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';

import { CallScope } from '../../domain/CallScope';

export class ResolvedCallScope {
  constructor(
    public readonly networkId: NetworkId,
    public readonly participantIds: IdentityId[],
    public readonly scope: CallScope,
  ) {}
}
