import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Signature } from '@haskou/pigeon-swarm-crypto';

/**
 * A block list as it travels between nodes: the canonical JSON (RFC 8785)
 * bytes of the document without `identitySignature`, and that signature apart.
 * The owner signs `"pigeon:node-block-list:v1\n"` followed by exactly these
 * bytes, so a fetched list is verified against the pinned identity before any
 * of its bytes is parsed.
 */
export class SignedNodeBlockList {
  private static readonly SIGNING_DOMAIN = Buffer.from(
    'pigeon:node-block-list:v1\n',
    'utf8',
  );

  constructor(
    private readonly content: Buffer,
    private readonly identitySignature: Signature,
  ) {}

  public getContent(): Buffer {
    return this.content;
  }

  public getIdentitySignature(): Signature {
    return this.identitySignature;
  }

  public isSignedBy(identityId: IdentityId): boolean {
    try {
      return identityId.isValidSignature(
        Buffer.concat([SignedNodeBlockList.SIGNING_DOMAIN, this.content]),
        this.identitySignature,
      );
    } catch {
      return false;
    }
  }

  public isEqual(other: unknown): boolean {
    return (
      other instanceof SignedNodeBlockList &&
      this.content.equals(other.content) &&
      this.identitySignature.valueOf() === other.identitySignature.valueOf()
    );
  }
}
