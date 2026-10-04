import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { PublicMutationRecord } from '@app/contexts/public-mutations/domain/PublicMutationRecord';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { OrbitDBHeadIndex } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBHeadIndex';

import OrbitDBReplicatedStateRegistry from '../../../shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import StickerPackRepository from '../../domain/repositories/StickerPackRepository';
import { StickerPack } from '../../domain/StickerPack';
import { StickerPackId } from '../../domain/value-objects/StickerPackId';
import { OrbitDBStickerPackDocument } from './documents/OrbitDBStickerPackDocument';

export default class OrbitDBStickerPackRepository extends StickerPackRepository {
  private static readonly HEAD_PREFIX = 'sticker-pack:';

  private readonly packIndex: OrbitDBHeadIndex<OrbitDBStickerPackDocument>;

  constructor(private readonly registry: OrbitDBReplicatedStateRegistry) {
    super();
    this.packIndex = new OrbitDBHeadIndex(this.registry, {
      collectionName: 'stickerPacks',
      documentFromRecord: (record) =>
        this.isDocument(record) ? record : undefined,
      recordId: (record) =>
        typeof record.id === 'string' ? record.id : undefined,
      shouldReplace: (current, candidate) =>
        PublicMutationRecord.replaces(current, candidate) ?? true,
    });
  }

  private isDocument(
    document: Record<string, unknown>,
  ): document is OrbitDBStickerPackDocument {
    return (
      document.removed !== true &&
      document.scopeType === 'sticker_pack' &&
      typeof document.id === 'string' &&
      typeof document.createdAt === 'number' &&
      typeof document.name === 'string' &&
      typeof document.ownerIdentityId === 'string' &&
      Array.isArray(document.stickers) &&
      typeof document.updatedAt === 'number'
    );
  }

  private headKey(id: StickerPackId | string): string {
    return `${OrbitDBStickerPackRepository.HEAD_PREFIX}${id.valueOf()}`;
  }

  public findAll(): Promise<StickerPack[]> {
    return Promise.resolve(
      this.packIndex
        .deduplicate(
          this.packIndex.cachedByPrefix(
            OrbitDBStickerPackRepository.HEAD_PREFIX,
          ),
        )
        .sort((left, right) => right.updatedAt - left.updatedAt)
        .map((document) => StickerPack.fromPrimitives(document)),
    );
  }

  public async findById(id: StickerPackId): Promise<StickerPack | undefined> {
    const document = ((await this.packIndex.find(this.headKey(id))) ?? []).find(
      (candidate) => candidate.id === id.valueOf(),
    );

    return document ? StickerPack.fromPrimitives(document) : undefined;
  }

  public async findByOwner(
    ownerIdentityId: IdentityId,
  ): Promise<StickerPack[]> {
    return (await this.findAll()).filter(
      (pack) =>
        pack.toPrimitives().ownerIdentityId === ownerIdentityId.valueOf(),
    );
  }

  public async save(
    pack: StickerPack,
    proof: PublicMutationProof,
  ): Promise<void> {
    const primitives = pack.toPrimitives();
    const document = PublicMutationRecord.withProof(
      { ...primitives, scopeType: 'sticker_pack' },
      proof,
    );
    const key = this.headKey(primitives.id);

    PublicMutationRecord.assertNotStale(
      (await this.packIndex.findRecords(key)).filter(
        (stored) => stored.id === primitives.id,
      ),
      document,
    );
    await this.registry.putDocument('stickerPacks', document);
    await this.packIndex.putRecord(
      key,
      { id: key, ownerIdentityId: primitives.ownerIdentityId },
      document,
    );
  }
}
