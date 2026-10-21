import { DeviceAuthorizationRevision } from '@app/contexts/identity-devices/domain/value-objects/DeviceAuthorizationRevision';
import { assert } from '@haskou/value-objects';

import { InvalidDeviceAuthorizationTransitionLogRequestError } from '../errors/InvalidDeviceAuthorizationTransitionLogRequestError';

export class GetDeviceAuthorizationTransitionLogRequest {
  public static readonly DEFAULT_LIMIT = 50;
  public static readonly MAX_LIMIT = 100;
  private static readonly INTEGER_PATTERN = /^(0|[1-9]\d*)$/;
  private static readonly QUERY_KEYS = ['cursor', 'limit'];

  public constructor(
    private readonly cursor: unknown,
    private readonly limit: unknown,
  ) {}

  /** A non-negative decimal safe integer without leading zeros. */
  private static integerOf(value: unknown): number {
    assert(
      typeof value === 'string' &&
        GetDeviceAuthorizationTransitionLogRequest.INTEGER_PATTERN.test(value) &&
        Number.isSafeInteger(Number(value)),
      new InvalidDeviceAuthorizationTransitionLogRequestError(),
    );

    return Number(value);
  }

  /** Refuses any query parameter other than `cursor` and `limit`. */
  public static fromQuery(
    query: Record<string, unknown>,
  ): GetDeviceAuthorizationTransitionLogRequest {
    assert(
      Object.keys(query).every((key) =>
        GetDeviceAuthorizationTransitionLogRequest.QUERY_KEYS.includes(key),
      ),
      new InvalidDeviceAuthorizationTransitionLogRequestError(),
    );

    return new GetDeviceAuthorizationTransitionLogRequest(
      query.cursor,
      query.limit,
    );
  }

  /** The last revision the reader already holds; the log start when absent. */
  public getCursor(): DeviceAuthorizationRevision {
    return this.cursor === undefined
      ? DeviceAuthorizationRevision.initial()
      : new DeviceAuthorizationRevision(
          GetDeviceAuthorizationTransitionLogRequest.integerOf(this.cursor),
        );
  }

  public getLimit(): number {
    if (this.limit === undefined) {
      return GetDeviceAuthorizationTransitionLogRequest.DEFAULT_LIMIT;
    }
    const limit = GetDeviceAuthorizationTransitionLogRequest.integerOf(
      this.limit,
    );

    assert(
      limit >= 1 &&
        limit <= GetDeviceAuthorizationTransitionLogRequest.MAX_LIMIT,
      new InvalidDeviceAuthorizationTransitionLogRequestError(),
    );

    return limit;
  }
}
