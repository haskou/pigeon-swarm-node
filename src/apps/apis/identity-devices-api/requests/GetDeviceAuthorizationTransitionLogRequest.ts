import { DeviceAuthorizationTransitionLogFindMessage } from '@app/contexts/identity-devices/application/find/messages/DeviceAuthorizationTransitionLogFindMessage';
import { DeviceAuthorizationTransitionReader } from '@app/contexts/identity-devices/domain/DeviceAuthorizationTransitionReader';
import { DeviceAuthorizationRevision } from '@app/contexts/identity-devices/domain/value-objects/DeviceAuthorizationRevision';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { assert } from '@haskou/value-objects';

import { InvalidDeviceAuthorizationTransitionLogRequestError } from '../errors/InvalidDeviceAuthorizationTransitionLogRequestError';

export class GetDeviceAuthorizationTransitionLogRequest {
  private static readonly REVISION_PATTERN = /^(0|[1-9]\d*)$/;

  public constructor(
    private readonly identityId: IdentityId,
    private readonly reader: DeviceAuthorizationTransitionReader,
    private readonly after: unknown,
  ) {}

  /** A non-negative decimal safe integer without leading zeros. */
  private afterRevision(): DeviceAuthorizationRevision {
    const { after } = this;

    assert(
      typeof after === 'string' &&
        GetDeviceAuthorizationTransitionLogRequest.REVISION_PATTERN.test(
          after,
        ) &&
        Number.isSafeInteger(Number(after)),
      new InvalidDeviceAuthorizationTransitionLogRequestError(),
    );

    return new DeviceAuthorizationRevision(Number(after));
  }

  public getMessage(): DeviceAuthorizationTransitionLogFindMessage {
    return new DeviceAuthorizationTransitionLogFindMessage(
      this.identityId,
      this.reader,
      this.after === undefined
        ? DeviceAuthorizationRevision.initial()
        : this.afterRevision(),
    );
  }
}
