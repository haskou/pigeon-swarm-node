import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';

import ConfigurationReader from '../../application/find-vapid-public-key/PushVapidConfigurationReader';

export default class PushVapidConfiguration extends ConfigurationReader {
  private readonly subject: string = pigeonEnvironment().PUSH_VAPID_SUBJECT;

  public setVapidDetailsWith(
    setVapidDetails: (
      subject: string,
      publicKey: string,
      privateKey: string,
    ) => void,
  ): void {
    if (!this.isConfigured()) {
      return;
    }

    setVapidDetails(
      this.subject,
      pigeonEnvironment().PUSH_VAPID_PUBLIC_KEY || '',
      pigeonEnvironment().PUSH_VAPID_PRIVATE_KEY || '',
    );
  }
}
