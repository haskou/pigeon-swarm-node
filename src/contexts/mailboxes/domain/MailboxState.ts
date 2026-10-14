import { Timestamp } from '@haskou/value-objects';

import { MailboxReaderCursor } from './MailboxReaderCursor';
import { MailboxCursor } from './value-objects/MailboxCursor';
import { MailboxId } from './value-objects/MailboxId';
import { MailboxPostTokenHash } from './value-objects/MailboxPostTokenHash';

export interface MailboxState {
  appendRefilledAt: Timestamp;
  appendTokens: number;
  bytes: number;
  createdAt: Timestamp;
  envelopeCount: number;
  id: MailboxId;
  lastReadAt: Timestamp;
  nextCursor: MailboxCursor;
  postTokenHash: MailboxPostTokenHash;
  readers: MailboxReaderCursor[];
}
