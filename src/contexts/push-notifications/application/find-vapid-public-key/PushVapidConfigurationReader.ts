export default abstract class PushVapidConfigurationReader {
  public abstract getPublicKey(): string | null;
  public abstract isConfigured(): boolean;
}
