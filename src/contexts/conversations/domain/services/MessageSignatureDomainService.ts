import { Password } from '@app/contexts/shared/domain/value-objects/Password';
import {
  assert,
  EncryptedKeyPair,
  PublicKey,
  Signature,
} from '@haskou/value-objects';

import { Message } from '../entities/messages/Message';
import { MessageSignaturePayload } from '../entities/messages/MessageSignaturePayload';
import { InvalidMessageSignatureError } from '../errors/InvalidMessageSignatureError';

export default class MessageSignatureDomainService {
  public getCanonicalSigningContent(payload: MessageSignaturePayload): string {
    return JSON.stringify(payload.toPrimitives());
  }

  public async generateSignature(
    payload: MessageSignaturePayload,
    encryptedKeyPair: EncryptedKeyPair,
    password: Password,
  ): Promise<Signature> {
    return encryptedKeyPair.sign(
      this.getCanonicalSigningContent(payload),
      password,
    );
  }

  public isValidSignature(
    publicKey: PublicKey,
    payload: MessageSignaturePayload,
    signature: Signature,
  ): boolean {
    return payload
      .toSigningPrimitiveCandidates()
      .some((candidate) =>
        publicKey.isValidSignature(JSON.stringify(candidate), signature),
      );
  }

  public assertValidMessageSignature(message: Message): void {
    assert(
      this.isValidSignature(
        message.getAuthorId(),
        message.toSignaturePayload(),
        message.getSignature(),
      ),
      new InvalidMessageSignatureError(),
    );
  }
}
