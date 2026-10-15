import { assert } from '@haskou/value-objects';

import { NodeBlockListMustBeSignedByCurrentOwnerError } from '../../domain/errors/NodeBlockListMustBeSignedByCurrentOwnerError';
import { NodeBlockListSignatureIsNotValidError } from '../../domain/errors/NodeBlockListSignatureIsNotValidError';
import { NodeBlockListVersionIsNotNewerError } from '../../domain/errors/NodeBlockListVersionIsNotNewerError';
import { NodeBlockList } from '../../domain/NodeBlockList';
import NodeBlockListRepository from '../../domain/repositories/NodeBlockListRepository';
import NodeBlockPolicy from '../../domain/services/NodeBlockPolicy';
import NodeLoaderService from '../../domain/services/NodeLoaderService';
import { NodeBlockListStorerMessage } from './messages/NodeBlockListStorerMessage';

export default class NodeBlockListStorer {
  private storing: Promise<void> = Promise.resolve();

  constructor(
    private readonly loader: NodeLoaderService,
    private readonly repository: NodeBlockListRepository,
    private readonly policy: NodeBlockPolicy,
  ) {}

  private async storeInOrder(list: NodeBlockList): Promise<void> {
    const node = await this.loader.loadNode();

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
    await this.policy.replace(list, node);
  }

  /** Stores a newer list signed by the current owner; one store at a time, so versions never go back. */
  public async store(
    message: NodeBlockListStorerMessage,
  ): Promise<NodeBlockList> {
    const stored = this.storing.then(() =>
      this.storeInOrder(message.blockList),
    );

    this.storing = stored.catch((): void => undefined);
    await stored;

    return message.blockList;
  }
}
