import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';

import { ContentId } from '../../../domain/value-objects/ContentId';
import { ContentReplicationContext } from '../../../domain/value-objects/ContentReplicationContext';
import { ContentSize } from '../../../domain/value-objects/ContentSize';

export class ContentReplicationRegisterMessage {
  constructor(
    private readonly identityId: string,
    private readonly cid: string,
    private readonly networkId: string,
    private readonly context: string,
    private readonly sizeBytes: number,
    private readonly mutation: unknown,
  ) {}

  public getCid(): ContentId {
    return new ContentId(this.cid);
  }

  public getContext(): ContentReplicationContext {
    return new ContentReplicationContext(this.context);
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

  public getSizeBytes(): ContentSize {
    return new ContentSize(this.sizeBytes);
  }
}
