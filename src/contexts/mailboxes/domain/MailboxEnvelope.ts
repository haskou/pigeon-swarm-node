export interface MailboxEnvelope {
  /** Base64url ciphertext, padded by the sender to a size bucket. */
  body: string;
  cursor: number;
  /** Sender-chosen random identifier; the deduplication key. */
  envelopeId: string;
  size: number;
  storedAt: number;
}
