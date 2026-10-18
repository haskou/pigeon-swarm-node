import { NodeBlockSourceNotFoundError } from '../../domain/errors/NodeBlockSourceNotFoundError';
import NodeBlockSourceRepository from '../../domain/repositories/NodeBlockSourceRepository';
import NodeBlockPolicy from '../../domain/services/NodeBlockPolicy';
import NodeOwnerWriteHolder from '../hold-owner-write/NodeOwnerWriteHolder';
import { NodeOwnerWriteHolderMessage } from '../hold-owner-write/messages/NodeOwnerWriteHolderMessage';
import { NodeBlockSourceRemoverMessage } from './messages/NodeBlockSourceRemoverMessage';

/** Stops following a source; everything it applied stops applying at once. */
export default class NodeBlockSourceRemover {
  constructor(
    private readonly repository: NodeBlockSourceRepository,
    private readonly policy: NodeBlockPolicy,
    private readonly ownerWrites: NodeOwnerWriteHolder,
  ) {}

  private async removeAdopted(
    message: NodeBlockSourceRemoverMessage,
  ): Promise<void> {
    if (!(await this.repository.exists(message.ownerIdentityId))) {
      throw new NodeBlockSourceNotFoundError();
    }

    await this.repository.delete(message.ownerIdentityId);
  }

  public async remove(message: NodeBlockSourceRemoverMessage): Promise<void> {
    await this.ownerWrites.hold(
      new NodeOwnerWriteHolderMessage(
        message.authenticatedIdentityId.valueOf(),
      ),
      () => this.removeAdopted(message),
    );

    await this.policy.reapply();
  }
}
