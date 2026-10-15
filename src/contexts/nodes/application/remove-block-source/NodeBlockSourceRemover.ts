import { NodeBlockSourceNotFoundError } from '../../domain/errors/NodeBlockSourceNotFoundError';
import NodeBlockSourceRepository from '../../domain/repositories/NodeBlockSourceRepository';
import NodeBlockPolicy from '../../domain/services/NodeBlockPolicy';
import { NodeBlockSourceRemoverMessage } from './messages/NodeBlockSourceRemoverMessage';

/** Stops following a source; everything it applied stops applying at once. */
export default class NodeBlockSourceRemover {
  constructor(
    private readonly repository: NodeBlockSourceRepository,
    private readonly policy: NodeBlockPolicy,
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
    await this.policy.change(() => this.removeAdopted(message));
  }
}
