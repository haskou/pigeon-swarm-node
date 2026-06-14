export type PublicRelayPubSubConnection = {
  publishPubSub(topic: string, payload: string): Promise<void>;
  subscribePubSub(
    topic: string,
    handler: (payload: string) => Promise<void>,
  ): Promise<void>;
};
