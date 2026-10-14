import EmbeddedLocalDatabase, {
  EmbeddedLocalDatabaseOperation,
} from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';

import { MailboxEnvelopeNotFoundError } from '../../domain/errors/MailboxEnvelopeNotFoundError';
import { MailboxNotFoundError } from '../../domain/errors/MailboxNotFoundError';
import { Mailbox } from '../../domain/Mailbox';
import { MailboxEnvelope } from '../../domain/MailboxEnvelope';
import { MailboxPrimitivesShape } from '../../domain/MailboxPrimitivesShape';
import MailboxRepository from '../../domain/repositories/MailboxRepository';
import { MailboxCursor } from '../../domain/value-objects/MailboxCursor';
import { MailboxEnvelopeId } from '../../domain/value-objects/MailboxEnvelopeId';
import { MailboxId } from '../../domain/value-objects/MailboxId';

/**
 * Embedded local database only: never OrbitDB, IPFS or pubsub. Envelopes and
 * dedupe entries live in a namespace per mailbox so a read scans one range,
 * and a batch makes each write all-or-nothing.
 */
export default class LocalMailboxRepository extends MailboxRepository {
  private static readonly MAILBOXES = 'mailboxes';
  private static readonly COUNTERS = 'mailbox_counters';
  private static readonly MAILBOX_COUNT_ID = 'mailboxes';
  private static readonly RETIRED_CURSOR_ID = 'retired_cursor';

  constructor(private readonly database: EmbeddedLocalDatabase) {
    super();
  }

  private dedupeNamespace(mailboxId: MailboxId): string {
    return `mailbox_dedupe:${mailboxId.valueOf()}`;
  }

  private envelopeId(cursor: number): string {
    return String(cursor).padStart(12, '0');
  }

  private envelopeNamespace(mailboxId: MailboxId): string {
    return `mailbox_envelopes:${mailboxId.valueOf()}`;
  }

  private mailboxPut(mailbox: Mailbox): EmbeddedLocalDatabaseOperation {
    return {
      document: { ...mailbox.toPrimitives() },
      id: mailbox.getId().valueOf(),
      namespace: LocalMailboxRepository.MAILBOXES,
      type: 'put',
    };
  }

  private toEnvelope(document: Record<string, unknown>): MailboxEnvelope {
    const envelope = { ...document };

    delete envelope._id;

    if (!MailboxPrimitivesShape.isMailboxEnvelope(envelope)) {
      throw new Error('Stored mailbox envelope is malformed.');
    }

    return envelope;
  }

  private toMailbox(document: Record<string, unknown>): Mailbox {
    const primitives = { ...document };

    delete primitives._id;

    if (!MailboxPrimitivesShape.isMailboxPrimitives(primitives)) {
      throw new Error('Stored mailbox is malformed.');
    }

    return Mailbox.fromPrimitives(primitives);
  }

  /**
   * The mailbox count lives in its own document, so creation checks are O(1).
   * create and remove update it in the same batch as the mailbox. Every
   * mailbox mutation runs under MailboxCoordinator, so this read-modify-write
   * cannot interleave. An empty database has no counter yet and counts zero.
   */
  private async readCount(): Promise<number> {
    const counter = await this.database.findOne(
      LocalMailboxRepository.COUNTERS,
      LocalMailboxRepository.MAILBOX_COUNT_ID,
    );

    return typeof counter?.count === 'number' ? counter.count : 0;
  }

  public async commitAppend(
    mailbox: Mailbox,
    envelope: MailboxEnvelope,
  ): Promise<void> {
    const id = mailbox.getId();

    await this.database.commit([
      this.mailboxPut(mailbox),
      {
        document: { ...envelope },
        id: this.envelopeId(envelope.cursor),
        namespace: this.envelopeNamespace(id),
        type: 'put',
      },
      {
        document: { cursor: envelope.cursor },
        id: envelope.envelopeId,
        namespace: this.dedupeNamespace(id),
        type: 'put',
      },
    ]);
  }

  public async commitRemoval(
    mailbox: Mailbox,
    removed: MailboxEnvelope[],
  ): Promise<void> {
    const id = mailbox.getId();

    await this.database.commit([
      this.mailboxPut(mailbox),
      ...removed.flatMap((envelope): EmbeddedLocalDatabaseOperation[] => [
        {
          id: this.envelopeId(envelope.cursor),
          namespace: this.envelopeNamespace(id),
          type: 'del',
        },
        {
          id: envelope.envelopeId,
          namespace: this.dedupeNamespace(id),
          type: 'del',
        },
      ]),
    ]);
  }

