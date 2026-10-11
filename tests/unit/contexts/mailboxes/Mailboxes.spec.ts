import MailboxAcknowledger from '@app/contexts/mailboxes/application/MailboxAcknowledger';
import MailboxAppender from '@app/contexts/mailboxes/application/MailboxAppender';
import MailboxCoordinator from '@app/contexts/mailboxes/application/MailboxCoordinator';
import MailboxCreator from '@app/contexts/mailboxes/application/MailboxCreator';
import MailboxEnvelopeNotifier from '@app/contexts/mailboxes/application/MailboxEnvelopeNotifier';
import MailboxExpirer from '@app/contexts/mailboxes/application/MailboxExpirer';
import MailboxReader from '@app/contexts/mailboxes/application/MailboxReader';
import MailboxRemover from '@app/contexts/mailboxes/application/MailboxRemover';
import { MailboxAppendRateLimitedError } from '@app/contexts/mailboxes/domain/errors/MailboxAppendRateLimitedError';
import { MailboxConflictError } from '@app/contexts/mailboxes/domain/errors/MailboxConflictError';
import { MailboxCreationProofInvalidError } from '@app/contexts/mailboxes/domain/errors/MailboxCreationProofInvalidError';
import { MailboxEnvelopeInvalidError } from '@app/contexts/mailboxes/domain/errors/MailboxEnvelopeInvalidError';
import { MailboxFullError } from '@app/contexts/mailboxes/domain/errors/MailboxFullError';
import { MailboxLimitReachedError } from '@app/contexts/mailboxes/domain/errors/MailboxLimitReachedError';
import { MailboxNotFoundError } from '@app/contexts/mailboxes/domain/errors/MailboxNotFoundError';
import { MailboxCreationDifficulty } from '@app/contexts/mailboxes/domain/MailboxCreationDifficulty';
import { MailboxCreationProof } from '@app/contexts/mailboxes/domain/MailboxCreationProof';
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
const RATED = 'q'.repeat(43);
const FRESH = 'n'.repeat(43);
const SECOND = 'o'.repeat(43);
const THIRD = 'p'.repeat(43);
const POST_HASH = sha(POST);
const READ_HASH = sha(READ);
const DAY = 24 * 60 * 60 * 1000;
const IDLE_MS = MailboxPolicy.EVICTION_IDLE_MS;
/**
 * MailboxCreationProof.mine(FRESH, POST_HASH, READ_HASH, 20), computed once:
 * mining 20 bits takes about seven seconds under jest.
 */
const FULL_NONCE = '1761816';

