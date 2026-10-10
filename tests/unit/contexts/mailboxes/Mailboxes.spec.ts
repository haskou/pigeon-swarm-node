import MailboxAcknowledger from '@app/contexts/mailboxes/application/MailboxAcknowledger';
import MailboxAppender from '@app/contexts/mailboxes/application/MailboxAppender';
import MailboxCoordinator from '@app/contexts/mailboxes/application/MailboxCoordinator';
import MailboxCreator from '@app/contexts/mailboxes/application/MailboxCreator';
import MailboxEnvelopeNotifier from '@app/contexts/mailboxes/application/MailboxEnvelopeNotifier';
import MailboxExpirer from '@app/contexts/mailboxes/application/MailboxExpirer';
import MailboxReader from '@app/contexts/mailboxes/application/MailboxReader';
import MailboxRemover from '@app/contexts/mailboxes/application/MailboxRemover';
import { MailboxConflictError } from '@app/contexts/mailboxes/domain/errors/MailboxConflictError';
import { MailboxEnvelopeInvalidError } from '@app/contexts/mailboxes/domain/errors/MailboxEnvelopeInvalidError';
import { MailboxFullError } from '@app/contexts/mailboxes/domain/errors/MailboxFullError';
import { MailboxLimitReachedError } from '@app/contexts/mailboxes/domain/errors/MailboxLimitReachedError';
import { MailboxNotFoundError } from '@app/contexts/mailboxes/domain/errors/MailboxNotFoundError';
import MailboxPolicy from '@app/contexts/mailboxes/domain/MailboxPolicy';
import LocalMailboxRepository from '@app/contexts/mailboxes/infrastructure/local-db/LocalMailboxRepository';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import { mock, MockProxy } from 'jest-mock-extended';
import os from 'os';
import path from 'path';

const sha = (value: string): string =>
  createHash('sha256').update(value).digest('hex');
const body = (size: number): string =>
  Buffer.alloc(size, 7).toString('base64url');
const MAILBOX = 'm'.repeat(43);
const POST = 'p'.repeat(32);
const READ = 'r'.repeat(32);

