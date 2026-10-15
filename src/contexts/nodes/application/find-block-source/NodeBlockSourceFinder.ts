import { NodeBlockSource } from '../../domain/NodeBlockSource';
import NodeBlockSourceRepository from '../../domain/repositories/NodeBlockSourceRepository';
import { NodeBlockSourceFinderMessage } from './messages/NodeBlockSourceFinderMessage';

/** One adopted source, with what it still has waiting for review. */
export default class NodeBlockSourceFinder {
  constructor(private readonly repository: NodeBlockSourceRepository) {}

  public async find(
    message: NodeBlockSourceFinderMessage,
  ): Promise<NodeBlockSource> {
    return this.repository.find(message.ownerIdentityId);
  }
}