/** First nonce that meets `meets` difficulty bits but not `misses`. */
const proofMeeting = (
  id: string,
  postHash: string,
  readHash: string,
  meets: number,
  misses: number,
): string => {
  for (let nonce = 0; ; nonce += 1) {
    const candidate = nonce.toString();

    if (
      MailboxCreationProof.isValid(id, postHash, readHash, candidate, meets) &&
      !MailboxCreationProof.isValid(id, postHash, readHash, candidate, misses)
    ) {
      return candidate;
    }
  }
};

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
    'MAILBOX_APPEND_RATE_PER_MINUTE',
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

  const createMailbox = (
    id: string,
    postHash: string,
    readHash: string,
    difficultyBits = MailboxCreationDifficulty.MIN_BITS,
  ): Promise<boolean> =>
    creator.create(
      id,
      postHash,
      readHash,
      MailboxCreationProof.mine(id, postHash, readHash, difficultyBits),
    );

  beforeEach(async () => {
    for (const key of envKeys) {
      saved[key] = process.env[key];
    }
    databasePath = await fs.mkdtemp(path.join(os.tmpdir(), 'pigeon-mailbox-'));
    process.env.PIGEON_LOCAL_DB_PATH = databasePath;
    wire();
    await createMailbox(MAILBOX, sha(POST), sha(READ));
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
    await expect(createMailbox(MAILBOX, sha(POST), sha(READ))).resolves.toBe(
      false,
    );
    await expect(
      createMailbox(MAILBOX, sha('other'), sha(READ)),
    ).rejects.toBeInstanceOf(MailboxConflictError);
  });

  it('stops creating at MAILBOX_MAX_COUNT', async () => {
    process.env.MAILBOX_MAX_COUNT = '1';

    await expect(
      creator.create(FRESH, POST_HASH, READ_HASH, FULL_NONCE),
    ).rejects.toBeInstanceOf(MailboxLimitReachedError);
  });

  it('counts in constant time and keeps the count across a restart', async () => {
    await createMailbox('n'.repeat(43), sha(POST), sha(READ));
    await createMailbox('o'.repeat(43), sha(POST), sha(READ));
    await remover.remove(MAILBOX, READ);
    await database.close();
    wire();

    const find = jest.spyOn(database, 'find');

    await expect(repository.count()).resolves.toBe(2);
    expect(find).not.toHaveBeenCalled();
    find.mockRestore();
  });

  it('backfills the counter for a database written before it existed', async () => {
    await createMailbox('n'.repeat(43), sha(POST), sha(READ));
    await database.delete('mailbox_counters', 'mailboxes');

    await expect(repository.count()).resolves.toBe(2);

    const find = jest.spyOn(database, 'find');

    await expect(repository.count()).resolves.toBe(2);
    expect(find).not.toHaveBeenCalled();
    find.mockRestore();
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
    await createMailbox(MAILBOX, sha(POST), sha(READ));
    expect((await reader.read(MAILBOX, READ, 0, 10)).envelopes).toEqual([]);
  });

  it('expires old envelopes and idle mailboxes but keeps recently read ones', async () => {
    process.env.MAILBOX_RETENTION_MS = '1000';
    const t0 = Date.now();
    const clock = jest.spyOn(Date, 'now');
    const idle = 'i'.repeat(43);

    clock.mockReturnValue(t0);
    await appender.append(MAILBOX, POST, 'a'.repeat(22), body(1024));
    await createMailbox(idle, sha(POST), sha(READ));

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

  it('refuses creation without a proof of work bound to that mailbox', async () => {
    const other = 'n'.repeat(43);
    const forMailbox = MailboxCreationProof.mine(
      MAILBOX,
      sha(POST),
      sha(READ),
      MailboxCreationDifficulty.MIN_BITS,
    );

    await expect(
      creator.create(other, sha(POST), sha(READ), ''),
    ).rejects.toBeInstanceOf(MailboxCreationProofInvalidError);
    await expect(
      creator.create(other, sha(POST), sha(READ), forMailbox),
    ).rejects.toBeInstanceOf(MailboxCreationProofInvalidError);
    await expect(reader.read(other, READ, 0, 10)).rejects.toBeInstanceOf(
      MailboxNotFoundError,
    );
  });

  it('keeps the full-capacity fixture valid at the full difficulty', () => {
    expect(
      MailboxCreationProof.isValid(
        FRESH,
        POST_HASH,
        READ_HASH,
        FULL_NONCE,
        MailboxCreationDifficulty.MAX_BITS,
      ),
    ).toBe(true);
  });

  it('admits a 16-bit proof while the node is at most half full', async () => {
    process.env.MAILBOX_MAX_COUNT = '2';

    await expect(createMailbox(FRESH, POST_HASH, READ_HASH)).resolves.toBe(
      true,
    );
  });

  it('raises the required difficulty as the node fills past half', async () => {
    process.env.MAILBOX_MAX_COUNT = '4';
    await createMailbox(SECOND, POST_HASH, READ_HASH);
    await createMailbox(THIRD, POST_HASH, READ_HASH);

    // Three of four slots are taken, so the next mailbox needs 18 bits.
    const weak = proofMeeting(FRESH, POST_HASH, READ_HASH, 16, 18);
    const refusal = await creator
      .create(FRESH, POST_HASH, READ_HASH, weak)
      .catch((e: unknown) => e);

    expect(refusal).toBeInstanceOf(MailboxCreationProofInvalidError);
    expect(
      (refusal as MailboxCreationProofInvalidError).requiredDifficultyBits,
    ).toBe(18);
    await expect(createMailbox(FRESH, POST_HASH, READ_HASH, 18)).resolves.toBe(
      true,
    );
  });

  it('reports the required difficulty when a proof falls short at capacity', async () => {
    process.env.MAILBOX_MAX_COUNT = '1';
    const weak = proofMeeting(FRESH, POST_HASH, READ_HASH, 16, 20);
    const refusal = await creator
      .create(FRESH, POST_HASH, READ_HASH, weak)
      .catch((e: unknown) => e);

    expect(refusal).toBeInstanceOf(MailboxCreationProofInvalidError);
    expect(
      (refusal as MailboxCreationProofInvalidError).requiredDifficultyBits,
    ).toBe(20);
    await expect(repository.count()).resolves.toBe(1);
  });

  it('evicts an idle, empty mailbox at capacity so an honest creation succeeds', async () => {
    process.env.MAILBOX_MAX_COUNT = '1';
    const clock = jest
      .spyOn(Date, 'now')
      .mockReturnValue(Date.now() + IDLE_MS + 1000);

    await expect(
      creator.create(FRESH, POST_HASH, READ_HASH, FULL_NONCE),
    ).resolves.toBe(true);
    await expect(repository.findById(MAILBOX)).resolves.toBeUndefined();
    await expect(repository.count()).resolves.toBe(1);
    clock.mockRestore();
  });

  it('never evicts a mailbox that still holds envelopes', async () => {
    process.env.MAILBOX_MAX_COUNT = '1';
    await appender.append(MAILBOX, POST, 'a'.repeat(22), body(1024));
    const clock = jest
      .spyOn(Date, 'now')
      .mockReturnValue(Date.now() + IDLE_MS + 1000);

    await expect(
      creator.create(FRESH, POST_HASH, READ_HASH, FULL_NONCE),
    ).rejects.toBeInstanceOf(MailboxLimitReachedError);
    await expect(repository.findById(MAILBOX)).resolves.toBeDefined();
    clock.mockRestore();
  });

  it('keeps an empty mailbox that was read within the idle window', async () => {
    process.env.MAILBOX_MAX_COUNT = '1';
    const t0 = Date.now();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(t0 + DAY);
    await reader.read(MAILBOX, READ, 0, 10);
    clock.mockReturnValue(t0 + DAY + IDLE_MS - 1000);

    await expect(
      creator.create(FRESH, POST_HASH, READ_HASH, FULL_NONCE),
    ).rejects.toBeInstanceOf(MailboxLimitReachedError);
    clock.mockRestore();
  });

  it('evicts the least recently read idle mailbox first', async () => {
    process.env.MAILBOX_MAX_COUNT = '2';
    const t0 = Date.now();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(t0 + 1000);
    await createMailbox(SECOND, POST_HASH, READ_HASH);
    clock.mockReturnValue(t0 + IDLE_MS + 2000);

    await expect(
      creator.create(FRESH, POST_HASH, READ_HASH, FULL_NONCE),
    ).resolves.toBe(true);
    await expect(repository.findById(MAILBOX)).resolves.toBeUndefined();
    await expect(repository.findById(SECOND)).resolves.toBeDefined();
    clock.mockRestore();
  });

  it('evicts nothing unless it can free enough room for the new mailbox', async () => {
    const t0 = Date.now();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(t0);
    await createMailbox(SECOND, POST_HASH, READ_HASH);
    await createMailbox(THIRD, POST_HASH, READ_HASH);
    clock.mockReturnValue(t0 + DAY);
    await reader.read(THIRD, READ, 0, 10);
    process.env.MAILBOX_MAX_COUNT = '1';
    clock.mockReturnValue(t0 + IDLE_MS + 2000);

    await expect(
      creator.create(FRESH, POST_HASH, READ_HASH, FULL_NONCE),
    ).rejects.toBeInstanceOf(MailboxLimitReachedError);
    await expect(repository.count()).resolves.toBe(3);
    await expect(repository.findById(MAILBOX)).resolves.toBeDefined();
    await expect(repository.findById(SECOND)).resolves.toBeDefined();
    clock.mockRestore();
  });

  it('rate limits appends per mailbox and refills one per interval', async () => {
    process.env.MAILBOX_APPEND_RATE_PER_MINUTE = '3';
    const t0 = Date.now();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(t0);
    await createMailbox(RATED, sha(POST), sha(READ));

    await appender.append(RATED, POST, 'a'.repeat(22), body(1024));
    await appender.append(RATED, POST, 'b'.repeat(22), body(1024));
    await appender.append(RATED, POST, 'c'.repeat(22), body(1024));
    await expect(
      appender.append(RATED, POST, 'd'.repeat(22), body(1024)),
    ).rejects.toBeInstanceOf(MailboxAppendRateLimitedError);

    // Three per minute: one token returns after twenty seconds.
    clock.mockReturnValue(t0 + 20_000);
    await expect(
      appender.append(RATED, POST, 'd'.repeat(22), body(1024)),
    ).resolves.toEqual({ created: true, cursor: 4 });
    clock.mockRestore();
  });

  it('keeps the append rate across a restart', async () => {
    process.env.MAILBOX_APPEND_RATE_PER_MINUTE = '1';
    await createMailbox(RATED, sha(POST), sha(READ));
    await appender.append(RATED, POST, 'a'.repeat(22), body(1024));

    await database.close();
    wire();

    await expect(
      appender.append(RATED, POST, 'b'.repeat(22), body(1024)),
    ).rejects.toBeInstanceOf(MailboxAppendRateLimitedError);
  });

  it('does not charge the append rate for a replayed envelope', async () => {
    process.env.MAILBOX_APPEND_RATE_PER_MINUTE = '1';
    await createMailbox(RATED, sha(POST), sha(READ));
    await appender.append(RATED, POST, 'a'.repeat(22), body(1024));

    await expect(
      appender.append(RATED, POST, 'a'.repeat(22), body(1024)),
    ).resolves.toEqual({ created: false, cursor: 1 });
  });

  it('turns the append rate off with MAILBOX_APPEND_RATE_PER_MINUTE=0', async () => {
    process.env.MAILBOX_APPEND_RATE_PER_MINUTE = '0';
    await createMailbox(RATED, sha(POST), sha(READ));

    for (const letter of ['a', 'b', 'c', 'd', 'e']) {
      await appender.append(RATED, POST, letter.repeat(22), body(1024));
    }

    expect((await reader.read(RATED, READ, 0, 10)).envelopes).toHaveLength(5);
  });
});
