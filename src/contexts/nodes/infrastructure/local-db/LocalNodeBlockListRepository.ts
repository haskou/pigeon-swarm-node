import { NodeBlockList } from '@app/contexts/nodes/domain/NodeBlockList';
import { NodeBlockListPrimitives } from '@app/contexts/nodes/domain/NodeBlockListPrimitives';
import { NodeBlocks } from '@app/contexts/nodes/domain/NodeBlocks';
import { NoNodeBlocks } from '@app/contexts/nodes/domain/NoNodeBlocks';
import NodeBlockListRepository from '@app/contexts/nodes/domain/repositories/NodeBlockListRepository';
import { ClearedNodeOwnerSetting } from '@app/contexts/nodes/domain/value-objects/ClearedNodeOwnerSetting';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';

import { LocalNodeBlockListDocument } from './documents/LocalNodeBlockListDocument';

export default class LocalNodeBlockListRepository extends NodeBlockListRepository {
  private static readonly NAMESPACE = 'node_block_list';
  private static readonly LOCAL_ID = 'local';

  constructor(private readonly database: EmbeddedLocalDatabase) {
    super();
  }

  public async findLocal(): Promise<NodeBlocks> {
    const document = await this.database.findOne(
      LocalNodeBlockListRepository.NAMESPACE,
      LocalNodeBlockListRepository.LOCAL_ID,
    );

    if (!document) {
      return new NoNodeBlocks();
    }

    return NodeBlockList.fromPrimitives(
      document.blockList as NodeBlockListPrimitives,
    );
  }

  public async saveLocal(list: NodeBlockList): Promise<void> {
    const document: LocalNodeBlockListDocument = {
      _id: LocalNodeBlockListRepository.LOCAL_ID,
      blockList: list.toPrimitives(),
    };

    await this.database.save(
      LocalNodeBlockListRepository.NAMESPACE,
      LocalNodeBlockListRepository.LOCAL_ID,
      document,
    );
  }

  public async resetOwnerSettings(): Promise<ClearedNodeOwnerSetting[]> {
    const blocks = await this.findLocal();

    if (!(blocks instanceof NodeBlockList)) {
      return [];
    }

    await this.database.delete(
      LocalNodeBlockListRepository.NAMESPACE,
      LocalNodeBlockListRepository.LOCAL_ID,
    );

    return [ClearedNodeOwnerSetting.ownBlockList(blocks)];
  }
}
