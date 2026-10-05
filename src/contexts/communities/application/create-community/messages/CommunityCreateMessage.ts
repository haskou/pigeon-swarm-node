import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';

import { CommunityOperation } from '../../../domain/operations/CommunityOperation';
import { CommunityId } from '../../../domain/value-objects/CommunityId';
import { CommunityOperationAction } from '../../../domain/value-objects/CommunityOperationAction';
import { CommunityOperationMutation } from '../../record-operation/CommunityOperationMutation';
import { CommunityOperationMutationPrimitives } from '../../record-operation/CommunityOperationMutationPrimitives';

export class CommunityCreateMessage {
  public readonly genesis: CommunityOperation;
  public readonly operation: CommunityOperationMutation;

  constructor(
    ownerIdentityId: string,
    networkId: string,
    nonce: string,
    name: string,
    description: string,
    operation: CommunityOperationMutationPrimitives,
    options: {
      autoJoinEnabled?: boolean;
      avatar?: string;
      banner?: string;
      discoverable?: boolean;
      visibility?: string;
    } = {},
  ) {
    const owner = new IdentityId(ownerIdentityId);
    const network = new NetworkId(networkId);

    this.operation = new CommunityOperationMutation(operation);
    this.genesis = this.operation.build({
      action: CommunityOperationAction.COMMUNITY_CREATED,
      args: {
        autoJoinEnabled: options.autoJoinEnabled ?? false,
        description,
        discoverable: options.discoverable ?? true,
        name,
        nonce,
        visibility: options.visibility ?? 'private',
        ...(options.avatar ? { avatar: options.avatar } : {}),
        ...(options.banner ? { banner: options.banner } : {}),
      },
      author: owner,
      communityId: CommunityId.derive(
        network.valueOf(),
        owner.valueOf(),
        nonce,
      ),
      networkId: network,
    });
  }
}
