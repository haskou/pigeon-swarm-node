import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';
import { Timestamp } from '@haskou/value-objects';

import { PrivateBlobNotFoundError } from '../../domain/errors/PrivateBlobNotFoundError';
import { PrivateBlob } from '../../domain/PrivateBlob';
import { PrivateBlobPrimitivesShape } from '../../domain/PrivateBlobPrimitivesShape';
import PrivateBlobRepository from '../../domain/repositories/PrivateBlobRepository';
import { PrivateBlobId } from '../../domain/value-objects/PrivateBlobId';

export default class LocalPrivateBlobRepository extends PrivateBlobRepository {
  private static readonly BLOBS = 'private_blobs';

  constructor(private readonly database: EmbeddedLocalDatabase) {
    super();
  }

  private toBlob(document: Record<string, unknown>): PrivateBlob {
    const primitives = { ...document };

    delete primitives._id;

    if (!PrivateBlobPrimitivesShape.isPrivateBlobPrimitives(primitives)) {
      throw new Error('Stored private blob is malformed.');
    }

    return PrivateBlob.fromPrimitives(primitives);
  }

  private async all(
    matcher: (blob: PrivateBlob) => boolean,
  ): Promise<PrivateBlob[]> {
    const documents = await this.database.find(
      LocalPrivateBlobRepository.BLOBS,
    );

    return documents.map((document) => this.toBlob(document)).filter(matcher);
  }

  public async delete(id: PrivateBlobId): Promise<void> {
    await this.database.delete(LocalPrivateBlobRepository.BLOBS, id.valueOf());
  }

  public findExpired(now: Timestamp): Promise<PrivateBlob[]> {
    return this.all((blob) => blob.isExpired(now));
  }

  public findStoredRetainedBelow(retentionMs: number): Promise<PrivateBlob[]> {
    return this.all((blob) => blob.isStoredWithRetentionBelow(retentionMs));
  }

  public async hasById(id: PrivateBlobId): Promise<boolean> {
    const document = await this.database.findOne(
      LocalPrivateBlobRepository.BLOBS,
      id.valueOf(),
    );

    return document !== undefined;
  }

  public async requireById(id: PrivateBlobId): Promise<PrivateBlob> {
    const document = await this.database.findOne(
      LocalPrivateBlobRepository.BLOBS,
      id.valueOf(),
    );

    if (!document) {
      throw new PrivateBlobNotFoundError();
    }

    return this.toBlob(document);
  }

  public async reservedBytes(
    now: Timestamp,
    ownerKey?: string,
  ): Promise<number> {
    const blobs = await this.all(
      (blob) =>
        !blob.isExpired(now) &&
        (ownerKey === undefined || blob.isOwnedBy(ownerKey)),
    );

    return blobs.reduce((sum, blob) => sum + blob.getSize().valueOf(), 0);
  }

  public async save(blob: PrivateBlob): Promise<void> {
    await this.database.save(
      LocalPrivateBlobRepository.BLOBS,
      blob.getId().valueOf(),
      { ...blob.toPrimitives() },
    );
  }
}
