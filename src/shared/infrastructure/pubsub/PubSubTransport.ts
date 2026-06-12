export default abstract class PubSubTransport {
  public abstract publish(topic: string, payload: string): Promise<void>;
  public abstract subscribe(
    topic: string,
    handler: (payload: string) => Promise<void>,
  ): Promise<void>;
}
