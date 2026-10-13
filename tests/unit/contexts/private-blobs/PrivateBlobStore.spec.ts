import PrivateBlobExpirer from '@app/contexts/private-blobs/application/expire/PrivateBlobExpirer';
import { PrivateBlobReadMessage } from '@app/contexts/private-blobs/application/read/messages/PrivateBlobReadMessage';
import PrivateBlobReader from '@app/contexts/private-blobs/application/read/PrivateBlobReader';
import { PrivateBlobRemoveMessage } from '@app/contexts/private-blobs/application/remove/messages/PrivateBlobRemoveMessage';
import PrivateBlobRemover from '@app/contexts/private-blobs/application/remove/PrivateBlobRemover';
import { PrivateBlobReserveMessage } from '@app/contexts/private-blobs/application/reserve/messages/PrivateBlobReserveMessage';
import PrivateBlobReserver from '@app/contexts/private-blobs/application/reserve/PrivateBlobReserver';
import { PrivateBlobUploadMessage } from '@app/contexts/private-blobs/application/upload/messages/PrivateBlobUploadMessage';
import PrivateBlobUploader from '@app/contexts/private-blobs/application/upload/PrivateBlobUploader';
import { PrivateBlobNotFoundError } from '@app/contexts/private-blobs/domain/errors/PrivateBlobNotFoundError';
import { PrivateBlob } from '@app/contexts/private-blobs/domain/PrivateBlob';
import PrivateBlobPolicy from '@app/contexts/private-blobs/domain/PrivateBlobPolicy';
import PrivateBlobRepository from '@app/contexts/private-blobs/domain/repositories/PrivateBlobRepository';
import PrivateBlobOwnerKeyDeriver from '@app/contexts/private-blobs/domain/services/PrivateBlobOwnerKeyDeriver';
import { PrivateBlobLimitsFromEnvironment } from '@app/contexts/private-blobs/infrastructure/environment/PrivateBlobLimitsFromEnvironment';
import FilePrivateBlobBytesStore from '@app/contexts/private-blobs/infrastructure/filesystem/FilePrivateBlobBytesStore';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';
import { Timestamp } from '@haskou/value-objects';
import { randomUUID } from 'crypto';
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { Readable } from 'stream';

class MemoryRepository extends PrivateBlobRepository {
  public readonly blobs = new Map<string, PrivateBlob>();

  public async delete(id: string): Promise<void> {
    this.blobs.delete(id);
  }

  public async hasById(id: string): Promise<boolean> {
    return this.blobs.has(id);
  }

  public async requireById(id: string): Promise<PrivateBlob> {
    const blob = this.blobs.get(id);

    if (!blob) {
      throw new PrivateBlobNotFoundError();
    }

    return blob;
  }

  public async findExpired(now: Timestamp): Promise<PrivateBlob[]> {
    return [...this.blobs.values()].filter((blob) => blob.isExpired(now));
  }

  public async findStoredRetainedBelow(
    retentionMs: number,
  ): Promise<PrivateBlob[]> {
    return [...this.blobs.values()].filter(
      (blob) => blob.isStored() && blob.getRetentionMs() < retentionMs,
    );
  }

