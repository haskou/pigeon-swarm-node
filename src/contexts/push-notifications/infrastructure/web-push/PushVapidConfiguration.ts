export class PushVapidConfiguration {
  constructor(
    private readonly publicKey: string = process.env.PUSH_VAPID_PUBLIC_KEY ||
      '',
    private readonly privateKey: string = process.env.PUSH_VAPID_PRIVATE_KEY ||
      '',
    private readonly subject: string = process.env.PUSH_VAPID_SUBJECT ||
      'mailto:admin@localhost',
  ) {}

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
