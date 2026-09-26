import { Enum } from '@haskou/value-objects';

const provisionStatuses = {
  ACCEPTED: 'accepted',
  DUPLICATE: 'duplicate',
} as const;

export class PrivateAuthorizationScopeProvisionStatus extends Enum<string> {
  public static readonly ACCEPTED =
    new PrivateAuthorizationScopeProvisionStatus(provisionStatuses.ACCEPTED);

  public static readonly DUPLICATE =
    new PrivateAuthorizationScopeProvisionStatus(provisionStatuses.DUPLICATE);

  public getValues(): string[] {
    return Object.values(provisionStatuses);
  }

  public isAccepted(): boolean {
    return this.isEqual(PrivateAuthorizationScopeProvisionStatus.ACCEPTED);
  }
}
