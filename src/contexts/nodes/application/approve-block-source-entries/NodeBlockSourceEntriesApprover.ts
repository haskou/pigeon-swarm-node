import { NodeBlockSource } from '../../domain/NodeBlockSource';
import NodeBlockSourceRepository from '../../domain/repositories/NodeBlockSourceRepository';
import NodeBlockPolicy from '../../domain/services/NodeBlockPolicy';
import { NodeBlockSourceEntriesApproverMessage } from './messages/NodeBlockSourceEntriesApproverMessage';

/**
 * Applies pending entries of a source the owner reviewed: all of them or the
 * chosen ones. The owner names the version they reviewed, so a list that
 * changed meanwhile is never approved unseen.
 */
export default class NodeBlockSourceEntriesApprover {
  constructor(
    private readonly repository: NodeBlockSourceRepository,
    private readonly policy: NodeBlockPolicy,
  ) {}

  private async approveReviewed(
    message: NodeBlockSourceEntriesApproverMessage,
  ): Promise<NodeBlockSource> {
    const source = await this.repository.find(message.ownerIdentityId);

    if (message.entries) {
      source.approve(message.version, message.entries);
    } else {
      source.approveAll(message.version);
    }

    await this.repository.save(source);

    return source;
  }

  public async approve(
    message: NodeBlockSourceEntriesApproverMessage,
  ): Promise<NodeBlockSource> {
    return this.policy.change(() => this.approveReviewed(message));
  }
}
