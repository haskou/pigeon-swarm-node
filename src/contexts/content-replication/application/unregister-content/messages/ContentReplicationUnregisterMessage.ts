import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';

import { ContentId } from '../../../domain/value-objects/ContentId';

export class ContentReplicationUnregisterMessage {
  constructor(
    private readonly identityId: string,
    private readonly cid: string,
    private readonly networkId: string,
    private readonly mutation: unknown,
  ) {}

  public getCid(): ContentId {
    return new ContentId(this.cid);
  }

  public getIdentityId(): IdentityId {
    return new IdentityId(this.identityId);
  }

  public getNetworkId(): NetworkId {
    return new NetworkId(this.networkId);
  }

  public getProof(): PublicMutationProof {
    return PublicMutationProof.fromPrimitives(this.mutation);
  }
}
