import { assert, StringValueObject } from '@haskou/value-objects';

import { InvalidPushSubscriptionEndpointError } from '../errors/InvalidPushSubscriptionEndpointError';

export class PushSubscriptionEndpoint extends StringValueObject {
  private static readonly SUPPORTED_PROVIDER_HOSTS = [
    'fcm.googleapis.com',
    'updates.push.services.mozilla.com',
    'web.push.apple.com',
  ];

  constructor(value: string | StringValueObject) {
    super(value);

    assert(
      this.isSupportedWebPushEndpoint(),
      new InvalidPushSubscriptionEndpointError(),
    );
  }

  private isSupportedWebPushEndpoint(): boolean {
    const endpointUrl = this.endpointUrl();

    if (!endpointUrl) {
      return false;
    }

    return (
      endpointUrl.protocol === 'https:' &&
      PushSubscriptionEndpoint.SUPPORTED_PROVIDER_HOSTS.includes(
        endpointUrl.hostname,
      )
    );
  }

  private endpointUrl(): URL | undefined {
    try {
      return new URL(this.value);
    } catch {
      return undefined;
    }
  }
}
