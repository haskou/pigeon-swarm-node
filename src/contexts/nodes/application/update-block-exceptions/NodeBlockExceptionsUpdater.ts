import { NodeBlockEntries } from '../../domain/NodeBlockEntries';
import NodeBlockExceptionsRepository from '../../domain/repositories/NodeBlockExceptionsRepository';
import NodeBlockPolicy from '../../domain/services/NodeBlockPolicy';
import { NodeBlockExceptionsUpdaterMessage } from './messages/NodeBlockExceptionsUpdaterMessage';

/** Replaces the identities and nodes adopted lists may never block. */
export default class NodeBlockExceptionsUpdater {
  constructor(
    private readonly repository: NodeBlockExceptionsRepository,
    private readonly policy: NodeBlockPolicy,
  ) {}

  public async update(
    message: NodeBlockExceptionsUpdaterMessage,
  ): Promise<NodeBlockEntries> {
    await this.policy.change(() => this.repository.save(message.exceptions));

    return message.exceptions;
  }
}