  public async reservedBytes(
    now: Timestamp,
    ownerKey?: string,
  ): Promise<number> {
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

class HexOwnerKeyDeriver extends PrivateBlobOwnerKeyDeriver {
  public async derive(identityId: string): Promise<string> {
    return `owner:${Buffer.from(identityId).toString('hex')}`;
  }
}

const alice = new IdentityId(
  'MCowBQYDK2VwAyEAFuQGsm0WcnE4FhQecwAFGeTfQCZzEMuhE73CyTUxOio=',
);
const bob = new IdentityId(
  'MCowBQYDK2VwAyEAKV3uU7LZg0grhngWKkoR9jqZo5M3yQ2GHliIFMgdJZw=',
);
const carol = new IdentityId(
  'MCowBQYDK2VwAyEAIZERRRhGaokvb3xQqMGr9Y2ble6jUd51OuZRsvW52Q4=',
);

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
    const policy = new PrivateBlobPolicy(
      PrivateBlobLimitsFromEnvironment.load(),
    );

    reserver = new PrivateBlobReserver(
      repository,
      policy,
      new HexOwnerKeyDeriver(),
    );
    uploader = new PrivateBlobUploader(repository, store);
    reader = new PrivateBlobReader(repository, store);
  });

  afterEach(() => {
    rmSync(directory, { force: true, recursive: true });
    delete process.env.PRIVATE_BLOB_STORAGE_PATH;
    delete process.env.PRIVATE_BLOB_QUOTA_BYTES_PER_OWNER;
    delete process.env.PRIVATE_BLOB_QUOTA_BYTES_TOTAL;
    delete process.env.PRIVATE_BLOB_MAX_BYTES;
    delete process.env.PRIVATE_BLOB_RETENTION_MS;
    delete process.env.MAILBOX_RETENTION_MS;
  });

  it('round-trips bytes and serves ranges with the right slice', async () => {
    const { blobId, downloadToken, uploadToken } = await reserver.reserve(
      new PrivateBlobReserveMessage(alice, 10),
    );

    await uploader.upload(
      new PrivateBlobUploadMessage(blobId, uploadToken, bytes('0123456789')),
    );

    expect(
      await collect(
        (
          await reader.open(
            new PrivateBlobReadMessage(blobId, downloadToken, undefined),
          )
        ).stream,
      ),
    ).toBe('0123456789');

    const ranged = await reader.open(
      new PrivateBlobReadMessage(blobId, downloadToken, {
        first: 2,
        kind: 'from',
        last: 4,
      }),
    );

    expect(ranged.range).toEqual({ end: 4, start: 2 });
    expect(await collect(ranged.stream)).toBe('234');
    expect(
      await collect(
        (
          await reader.open(
            new PrivateBlobReadMessage(blobId, downloadToken, {
              kind: 'suffix',
              length: 3,
            }),
          )
        ).stream,
      ),
    ).toBe('789');
    await expect(
      reader.open(
        new PrivateBlobReadMessage(blobId, downloadToken, {
          first: 10,
          kind: 'from',
        }),
      ),
    ).rejects.toMatchObject({ size: 10 });
    await expect(
      reader.open(
        new PrivateBlobReadMessage(blobId, downloadToken, {
          kind: 'invalid',
        }),
      ),
    ).rejects.toMatchObject({ size: 10 });
  });

  it('does not disclose blobs to the wrong or missing capability', async () => {
    const { blobId, downloadToken, uploadToken } = await reserver.reserve(
      new PrivateBlobReserveMessage(alice, 3),
    );

    await expect(
      uploader.upload(
        new PrivateBlobUploadMessage(blobId, downloadToken, bytes('abc')),
      ),
    ).rejects.toThrow('not found');
    await uploader.upload(
      new PrivateBlobUploadMessage(blobId, uploadToken, bytes('abc')),
    );
    await expect(
      reader.open(new PrivateBlobReadMessage(blobId, uploadToken, undefined)),
    ).rejects.toThrow('not found');
    await expect(
      reader.open(
        new PrivateBlobReadMessage(blobId, 'x'.repeat(43), undefined),
      ),
    ).rejects.toThrow('not found');
    await expect(
      reader.open(
        new PrivateBlobReadMessage('missing', downloadToken, undefined),
      ),
    ).rejects.toThrow('not found');
  });

  it('keeps nothing when the uploaded size differs from the reservation', async () => {
    const short = await reserver.reserve(
      new PrivateBlobReserveMessage(alice, 5),
    );
    const long = await reserver.reserve(
      new PrivateBlobReserveMessage(alice, 5),
    );

    await expect(
      uploader.upload(
        new PrivateBlobUploadMessage(
          short.blobId,
          short.uploadToken,
          bytes('abc'),
        ),
      ),
    ).rejects.toThrow('do not match');
    await expect(
      uploader.upload(
        new PrivateBlobUploadMessage(
          long.blobId,
          long.uploadToken,
          bytes('abcdefgh'),
        ),
      ),
    ).rejects.toThrow('do not match');

    expect(readdirSync(directory)).toEqual([]);
    await expect(
      reader.open(
        new PrivateBlobReadMessage(
          short.blobId,
          short.downloadToken,
          undefined,
        ),
      ),
    ).rejects.toThrow('not found');
  });

  it('refuses a second upload and never serves a partial blob', async () => {
    const { blobId, downloadToken, uploadToken } = await reserver.reserve(
      new PrivateBlobReserveMessage(alice, 3),
    );

    await expect(
      reader.open(new PrivateBlobReadMessage(blobId, downloadToken, undefined)),
    ).rejects.toThrow('not found');
    await uploader.upload(
      new PrivateBlobUploadMessage(blobId, uploadToken, bytes('abc')),
    );
    await expect(
      uploader.upload(
        new PrivateBlobUploadMessage(blobId, uploadToken, bytes('xyz')),
      ),
    ).rejects.toThrow('already complete');
    expect(
      await collect(
        (
          await reader.open(
            new PrivateBlobReadMessage(blobId, downloadToken, undefined),
          )
        ).stream,
      ),
    ).toBe('abc');
  });

  it('enforces size, per-owner and total quotas', async () => {
    await expect(
      reserver.reserve(new PrivateBlobReserveMessage(alice, 0)),
    ).rejects.toThrow('between 1');
    await expect(
      reserver.reserve(new PrivateBlobReserveMessage(alice, 81)),
    ).rejects.toThrow('between 1');

    await reserver.reserve(new PrivateBlobReserveMessage(alice, 80));
    await expect(
      reserver.reserve(new PrivateBlobReserveMessage(alice, 21)),
    ).rejects.toThrow('quota');
    await reserver.reserve(new PrivateBlobReserveMessage(bob, 70));
    await expect(
      reserver.reserve(new PrivateBlobReserveMessage(carol, 1)),
    ).rejects.toThrow('quota');
  });

  it('cannot overshoot a quota with concurrent reservations', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        reserver.reserve(new PrivateBlobReserveMessage(alice, 40)),
      ),
    );

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
  });

  it('expires abandoned reservations and stored blobs, freeing quota and bytes', async () => {
    const abandoned = await reserver.reserve(
      new PrivateBlobReserveMessage(alice, 80),
    );
    const stored = await reserver.reserve(
      new PrivateBlobReserveMessage(bob, 5),
    );

    await uploader.upload(
      new PrivateBlobUploadMessage(
        stored.blobId,
        stored.uploadToken,
        bytes('12345'),
      ),
    );

    const expirer = new PrivateBlobExpirer(
      repository,
      store,
      new PrivateBlobPolicy(PrivateBlobLimitsFromEnvironment.load()),
    );
    const farFuture = Date.now() + 365 * 24 * 60 * 60 * 1000;

    expect(await expirer.expire(Timestamp.now())).toBe(0);
    expect(await expirer.expire(new Timestamp(farFuture))).toBe(2);
    expect(repository.blobs.size).toBe(0);
    expect(readdirSync(directory)).toEqual([]);
    await expect(
      uploader.upload(
        new PrivateBlobUploadMessage(
          abandoned.blobId,
          abandoned.uploadToken,
          bytes('x'),
        ),
      ),
    ).rejects.toThrow('not found');
  });

  it('keeps sweeping when one blob cannot be deleted and retries it later', async () => {
    const first = await reserver.reserve(
      new PrivateBlobReserveMessage(alice, 5),
    );
    const second = await reserver.reserve(
      new PrivateBlobReserveMessage(bob, 5),
    );

    await uploader.upload(
      new PrivateBlobUploadMessage(
        first.blobId,
        first.uploadToken,
        bytes('12345'),
      ),
    );
    await uploader.upload(
      new PrivateBlobUploadMessage(
        second.blobId,
        second.uploadToken,
        bytes('67890'),
      ),
    );

    const realDelete = store.delete.bind(store);
    let broken = true;

    jest.spyOn(store, 'delete').mockImplementation(async (id: string) => {
      if (broken && id === first.blobId) {
        throw new Error('EACCES');
      }

      return realDelete(id);
    });

    const expirer = new PrivateBlobExpirer(
      repository,
      store,
      new PrivateBlobPolicy(PrivateBlobLimitsFromEnvironment.load()),
    );
    const farFuture = Date.now() + 365 * 24 * 60 * 60 * 1000;

    await expect(expirer.expire(new Timestamp(farFuture))).rejects.toThrow(
      '1 of 2',
    );
    expect([...repository.blobs.keys()]).toEqual([first.blobId]);

    broken = false;
    expect(await expirer.expire(new Timestamp(farFuture))).toBe(1);
    expect(repository.blobs.size).toBe(0);
  });

  it('sweeps bytes that no record owns and never touches unrelated files', async () => {
    const kept = await reserver.reserve(
      new PrivateBlobReserveMessage(alice, 3),
    );
    const orphanBlob = randomUUID();
    const orphanPart = randomUUID();

    await uploader.upload(
      new PrivateBlobUploadMessage(kept.blobId, kept.uploadToken, bytes('abc')),
    );
    writeFileSync(path.join(directory, `${orphanBlob}.blob`), 'stale');
    writeFileSync(path.join(directory, `${orphanPart}.part`), 'stale');
    writeFileSync(path.join(directory, 'notes.txt'), 'not ours');

    const expirer = new PrivateBlobExpirer(
      repository,
      store,
      new PrivateBlobPolicy(PrivateBlobLimitsFromEnvironment.load()),
    );

    expect(await expirer.expire(Timestamp.now())).toBe(0);
    expect(readdirSync(directory).sort()).toEqual(
      ['notes.txt', `${kept.blobId}.blob`].sort(),
    );
    expect(
      await collect(
        (
          await reader.open(
            new PrivateBlobReadMessage(
              kept.blobId,
              kept.downloadToken,
              undefined,
            ),
          )
        ).stream,
      ),
    ).toBe('abc');
  });

  it('only the uploader capability withdraws a blob and bytes go with it', async () => {
    const { blobId, downloadToken, uploadToken } = await reserver.reserve(
      new PrivateBlobReserveMessage(alice, 3),
    );
    const remover = new PrivateBlobRemover(repository, store);

    await uploader.upload(
      new PrivateBlobUploadMessage(blobId, uploadToken, bytes('abc')),
    );
    await expect(
      remover.remove(new PrivateBlobRemoveMessage(blobId, downloadToken)),
    ).rejects.toThrow('not found');
    await remover.remove(new PrivateBlobRemoveMessage(blobId, uploadToken));

    expect(existsSync(path.join(directory, `${blobId}.blob`))).toBe(false);
    await expect(
      reader.open(new PrivateBlobReadMessage(blobId, downloadToken, undefined)),
    ).rejects.toThrow('not found');
  });

  it('stores only an opaque record: hashed capabilities, no names or keys', async () => {
    const { blobId, downloadToken, uploadToken } = await reserver.reserve(
      new PrivateBlobReserveMessage(alice, 3),
    );
    const serialized = JSON.stringify(
      repository.blobs.get(blobId)?.toPrimitives(),
    );

    expect(serialized).not.toContain(downloadToken);
    expect(serialized).not.toContain(uploadToken);
    expect(serialized).not.toContain(alice.valueOf());
  });

  it('keeps a stored blob for at least the mailbox retention, whatever the blob setting', async () => {
    const dayMs = 24 * 60 * 60 * 1000;
    process.env.PRIVATE_BLOB_RETENTION_MS = String(dayMs);
    const mailboxRetentionMs = pigeonEnvironment().MAILBOX_RETENTION_MS;
    const now = Date.now();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(now);

    try {
      const { blobId, downloadToken, uploadToken } = await reserver.reserve(
        new PrivateBlobReserveMessage(alice, 3),
      );

      await uploader.upload(
        new PrivateBlobUploadMessage(blobId, uploadToken, bytes('abc')),
      );
      expect(
        repository.blobs.get(blobId)?.getExpiresAt(),
      ).toBeGreaterThanOrEqual(now + mailboxRetentionMs);

      const expirer = new PrivateBlobExpirer(
        repository,
        store,
        new PrivateBlobPolicy(PrivateBlobLimitsFromEnvironment.load()),
      );

      // Envelopes appended at storage time expire at now + mailbox retention.
      expect(
        await expirer.expire(new Timestamp(now + mailboxRetentionMs - 1)),
      ).toBe(0);
      expect(
        await collect(
          (
            await reader.open(
              new PrivateBlobReadMessage(blobId, downloadToken, undefined),
            )
          ).stream,
        ),
      ).toBe('abc');
    } finally {
      clock.mockRestore();
    }
  });

  it('extends stored blobs recorded under a shorter retention on the next sweep', async () => {
    const dayMs = 24 * 60 * 60 * 1000;
    process.env.PRIVATE_BLOB_RETENTION_MS = String(dayMs);
    const now = Date.now();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(now);

    try {
      const { blobId, downloadToken, uploadToken } = await reserver.reserve(
        new PrivateBlobReserveMessage(alice, 3),
      );

      await uploader.upload(
        new PrivateBlobUploadMessage(blobId, uploadToken, bytes('abc')),
      );

      // The setting is gone after the upgrade; the blob keeps its old record.
      delete process.env.PRIVATE_BLOB_RETENTION_MS;
      const expirer = new PrivateBlobExpirer(
        repository,
        store,
        new PrivateBlobPolicy(PrivateBlobLimitsFromEnvironment.load()),
      );

      expect(await expirer.expire(new Timestamp(now + 2 * dayMs))).toBe(0);
      expect(repository.blobs.get(blobId)?.getExpiresAt()).toBe(
        now + pigeonEnvironment().MAILBOX_RETENTION_MS,
      );
      expect(
        await collect(
          (
            await reader.open(
              new PrivateBlobReadMessage(blobId, downloadToken, undefined),
            )
          ).stream,
        ),
      ).toBe('abc');
    } finally {
      clock.mockRestore();
    }
  });

  it('defaults blob retention to the mailbox retention and never lets it fall below', () => {
    delete process.env.PRIVATE_BLOB_RETENTION_MS;
    delete process.env.MAILBOX_RETENTION_MS;
    const defaults = pigeonEnvironment();

    expect(defaults.PRIVATE_BLOB_RETENTION_MS).toBe(
      defaults.MAILBOX_RETENTION_MS,
    );

    process.env.PRIVATE_BLOB_RETENTION_MS = '1000';
    process.env.MAILBOX_RETENTION_MS = '5000';
    const floored = new PrivateBlobPolicy(
      PrivateBlobLimitsFromEnvironment.load(),
    );
    expect(floored.retentionMs()).toBe(5000);

    process.env.PRIVATE_BLOB_RETENTION_MS = '9000';
    const widened = new PrivateBlobPolicy(
      PrivateBlobLimitsFromEnvironment.load(),
    );
    expect(widened.retentionMs()).toBe(9000);
  });
});
