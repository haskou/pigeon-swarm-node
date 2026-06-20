import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Password } from '@app/contexts/shared/domain/value-objects/Password';
import {
  EncryptedKeyPair,
  PrimitiveOf,
  Signature,
} from '@haskou/value-objects';

export class IdentitySigningKey {
  public static fromPrimitives(
    primitives: PrimitiveOf<EncryptedKeyPair>,
  ): IdentitySigningKey {
    return new IdentitySigningKey(EncryptedKeyPair.fromPrimitives(primitives));
  }

  constructor(private readonly encryptedKeyPair: EncryptedKeyPair) {}

  private toIdentityId(): IdentityId {
    return new IdentityId(this.toPrimitives().publicKey);
  }

  public identifies(identityId: IdentityId): boolean {
    return this.toIdentityId().isEqual(identityId);
  }

  public signsSameIdentityAs(signingKey: IdentitySigningKey): boolean {
    return this.toIdentityId().isEqual(signingKey.toIdentityId());
  }

  public async sign(content: string, password: Password): Promise<Signature> {
    return this.encryptedKeyPair.sign(content, password);
  }

  public toPrimitives(): PrimitiveOf<EncryptedKeyPair> {
    return this.encryptedKeyPair.toPrimitives();
  }
}
