import PushVapidConfigurationReader from './PushVapidConfigurationReader';
import { PushVapidPublicKey } from './PushVapidPublicKey';

export default class PushVapidPublicKeyFinder {
  constructor(private readonly configuration: PushVapidConfigurationReader) {}

  public find(): PushVapidPublicKey {
    return {
      enabled: this.configuration.isConfigured(),
      publicKey: this.configuration.getPublicKey(),
    };
  }
}
