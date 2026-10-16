import { NodeBlockEntries } from '@app/contexts/nodes/domain/NodeBlockEntries';
import NodeBlockExceptionsRepository from '@app/contexts/nodes/domain/repositories/NodeBlockExceptionsRepository';
import { ClearedNodeOwnerSetting } from '@app/contexts/nodes/domain/value-objects/ClearedNodeOwnerSetting';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';

import { LocalNodeBlockExceptionsDocument } from './documents/LocalNodeBlockExceptionsDocument';

export default class LocalNodeBlockExceptionsRepository extends NodeBlockExceptionsRepository {
  private static readonly NAMESPACE = 'node_block_exceptions';
  private static readonly LOCAL_ID = 'local';

  constructor(private readonly database: EmbeddedLocalDatabase) {
    super();
  }

  public async find(): Promise<NodeBlockEntries> {
    const document = await this.database.findOne(
      LocalNodeBlockExceptionsRepository.NAMESPACE,
      LocalNodeBlockExceptionsRepository.LOCAL_ID,
    );

    if (!document) {
      return NodeBlockEntries.none();
    }

    return NodeBlockEntries.fromPrimitives(
      (document as LocalNodeBlockExceptionsDocument).exceptions,
    );
  }

  public async save(exceptions: NodeBlockEntries): Promise<void> {
    const document: LocalNodeBlockExceptionsDocument = {
      _id: LocalNodeBlockExceptionsRepository.LOCAL_ID,
      exceptions: exceptions.toPrimitives(),
    };

    await this.database.save(
      LocalNodeBlockExceptionsRepository.NAMESPACE,
      LocalNodeBlockExceptionsRepository.LOCAL_ID,
      document,
    );
  }

  public async resetOwnerSettings(): Promise<ClearedNodeOwnerSetting[]> {
    const exceptions = await this.find();

    if (exceptions.count() === 0) {
      return [];
    }

    await this.database.delete(
      LocalNodeBlockExceptionsRepository.NAMESPACE,
      LocalNodeBlockExceptionsRepository.LOCAL_ID,
    );

    return [ClearedNodeOwnerSetting.blockExceptions(exceptions)];
  }
}
