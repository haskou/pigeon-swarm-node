import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';

import PushVapidConfigurationReader from '../../application/find-vapid-public-key/PushVapidConfigurationReader';

export default class PushVapidConfiguration extends PushVapidConfigurationReader {
  private readonly privateKey: string =
    pigeonEnvironment().PUSH_VAPID_PRIVATE_KEY || '';

  private readonly publicKey: string =
    pigeonEnvironment().PUSH_VAPID_PUBLIC_KEY || '';

  private readonly subject: string = pigeonEnvironment().PUSH_VAPID_SUBJECT;

  public getPublicKey(): string | null {
    return this.publicKey || null;
  }

  public isConfigured(): boolean {
    return this.publicKey.length > 0 && this.privateKey.length > 0;
  }

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

    setVapidDetails(this.subject, this.publicKey, this.privateKey);
  }
}
