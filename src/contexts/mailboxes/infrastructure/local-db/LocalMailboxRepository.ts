import EmbeddedLocalDatabase, {
  EmbeddedLocalDatabaseOperation,
} from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';

import { Mailbox } from '../../domain/Mailbox';
import { MailboxEnvelope } from '../../domain/MailboxEnvelope';
import { MailboxPrimitives } from '../../domain/MailboxPrimitives';
import MailboxRepository from '../../domain/repositories/MailboxRepository';

/**
 * Embedded local database only: never OrbitDB, IPFS or pubsub. Envelopes and
 * dedupe entries live in a namespace per mailbox so a read scans one range,
 * and a batch makes each write all-or-nothing.
 */
export default class LocalMailboxRepository extends MailboxRepository {
  private static readonly MAILBOXES = 'mailboxes';

  constructor(private readonly database: EmbeddedLocalDatabase) {
    super();
  }

  private dedupeNamespace(mailboxId: string): string {
    return `mailbox_dedupe:${mailboxId}`;
  }

  private envelopeId(cursor: number): string {
    return String(cursor).padStart(12, '0');
  }

  private envelopeNamespace(mailboxId: string): string {
    return `mailbox_envelopes:${mailboxId}`;
  }

  private mailboxPut(mailbox: Mailbox): EmbeddedLocalDatabaseOperation {
    return {
      document: mailbox.toPrimitives() as unknown as Record<string, unknown>,
      id: mailbox.getId(),
      namespace: LocalMailboxRepository.MAILBOXES,
      type: 'put',
    };
  }

  private toEnvelope(document: Record<string, unknown>): MailboxEnvelope {
    return {
      body: document.body as string,
      cursor: document.cursor as number,
      envelopeId: document.envelopeId as string,
      size: document.size as number,
      storedAt: document.storedAt as number,
    };
  }

  private toMailbox(document: Record<string, unknown>): Mailbox {
    const primitives = { ...document };

    delete primitives._id;

    return Mailbox.fromPrimitives(primitives as unknown as MailboxPrimitives);
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
    return (await this.database.find(LocalMailboxRepository.MAILBOXES)).length;
  }

  public async create(mailbox: Mailbox): Promise<void> {
    await this.database.commit([this.mailboxPut(mailbox)]);
  }

  public async findById(id: string): Promise<Mailbox | undefined> {
    const document = await this.database.findOne(
      LocalMailboxRepository.MAILBOXES,
      id,
    );

    return document ? this.toMailbox(document) : undefined;
  }

  public async findCursorByEnvelopeId(
    mailboxId: string,
    envelopeId: string,
  ): Promise<number | undefined> {
    const document = await this.database.findOne(
      this.dedupeNamespace(mailboxId),
      envelopeId,
    );

    return typeof document?.cursor === 'number' ? document.cursor : undefined;
  }

  public async listAll(): Promise<Mailbox[]> {
    const documents = await this.database.find(
      LocalMailboxRepository.MAILBOXES,
    );

    return documents.map((document) => this.toMailbox(document));
  }

  public async listEnvelopes(
    mailboxId: string,
    after: number,
    limit: number,
  ): Promise<MailboxEnvelope[]> {
    const documents = await this.database.find(
      this.envelopeNamespace(mailboxId),
      (document) => (document.cursor as number) > after,
    );

    return documents
      .slice(0, limit)
      .map((document) => this.toEnvelope(document));
  }

  public async remove(mailboxId: string): Promise<void> {
    const envelopes = await this.database.find(
      this.envelopeNamespace(mailboxId),
    );

    await this.database.commit([
      {
        id: mailboxId,
        namespace: LocalMailboxRepository.MAILBOXES,
        type: 'del',
      },
      ...envelopes.flatMap((document): EmbeddedLocalDatabaseOperation[] => [
        {
          id: this.envelopeId(document.cursor as number),
          namespace: this.envelopeNamespace(mailboxId),
          type: 'del',
        },
        {
          id: document.envelopeId as string,
          namespace: this.dedupeNamespace(mailboxId),
          type: 'del',
        },
      ]),
    ]);
  }

  public async save(mailbox: Mailbox): Promise<void> {
    await this.database.commit([this.mailboxPut(mailbox)]);
  }
}
