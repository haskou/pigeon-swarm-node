import { assert } from '@haskou/value-objects';

import { NodeBlockListMustBeSignedByCurrentOwnerError } from '../../domain/errors/NodeBlockListMustBeSignedByCurrentOwnerError';
import { NodeBlockListSignatureIsNotValidError } from '../../domain/errors/NodeBlockListSignatureIsNotValidError';
import { NodeBlockListVersionIsNotNewerError } from '../../domain/errors/NodeBlockListVersionIsNotNewerError';
import { Node } from '../../domain/Node';
import { NodeBlockList } from '../../domain/NodeBlockList';
import NodeBlockListRepository from '../../domain/repositories/NodeBlockListRepository';
import NodeRepository from '../../domain/repositories/NodeRepository';
import NodeBlockPolicy from '../../domain/services/NodeBlockPolicy';
import { NodeBlockListStorerMessage } from './messages/NodeBlockListStorerMessage';

export default class NodeBlockListStorer {
  constructor(
    private readonly nodes: NodeRepository,
    private readonly repository: NodeBlockListRepository,
    private readonly policy: NodeBlockPolicy,
  ) {}

  private async storeChecked(node: Node, list: NodeBlockList): Promise<void> {
    assert(
      node.isOwnedBy(list.getOwnerIdentityId()),
      new NodeBlockListMustBeSignedByCurrentOwnerError(),
    );
    assert(
      list.hasValidSignature(),
      new NodeBlockListSignatureIsNotValidError(),
    );

    const stored = await this.repository.findLocal();

    assert(
      stored.acceptsReplacement(list),
      new NodeBlockListVersionIsNotNewerError(),
    );

    await this.repository.saveLocal(list);
  }

  /**
   * Stores a newer list signed by the current owner; one store at a time, so
   * versions never go back, and no handover lands until the list is stored.
   */
  public async store(
    message: NodeBlockListStorerMessage,
  ): Promise<NodeBlockList> {
    await this.nodes.holdLocalNode((node) =>
      this.storeChecked(node, message.blockList),
    );

    await this.policy.reapply();

    return message.blockList;
  }
}
