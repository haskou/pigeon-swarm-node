import PrivateBlobExpirer from '@app/contexts/private-blobs/application/PrivateBlobExpirer';
import PrivateBlobReader from '@app/contexts/private-blobs/application/PrivateBlobReader';
import PrivateBlobRemover from '@app/contexts/private-blobs/application/PrivateBlobRemover';
import PrivateBlobReserver from '@app/contexts/private-blobs/application/PrivateBlobReserver';
import PrivateBlobUploader from '@app/contexts/private-blobs/application/PrivateBlobUploader';
import { PrivateBlob } from '@app/contexts/private-blobs/domain/PrivateBlob';
import PrivateBlobPolicy from '@app/contexts/private-blobs/domain/PrivateBlobPolicy';
import PrivateBlobRepository from '@app/contexts/private-blobs/domain/repositories/PrivateBlobRepository';
import FilePrivateBlobBytesStore from '@app/contexts/private-blobs/infrastructure/filesystem/FilePrivateBlobBytesStore';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { Readable } from 'stream';

class MemoryRepository extends PrivateBlobRepository {
  public readonly blobs = new Map<string, PrivateBlob>();

  public async delete(id: string): Promise<void> {
    this.blobs.delete(id);
  }

  public async findById(id: string): Promise<PrivateBlob | undefined> {
    return this.blobs.get(id);
  }

  public async findExpired(now: number): Promise<PrivateBlob[]> {
    return [...this.blobs.values()].filter((blob) => blob.isExpired(now));
  }

  public async ownerKeyFor(identityId: string): Promise<string> {
    return `owner:${Buffer.from(identityId).toString('hex')}`;
  }

  public async reservedBytes(now: number, ownerKey?: string): Promise<number> {
    return [...this.blobs.values()]
      .filter(
        (blob) =>
          !blob.isExpired(now) &&
          (ownerKey === undefined || blob.getOwnerKey() === ownerKey),
      )
      .reduce((sum, blob) => sum + blob.getSize(), 0);
  }

  public async save(blob: PrivateBlob): Promise<void> {
    this.blobs.set(blob.getId(), blob);
  }
}

const bytes = (text: string): Readable => Readable.from([Buffer.from(text)]);

const collect = async (stream: Readable): Promise<string> => {
  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    chunks.push(chunk as Buffer);
  }

  return Buffer.concat(chunks).toString();
};

