import { NodeBlockEntries } from '../../domain/NodeBlockEntries';
import NodeBlockExceptionsRepository from '../../domain/repositories/NodeBlockExceptionsRepository';
import NodeBlockPolicy from '../../domain/services/NodeBlockPolicy';
import NodeOwnerWriteHolder from '../hold-owner-write/NodeOwnerWriteHolder';
import { NodeOwnerWriteHolderMessage } from '../hold-owner-write/messages/NodeOwnerWriteHolderMessage';
import { NodeBlockExceptionsUpdaterMessage } from './messages/NodeBlockExceptionsUpdaterMessage';

/** Replaces the identities and nodes adopted lists may never block. */
export default class NodeBlockExceptionsUpdater {
  constructor(
    private readonly repository: NodeBlockExceptionsRepository,
    private readonly policy: NodeBlockPolicy,
    private readonly ownerWrites: NodeOwnerWriteHolder,
  ) {}

  public async update(
    message: NodeBlockExceptionsUpdaterMessage,
  ): Promise<NodeBlockEntries> {
    await this.ownerWrites.hold(
      new NodeOwnerWriteHolderMessage(
        message.authenticatedIdentityId.valueOf(),
      ),
      () => this.repository.save(message.exceptions),
    );

    await this.policy.reapply();

    return message.exceptions;
  }
}
