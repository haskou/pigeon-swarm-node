import { PrivateBlob } from '@app/contexts/private-blobs/domain/PrivateBlob';
import { PrivateBlobDownloadToken } from '@app/contexts/private-blobs/domain/value-objects/PrivateBlobDownloadToken';
import { PrivateBlobId } from '@app/contexts/private-blobs/domain/value-objects/PrivateBlobId';
import { PrivateBlobOwnerKey } from '@app/contexts/private-blobs/domain/value-objects/PrivateBlobOwnerKey';
import { PrivateBlobSize } from '@app/contexts/private-blobs/domain/value-objects/PrivateBlobSize';
import { PrivateBlobUploadToken } from '@app/contexts/private-blobs/domain/value-objects/PrivateBlobUploadToken';
import { BearerCapability } from '@haskou/pigeon-swarm-crypto';
import { Duration, Timestamp } from '@haskou/value-objects';

describe('PrivateBlob', () => {
  const now = new Timestamp(1_000_000);
  const owner = new PrivateBlobOwnerKey('owner-a');
  const reserve = () =>
    PrivateBlob.reserve({
      id: new PrivateBlobId('blob-1'),
      now,
      ownerKey: owner,
      retention: Duration.fromMilliseconds(5_000),
      size: new PrivateBlobSize(3),
      uploadWindow: Duration.fromMilliseconds(1_000),
    });

  it('is owned only by the owner key it was reserved for', () => {
    const { blob } = reserve();

    expect(blob.isOwnedBy(new PrivateBlobOwnerKey('owner-a'))).toBe(true);
    expect(blob.isOwnedBy(new PrivateBlobOwnerKey('owner-b'))).toBe(false);
  });

  it('expires after the upload window while reserved and after the retention once stored', () => {
    const { blob } = reserve();

    expect(blob.getExpiresAt().toMilliseconds()).toBe(1_001_000);

    blob.markStored(new Timestamp(1_000_500));

    expect(blob.getExpiresAt().toMilliseconds()).toBe(1_005_500);
  });

  it('extends a stored blob to a longer retention counted from its store time', () => {
    const { blob } = reserve();

    blob.markStored(now);

    expect(
      blob.isStoredWithRetentionBelow(Duration.fromMilliseconds(9_000)),
    ).toBe(true);

    blob.extendRetentionTo(Duration.fromMilliseconds(9_000));

    expect(blob.getExpiresAt().toMilliseconds()).toBe(1_009_000);
    expect(
      blob.isStoredWithRetentionBelow(Duration.fromMilliseconds(9_000)),
    ).toBe(false);

    blob.extendRetentionTo(Duration.fromMilliseconds(2_000));

    expect(blob.getExpiresAt().toMilliseconds()).toBe(1_009_000);
  });

  it('accepts only the capabilities it issued and keeps only their hashes', () => {
    const { blob, downloadToken, uploadToken } = reserve();

    expect(blob.acceptsUpload(uploadToken)).toBe(true);
    expect(blob.acceptsUpload(new PrivateBlobUploadToken('forged'))).toBe(
      false,
    );
    expect(blob.acceptsDownload(downloadToken)).toBe(false);

    blob.markStored(now);

    expect(blob.acceptsDownload(downloadToken)).toBe(true);
    expect(blob.acceptsDownload(new PrivateBlobDownloadToken('forged'))).toBe(
      false,
    );
    expect(blob.toPrimitives()).toMatchObject({
      downloadTokenHash: BearerCapability.hash(downloadToken.valueOf()),
      ownerKey: 'owner-a',
      retentionMs: 5_000,
      uploadTokenHash: BearerCapability.hash(uploadToken.valueOf()),
    });
  });

  it('round-trips its stored record unchanged', () => {
    const { blob } = reserve();

    blob.markStored(now);

    expect(
      PrivateBlob.fromPrimitives(blob.toPrimitives()).toPrimitives(),
    ).toEqual(blob.toPrimitives());
  });
});