describe('private blob store', () => {
  let directory: string;
  let repository: MemoryRepository;
  let store: FilePrivateBlobBytesStore;
  let reserver: PrivateBlobReserver;
  let uploader: PrivateBlobUploader;
  let reader: PrivateBlobReader;

  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'private-blobs-'));
    process.env.PRIVATE_BLOB_STORAGE_PATH = directory;
    process.env.PRIVATE_BLOB_QUOTA_BYTES_PER_OWNER = '100';
    process.env.PRIVATE_BLOB_QUOTA_BYTES_TOTAL = '150';
    process.env.PRIVATE_BLOB_MAX_BYTES = '80';
    repository = new MemoryRepository();
    store = new FilePrivateBlobBytesStore();
    const policy = new PrivateBlobPolicy();

    reserver = new PrivateBlobReserver(repository, policy);
    uploader = new PrivateBlobUploader(repository, store);
    reader = new PrivateBlobReader(repository, store);
  });

  afterEach(() => {
    rmSync(directory, { force: true, recursive: true });
    delete process.env.PRIVATE_BLOB_STORAGE_PATH;
    delete process.env.PRIVATE_BLOB_QUOTA_BYTES_PER_OWNER;
    delete process.env.PRIVATE_BLOB_QUOTA_BYTES_TOTAL;
    delete process.env.PRIVATE_BLOB_MAX_BYTES;
  });

  it('round-trips bytes and serves ranges with the right slice', async () => {
    const { blobId, downloadToken, uploadToken } = await reserver.reserve(
      'alice',
      10,
    );

    await uploader.upload(blobId, uploadToken, bytes('0123456789'));

    expect(
      await collect((await reader.open(blobId, downloadToken)).stream),
    ).toBe('0123456789');

    const ranged = await reader.open(blobId, downloadToken, 'bytes=2-4');

    expect(ranged.range).toEqual({ end: 4, start: 2 });
    expect(await collect(ranged.stream)).toBe('234');
    expect(
      await collect(
        (await reader.open(blobId, downloadToken, 'bytes=-3')).stream,
      ),
    ).toBe('789');
    await expect(
      reader.open(blobId, downloadToken, 'bytes=10-'),
    ).rejects.toMatchObject({ size: 10 });
  });

  it('does not disclose blobs to the wrong or missing capability', async () => {
    const { blobId, downloadToken, uploadToken } = await reserver.reserve(
      'alice',
      3,
    );

    await expect(
      uploader.upload(blobId, downloadToken, bytes('abc')),
    ).rejects.toThrow('not found');
    await uploader.upload(blobId, uploadToken, bytes('abc'));
    await expect(reader.open(blobId, uploadToken)).rejects.toThrow('not found');
    await expect(reader.open(blobId, 'x'.repeat(43))).rejects.toThrow(
      'not found',
    );
    await expect(reader.open('missing', downloadToken)).rejects.toThrow(
      'not found',
    );
  });

  it('keeps nothing when the uploaded size differs from the reservation', async () => {
    const short = await reserver.reserve('alice', 5);
    const long = await reserver.reserve('alice', 5);

    await expect(
      uploader.upload(short.blobId, short.uploadToken, bytes('abc')),
    ).rejects.toThrow('do not match');
    await expect(
      uploader.upload(long.blobId, long.uploadToken, bytes('abcdefgh')),
    ).rejects.toThrow('do not match');

    expect(readdirSync(directory)).toEqual([]);
    await expect(
      reader.open(short.blobId, short.downloadToken),
    ).rejects.toThrow('not found');
  });

  it('refuses a second upload and never serves a partial blob', async () => {
    const { blobId, downloadToken, uploadToken } = await reserver.reserve(
      'alice',
      3,
    );

    await expect(reader.open(blobId, downloadToken)).rejects.toThrow(
      'not found',
    );
    await uploader.upload(blobId, uploadToken, bytes('abc'));
    await expect(
      uploader.upload(blobId, uploadToken, bytes('xyz')),
    ).rejects.toThrow('already complete');
    expect(
      await collect((await reader.open(blobId, downloadToken)).stream),
    ).toBe('abc');
  });

  it('enforces size, per-owner and total quotas', async () => {
    await expect(reserver.reserve('alice', 0)).rejects.toThrow('between 1');
    await expect(reserver.reserve('alice', 81)).rejects.toThrow('between 1');

    await reserver.reserve('alice', 80);
    await expect(reserver.reserve('alice', 21)).rejects.toThrow('quota');
    await reserver.reserve('bob', 70);
    await expect(reserver.reserve('carol', 1)).rejects.toThrow('quota');
  });

  it('cannot overshoot a quota with concurrent reservations', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => reserver.reserve('alice', 40)),
    );

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
  });

  it('expires abandoned reservations and stored blobs, freeing quota and bytes', async () => {
    const abandoned = await reserver.reserve('alice', 80);
    const stored = await reserver.reserve('bob', 5);

    await uploader.upload(stored.blobId, stored.uploadToken, bytes('12345'));

    const expirer = new PrivateBlobExpirer(repository, store);
    const farFuture = Date.now() + 365 * 24 * 60 * 60 * 1000;

    expect(await expirer.expire(Date.now())).toBe(0);
    expect(await expirer.expire(farFuture)).toBe(2);
    expect(repository.blobs.size).toBe(0);
    expect(readdirSync(directory)).toEqual([]);
    await expect(
      uploader.upload(abandoned.blobId, abandoned.uploadToken, bytes('x')),
    ).rejects.toThrow('not found');
  });

  it('only the uploader capability withdraws a blob and bytes go with it', async () => {
    const { blobId, downloadToken, uploadToken } = await reserver.reserve(
      'alice',
      3,
    );
    const remover = new PrivateBlobRemover(repository, store);

    await uploader.upload(blobId, uploadToken, bytes('abc'));
    await expect(remover.remove(blobId, downloadToken)).rejects.toThrow(
      'not found',
    );
    await remover.remove(blobId, uploadToken);

    expect(existsSync(path.join(directory, `${blobId}.blob`))).toBe(false);
    await expect(reader.open(blobId, downloadToken)).rejects.toThrow(
      'not found',
    );
  });

  it('stores only an opaque record: hashed capabilities, no names or keys', async () => {
    const { blobId, downloadToken, uploadToken } = await reserver.reserve(
      'alice',
      3,
    );
    const serialized = JSON.stringify(
      repository.blobs.get(blobId)?.toPrimitives(),
    );

    expect(serialized).not.toContain(downloadToken);
    expect(serialized).not.toContain(uploadToken);
    expect(serialized).not.toContain('alice');
  });
});
