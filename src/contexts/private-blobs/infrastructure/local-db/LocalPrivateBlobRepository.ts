import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';
import { createHmac, randomBytes } from 'crypto';

import { PrivateBlob } from '../../domain/PrivateBlob';
import { PrivateBlobPrimitives } from '../../domain/PrivateBlobPrimitives';
import PrivateBlobRepository from '../../domain/repositories/PrivateBlobRepository';

export default class LocalPrivateBlobRepository extends PrivateBlobRepository {
  private static readonly BLOBS = 'private_blobs';
  private static readonly META = 'private_blob_meta';
  private static readonly SALT_ID = 'owner-key-salt';

  private saltPromise?: Promise<Buffer>;

  constructor(private readonly database: EmbeddedLocalDatabase) {
    super();
  }

  private salt(): Promise<Buffer> {
    this.saltPromise ??= this.loadOrCreateSalt();

    return this.saltPromise;
  }

  private async loadOrCreateSalt(): Promise<Buffer> {
    const stored = await this.database.findOne(
      LocalPrivateBlobRepository.META,
      LocalPrivateBlobRepository.SALT_ID,
    );

    if (typeof stored?.salt === 'string') {
      return Buffer.from(stored.salt, 'hex');
    }

    const salt = randomBytes(32);

    await this.database.save(
      LocalPrivateBlobRepository.META,
      LocalPrivateBlobRepository.SALT_ID,
      { salt: salt.toString('hex') },
    );

    return salt;
  }

  private toBlob(document: Record<string, unknown>): PrivateBlob {
    const primitives = { ...document };

    delete primitives._id;

    return PrivateBlob.fromPrimitives(
      primitives as unknown as PrivateBlobPrimitives,
    );
  }

  private async all(
    matcher: (blob: PrivateBlob) => boolean,
  ): Promise<PrivateBlob[]> {
    const documents = await this.database.find(
      LocalPrivateBlobRepository.BLOBS,
    );

    return documents.map((document) => this.toBlob(document)).filter(matcher);
  }

  public async delete(id: string): Promise<void> {
    await this.database.delete(LocalPrivateBlobRepository.BLOBS, id);
  }

  public async findById(id: string): Promise<PrivateBlob | undefined> {
    const document = await this.database.findOne(
      LocalPrivateBlobRepository.BLOBS,
      id,
    );

    return document ? this.toBlob(document) : undefined;
  }

  public findExpired(now: number): Promise<PrivateBlob[]> {
    return this.all((blob) => blob.isExpired(now));
  }

  public async ownerKeyFor(identityId: string): Promise<string> {
    return createHmac('sha256', await this.salt())
      .update(identityId)
      .digest('hex');
  }

  public async reservedBytes(now: number, ownerKey?: string): Promise<number> {
    const blobs = await this.all(
      (blob) =>
        !blob.isExpired(now) &&
        (ownerKey === undefined || blob.getOwnerKey() === ownerKey),
    );

    return blobs.reduce((sum, blob) => sum + blob.getSize(), 0);
  }

  public async save(blob: PrivateBlob): Promise<void> {
    await this.database.save(
      LocalPrivateBlobRepository.BLOBS,
      blob.getId(),
      blob.toPrimitives() as unknown as Record<string, unknown>,
    );
  }
}
