import FilePrivateBlobBytesStore from '@app/contexts/private-blobs/infrastructure/filesystem/FilePrivateBlobBytesStore';
import { PrivateBlobStorageNotWritableError } from '@app/contexts/private-blobs/infrastructure/filesystem/PrivateBlobStorageNotWritableError';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import path from 'path';

describe('FilePrivateBlobBytesStore ensureWritable', () => {
  let root: string;
  let directory: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'private-blobs-writable-'));
    directory = path.join(root, 'private_blobs');
    process.env.PRIVATE_BLOB_STORAGE_PATH = directory;
  });

  afterEach(() => {
    if (existsSync(directory)) {
      chmodSync(directory, 0o700);
    }

    rmSync(root, { force: true, recursive: true });
    delete process.env.PRIVATE_BLOB_STORAGE_PATH;
  });

  it('should create a missing folder and leave no probe file behind', async () => {
    await new FilePrivateBlobBytesStore().ensureWritable();

    expect(readdirSync(directory)).toEqual([]);
  });

  it('should refuse a folder it cannot create, naming only the env var and errno code', async () => {
    writeFileSync(path.join(root, 'blocker'), '');
    process.env.PRIVATE_BLOB_STORAGE_PATH = path.join(
      root,
      'blocker',
      'private_blobs',
    );

    const error = await new FilePrivateBlobBytesStore()
      .ensureWritable()
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(PrivateBlobStorageNotWritableError);
    expect((error as Error).message).toBe(
      'PRIVATE_BLOB_STORAGE_PATH is not writable (ENOTDIR): private blob uploads would fail, point it at a writable directory',
    );
    expect((error as Error).message).not.toContain(root);
  });

  const runAsNonRoot = process.getuid?.() !== 0;

  (runAsNonRoot ? it : it.skip)(
    'should refuse an existing read-only folder with EACCES',
    async () => {
      mkdirSync(directory);
      chmodSync(directory, 0o500);

      const error = await new FilePrivateBlobBytesStore()
        .ensureWritable()
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(PrivateBlobStorageNotWritableError);
      expect((error as Error).message).toContain('(EACCES)');
      expect((error as Error).message).not.toContain(directory);
    },
  );
});
