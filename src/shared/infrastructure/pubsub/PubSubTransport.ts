export interface PubSubTransport {
  publish(topic: string, payload: string): Promise<void>;
  subscribe(
    topic: string,
    handler: (payload: string) => Promise<void>,
  ): Promise<void>;
}
