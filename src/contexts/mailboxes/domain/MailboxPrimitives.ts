export interface MailboxReaderPrimitives {
  ackedCursor: number;
  readTokenHash: string;
}

export interface MailboxPrimitives {
  appendRefilledAt: number;
  appendTokens: number;
  bytes: number;
  createdAt: number;
  envelopeCount: number;
  id: string;
  lastReadAt: number;
  nextCursor: number;
  postTokenHash: string;
  readers: MailboxReaderPrimitives[];
}
