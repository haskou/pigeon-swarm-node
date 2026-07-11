import { assert, PrimitiveOf } from '@haskou/value-objects';

import { CommunityChannelMessagePayloadMismatchError } from '../../errors/CommunityChannelMessagePayloadMismatchError';
import { CommunityChannelMessageEncryptedPayload } from '../../value-objects/CommunityChannelMessageEncryptedPayload';
import { CommunityChannelMessagePlaintextPayload } from '../../value-objects/CommunityChannelMessagePlaintextPayload';
import { CommunityVisibility } from '../../value-objects/CommunityVisibility';

export class CommunityChannelMessagePayload {
  public static encrypted(
    encryptedPayload: CommunityChannelMessageEncryptedPayload,
  ): CommunityChannelMessagePayload {
    return new CommunityChannelMessagePayload(encryptedPayload, undefined);
  }

  public static plaintext(
    plaintextPayload: CommunityChannelMessagePlaintextPayload,
  ): CommunityChannelMessagePayload {
    return new CommunityChannelMessagePayload(undefined, plaintextPayload);
  }

  public static fromPrimitives(
    primitives: PrimitiveOf<CommunityChannelMessagePayload>,
  ): CommunityChannelMessagePayload {
    return new CommunityChannelMessagePayload(
      primitives.encryptedPayload
        ? new CommunityChannelMessageEncryptedPayload(
            primitives.encryptedPayload,
          )
        : undefined,
      primitives.plaintextPayload
        ? new CommunityChannelMessagePlaintextPayload(
            primitives.plaintextPayload,
          )
        : undefined,
    );
  }

  constructor(
    private readonly encryptedPayload:
      CommunityChannelMessageEncryptedPayload | undefined,
    private readonly plaintextPayload:
      CommunityChannelMessagePlaintextPayload | undefined,
  ) {
    assert(
      Boolean(encryptedPayload) !== Boolean(plaintextPayload),
      new CommunityChannelMessagePayloadMismatchError(
        'Community channel messages must contain exactly one encryptedPayload or plaintextPayload.',
      ),
    );
  }

  public ensureMatchesVisibility(visibility: CommunityVisibility): void {
    assert(
      (visibility.isPrivate() && this.isEncrypted()) ||
        (visibility.isPublic() && this.isPlaintext()),
      new CommunityChannelMessagePayloadMismatchError(
        visibility.isPrivate()
          ? 'Private communities require encryptedPayload and cannot receive plaintextPayload.'
          : 'Public communities require plaintextPayload and cannot receive encryptedPayload.',
      ),
    );
  }

  public isEncrypted(): boolean {
    return Boolean(this.encryptedPayload);
  }

  public isPlaintext(): boolean {
    return Boolean(this.plaintextPayload);
  }

  public toPrimitives() {
    return {
      encryptedPayload: this.encryptedPayload?.valueOf(),
      plaintextPayload: this.plaintextPayload?.valueOf(),
    };
  }
}
