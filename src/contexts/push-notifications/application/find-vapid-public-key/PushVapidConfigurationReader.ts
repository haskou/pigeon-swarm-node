import { pigeonEnvironment } from '@app/apps/PigeonEnvironment';

export default class PushVapidConfigurationReader {
  private readonly publicKey: string =
    pigeonEnvironment().PUSH_VAPID_PUBLIC_KEY || '';

  private readonly privateKey: string =
    pigeonEnvironment().PUSH_VAPID_PRIVATE_KEY || '';

  public getPublicKey(): string | null {
    return this.publicKey || null;
  }

  public isConfigured(): boolean {
    return this.publicKey.length > 0 && this.privateKey.length > 0;
  }
}