  public async count(): Promise<number> {
    return this.readCount();
  }

  public async create(mailbox: Mailbox): Promise<void> {
    const count = await this.readCount();

    await this.database.commit([
      this.mailboxPut(mailbox),
      {
        document: { count: count + 1 },
        id: LocalMailboxRepository.MAILBOX_COUNT_ID,
        namespace: LocalMailboxRepository.COUNTERS,
        type: 'put',
      },
    ]);
  }

  public async hasById(id: MailboxId): Promise<boolean> {
    const document = await this.database.findOne(
      LocalMailboxRepository.MAILBOXES,
      id.valueOf(),
    );

    return document !== undefined;
  }

  public async hasEnvelope(
    mailboxId: MailboxId,
    envelopeId: MailboxEnvelopeId,
  ): Promise<boolean> {
    const document = await this.database.findOne(
      this.dedupeNamespace(mailboxId),
      envelopeId.valueOf(),
    );

    return document !== undefined;
  }

  /**
   * Highest cursor any removed mailbox reached; 0 when none. A recreated
   * mailbox starts above it, so no cursor a client still holds can match a
   * new envelope. One number for the node, not one per mailbox: no tombstones.
   */
  public async highestRetiredCursor(): Promise<MailboxCursor> {
    const floor = await this.database.findOne(
      LocalMailboxRepository.COUNTERS,
      LocalMailboxRepository.RETIRED_CURSOR_ID,
    );

    return typeof floor?.cursor === 'number'
      ? new MailboxCursor(floor.cursor)
      : MailboxCursor.none();
  }

  public async listAll(): Promise<Mailbox[]> {
    const documents = await this.database.find(
      LocalMailboxRepository.MAILBOXES,
    );

    return documents.map((document) => this.toMailbox(document));
  }

  public async listEnvelopes(
    mailboxId: MailboxId,
    after: number,
    limit: number,
  ): Promise<MailboxEnvelope[]> {
    const documents = await this.database.find(
      this.envelopeNamespace(mailboxId),
    );

    return documents
      .map((document) => this.toEnvelope(document))
      .filter((envelope) => envelope.cursor > after)
      .slice(0, limit);
  }

  public async remove(mailboxId: MailboxId): Promise<void> {
    const existing = await this.database.findOne(
      LocalMailboxRepository.MAILBOXES,
      mailboxId.valueOf(),
    );
    const count = await this.readCount();
    const retired = await this.highestRetiredCursor();
    const floor = existing
      ? retired.max(this.toMailbox(existing).highestCursor())
      : retired;
    const envelopes = (
      await this.database.find(this.envelopeNamespace(mailboxId))
    ).map((document) => this.toEnvelope(document));

    await this.database.commit([
      {
        id: mailboxId.valueOf(),
        namespace: LocalMailboxRepository.MAILBOXES,
        type: 'del',
      },
      {
        document: { count: existing ? count - 1 : count },
        id: LocalMailboxRepository.MAILBOX_COUNT_ID,
        namespace: LocalMailboxRepository.COUNTERS,
        type: 'put',
      },
      {
        document: { cursor: floor.valueOf() },
        id: LocalMailboxRepository.RETIRED_CURSOR_ID,
        namespace: LocalMailboxRepository.COUNTERS,
        type: 'put',
      },
      ...envelopes.flatMap((envelope): EmbeddedLocalDatabaseOperation[] => [
        {
          id: this.envelopeId(envelope.cursor),
          namespace: this.envelopeNamespace(mailboxId),
          type: 'del',
        },
        {
          id: envelope.envelopeId,
          namespace: this.dedupeNamespace(mailboxId),
          type: 'del',
        },
      ]),
    ]);
  }

  public async requireById(id: MailboxId): Promise<Mailbox> {
    const document = await this.database.findOne(
      LocalMailboxRepository.MAILBOXES,
      id.valueOf(),
    );

    if (!document) {
      throw new MailboxNotFoundError();
    }

    return this.toMailbox(document);
  }

  public async requireEnvelopeCursor(
    mailboxId: MailboxId,
    envelopeId: MailboxEnvelopeId,
  ): Promise<number> {
    const document = await this.database.findOne(
      this.dedupeNamespace(mailboxId),
      envelopeId.valueOf(),
    );

    if (typeof document?.cursor !== 'number') {
      throw new MailboxEnvelopeNotFoundError();
    }

    return document.cursor;
  }

  public async save(mailbox: Mailbox): Promise<void> {
    await this.database.commit([this.mailboxPut(mailbox)]);
  }
}
