import ConfigurationReader from '../../application/find-vapid-public-key/PushVapidConfigurationReader';

export default class PushVapidConfiguration extends ConfigurationReader {
  private readonly subject: string =
    process.env.PUSH_VAPID_SUBJECT || 'mailto:admin@localhost';

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
      process.env.PUSH_VAPID_PUBLIC_KEY || '',
      process.env.PUSH_VAPID_PRIVATE_KEY || '',
    );
  }
}
