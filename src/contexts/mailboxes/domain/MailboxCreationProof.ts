import { leadingZeroBits } from '@app/contexts/shared/domain/value-objects/LeadingZeroBits';
import { createHash } from 'node:crypto';

/**
 * Hashcash-style proof that creating a mailbox cost work. SHA-256 over the
 * mailbox id, both capability hashes and the nonce must start with the
 * difficulty bits the caller requires (see MailboxCreationDifficulty).
 * Binding the id and both hashes means a proof solved for one mailbox cannot
 * be replayed for another. Any node verifies it statelessly, before any
 * storage lookup.
 */
export class MailboxCreationProof {
  private static readonly DOMAIN = 'pigeon-mailbox-creation:v1';
  public static readonly MAX_NONCE_LENGTH = 64;

  public static preimage(
    mailboxId: string,
    postTokenHash: string,
    readTokenHash: string,
    nonce: string,
  ): string {
    return [
      MailboxCreationProof.DOMAIN,
      mailboxId,
      postTokenHash,
      readTokenHash,
      nonce,
    ].join(':');
  }

  /** Reference miner: first nonce with difficultyBits leading zero bits. */
  public static mine(
    mailboxId: string,
    postTokenHash: string,
    readTokenHash: string,
    difficultyBits: number,
  ): string {
    const prefix = createHash('sha256').update(
      MailboxCreationProof.preimage(
        mailboxId,
        postTokenHash,
        readTokenHash,
        '',
      ),
    );

    for (let nonce = 0; ; nonce += 1) {
      const candidate = nonce.toString();
      const digest = prefix.copy().update(candidate).digest();

      if (leadingZeroBits(digest) >= difficultyBits) {
        return candidate;
      }
    }
  }

  public static isValid(
    mailboxId: string,
    postTokenHash: string,
    readTokenHash: string,
    nonce: string,
    difficultyBits: number,
  ): boolean {
    if (
      nonce.length === 0 ||
      nonce.length > MailboxCreationProof.MAX_NONCE_LENGTH
    ) {
      return false;
    }

    const digest = createHash('sha256')
      .update(
        MailboxCreationProof.preimage(
          mailboxId,
          postTokenHash,
          readTokenHash,
          nonce,
        ),
      )
      .digest();

    return leadingZeroBits(digest) >= difficultyBits;
  }
}