describe('mailboxes', () => {
  let databasePath: string;
  let database: EmbeddedLocalDatabase;
  let repository: LocalMailboxRepository;
  let creator: MailboxCreator;
  let appender: MailboxAppender;
  let notifier: MockProxy<MailboxEnvelopeNotifier>;
  let reader: MailboxReader;
  let acknowledger: MailboxAcknowledger;
  let remover: MailboxRemover;
  let expirer: MailboxExpirer;
  const saved: Record<string, string | undefined> = {};
  const envKeys = [
    'PIGEON_LOCAL_DB_PATH',
    'MAILBOX_MAX_ENVELOPES',
    'MAILBOX_MAX_BYTES',
    'MAILBOX_MAX_COUNT',
    'MAILBOX_RETENTION_MS',
  ];

  const wire = (): void => {
    const policy = new MailboxPolicy();
    const coordinator = new MailboxCoordinator();

    database = new EmbeddedLocalDatabase();
    repository = new LocalMailboxRepository(database);
    creator = new MailboxCreator(repository, policy, coordinator);
    notifier = mock<MailboxEnvelopeNotifier>();
    appender = new MailboxAppender(repository, policy, coordinator, notifier);
    reader = new MailboxReader(repository, coordinator);
    acknowledger = new MailboxAcknowledger(repository, coordinator);
    remover = new MailboxRemover(repository, coordinator);
    expirer = new MailboxExpirer(repository, policy, coordinator);
  };

  beforeEach(async () => {
    for (const key of envKeys) {
      saved[key] = process.env[key];
    }
    databasePath = await fs.mkdtemp(path.join(os.tmpdir(), 'pigeon-mailbox-'));
    process.env.PIGEON_LOCAL_DB_PATH = databasePath;
    wire();
    await creator.create(MAILBOX, sha(POST), sha(READ));
  });

  afterEach(async () => {
    await database.close();

    for (const key of envKeys) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
    await fs.rm(databasePath, { force: true, recursive: true });
  });

  it('creates idempotently and rejects different hashes', async () => {
    await expect(creator.create(MAILBOX, sha(POST), sha(READ))).resolves.toBe(
      false,
    );
    await expect(
      creator.create(MAILBOX, sha('other'), sha(READ)),
    ).rejects.toBeInstanceOf(MailboxConflictError);
  });

  it('stops creating at MAILBOX_MAX_COUNT', async () => {
    process.env.MAILBOX_MAX_COUNT = '1';

    await expect(
      creator.create('n'.repeat(43), sha(POST), sha(READ)),
    ).rejects.toBeInstanceOf(MailboxLimitReachedError);
  });

  it('answers wrong capability, swapped capability and unknown mailbox identically', async () => {
    const outcomes = await Promise.all([
      appender
        .append(MAILBOX, READ, 'a'.repeat(22), body(1024))
        .catch((e: unknown) => e as Error),
      appender
        .append('x'.repeat(43), POST, 'a'.repeat(22), body(1024))
        .catch((e: unknown) => e as Error),
      reader.read(MAILBOX, POST, 0, 10).catch((e: unknown) => e as Error),
      acknowledger
        .acknowledge(MAILBOX, POST, 1)
        .catch((e: unknown) => e as Error),
      remover.remove(MAILBOX, POST).catch((e: unknown) => e as Error),
    ]);

    for (const outcome of outcomes) {
      expect(outcome).toBeInstanceOf(MailboxNotFoundError);
      expect((outcome as Error).message).toBe((outcomes[0] as Error).message);
    }
  });

  it('accepts only bucket sizes and base64url', async () => {
    await expect(
      appender.append(MAILBOX, POST, 'a'.repeat(22), body(1000)),
    ).rejects.toBeInstanceOf(MailboxEnvelopeInvalidError);
    await expect(
      appender.append(MAILBOX, POST, 'a'.repeat(22), '!!!!'),
    ).rejects.toBeInstanceOf(MailboxEnvelopeInvalidError);
    await expect(
      appender.append(MAILBOX, POST, 'a'.repeat(22), body(4096)),
    ).resolves.toEqual({ created: true, cursor: 1 });
  });

  it('dedupes by envelopeId and returns the first cursor', async () => {
    await appender.append(MAILBOX, POST, 'a'.repeat(22), body(1024));
    await appender.append(MAILBOX, POST, 'b'.repeat(22), body(1024));

    await expect(
      appender.append(MAILBOX, POST, 'a'.repeat(22), body(1024)),
    ).resolves.toEqual({ created: false, cursor: 1 });
    expect((await reader.read(MAILBOX, READ, 0, 10)).envelopes).toHaveLength(2);
  });

  it('notifies realtime listeners only for newly appended envelopes, in cursor order', async () => {
    await appender.append(MAILBOX, POST, 'a'.repeat(22), body(1024));
    await appender.append(MAILBOX, POST, 'a'.repeat(22), body(1024));
    await appender.append(MAILBOX, POST, 'b'.repeat(22), body(1024));
    await expect(
      appender.append(MAILBOX, POST, 'c'.repeat(22), '!!!!'),
    ).rejects.toBeInstanceOf(MailboxEnvelopeInvalidError);

    expect(notifier.envelopeAppended.mock.calls).toEqual([
      [MAILBOX, 1],
      [MAILBOX, 2],
    ]);
  });

  it('refuses instead of dropping when the envelope or byte limit is reached', async () => {
    process.env.MAILBOX_MAX_ENVELOPES = '2';
    await appender.append(MAILBOX, POST, 'a'.repeat(22), body(1024));
    await appender.append(MAILBOX, POST, 'b'.repeat(22), body(1024));

    await expect(
      appender.append(MAILBOX, POST, 'c'.repeat(22), body(1024)),
    ).rejects.toBeInstanceOf(MailboxFullError);
    expect(
      (await reader.read(MAILBOX, READ, 0, 10)).envelopes.map((e) => e.cursor),
    ).toEqual([1, 2]);

    process.env.MAILBOX_MAX_ENVELOPES = '100';
    process.env.MAILBOX_MAX_BYTES = '3000';

    await expect(
      appender.append(MAILBOX, POST, 'c'.repeat(22), body(1024)),
    ).rejects.toBeInstanceOf(MailboxFullError);
  });

  it('pages in cursor order past ten envelopes and survives restart', async () => {
    for (let i = 0; i < 12; i += 1) {
      await appender.append(
        MAILBOX,
        POST,
        String(i).padStart(22, 'z'),
        body(1024),
      );
    }

    const first = await reader.read(MAILBOX, READ, 0, 5);

    expect(first.envelopes.map((e) => e.cursor)).toEqual([1, 2, 3, 4, 5]);
    expect(first.hasMore).toBe(true);

    await database.close();
    wire();
    const rest = await reader.read(MAILBOX, READ, 5, 100);

    expect(rest.envelopes.map((e) => e.cursor)).toEqual([
      6, 7, 8, 9, 10, 11, 12,
    ]);
    expect(rest.hasMore).toBe(false);
  });

  it('frees capacity on acknowledge and never reuses cursors', async () => {
    process.env.MAILBOX_MAX_ENVELOPES = '2';
    await appender.append(MAILBOX, POST, 'a'.repeat(22), body(1024));
    await appender.append(MAILBOX, POST, 'b'.repeat(22), body(1024));
    await acknowledger.acknowledge(MAILBOX, READ, 1);

    await expect(
      appender.append(MAILBOX, POST, 'c'.repeat(22), body(1024)),
    ).resolves.toEqual({ created: true, cursor: 3 });
    expect(
      (await reader.read(MAILBOX, READ, 0, 10)).envelopes.map((e) => e.cursor),
    ).toEqual([2, 3]);
  });

  it('deletes a mailbox and its envelopes', async () => {
    await appender.append(MAILBOX, POST, 'a'.repeat(22), body(1024));
    await remover.remove(MAILBOX, READ);

    await expect(reader.read(MAILBOX, READ, 0, 10)).rejects.toBeInstanceOf(
      MailboxNotFoundError,
    );
    await creator.create(MAILBOX, sha(POST), sha(READ));
    expect((await reader.read(MAILBOX, READ, 0, 10)).envelopes).toEqual([]);
  });

  it('expires old envelopes and idle mailboxes but keeps recently read ones', async () => {
    process.env.MAILBOX_RETENTION_MS = '1000';
    const t0 = Date.now();
    const clock = jest.spyOn(Date, 'now');
    const idle = 'i'.repeat(43);

    clock.mockReturnValue(t0);
    await appender.append(MAILBOX, POST, 'a'.repeat(22), body(1024));
    await creator.create(idle, sha(POST), sha(READ));

    clock.mockReturnValue(t0 + 800);
    await reader.read(MAILBOX, READ, 0, 10);
    await expirer.expire(t0 + 1200);
    clock.mockReturnValue(t0 + 1200);

    expect((await reader.read(MAILBOX, READ, 0, 10)).envelopes).toEqual([]);
    await expect(reader.read(idle, READ, 0, 10)).rejects.toBeInstanceOf(
      MailboxNotFoundError,
    );
    clock.mockRestore();
  });

  it('leaves the old state when a batch fails midway', async () => {
    await appender.append(MAILBOX, POST, 'a'.repeat(22), body(1024));
    const failing = jest
      .spyOn(database, 'commit')
      .mockRejectedValueOnce(new Error('disk failure'));

    await expect(
      appender.append(MAILBOX, POST, 'b'.repeat(22), body(1024)),
    ).rejects.toThrow('disk failure');
    failing.mockRestore();

    await expect(
      appender.append(MAILBOX, POST, 'b'.repeat(22), body(1024)),
    ).resolves.toEqual({ created: true, cursor: 2 });
  });
});
