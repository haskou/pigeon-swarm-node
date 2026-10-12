import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

export class DeviceSealedSecretFindMessage {
  public constructor(
    public readonly identityId: IdentityId,
    public readonly recipientCredential: string,
  ) {}
}
