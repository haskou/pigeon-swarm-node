import { DeviceAuthorizationRevision } from '@app/contexts/identity-devices/domain/value-objects/DeviceAuthorizationRevision';
import { assert } from '@haskou/value-objects';

import { InvalidDeviceAuthorizationTransitionLogRequestError } from '../errors/InvalidDeviceAuthorizationTransitionLogRequestError';

export class GetDeviceAuthorizationTransitionLogRequest {
  private static readonly REVISION_PATTERN = /^(0|[1-9]\d*)$/;

  public constructor(private readonly after: unknown) {}

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

  /** The revision the reader already verified; the whole log when absent. */
  public getAfter(): DeviceAuthorizationRevision {
    return this.after === undefined
      ? DeviceAuthorizationRevision.initial()
      : this.afterRevision();
  }
}
