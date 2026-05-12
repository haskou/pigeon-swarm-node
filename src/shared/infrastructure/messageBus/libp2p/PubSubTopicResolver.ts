export default class PubSubTopicResolver {
  private readonly defaultPrefix = 'pigeon-swarm';

  constructor(private readonly prefix = process.env.PUBSUB_TOPIC_PREFIX) {}

  private getPrefix(): string {
    return this.prefix || this.defaultPrefix;
  }

  public fromRoutingKey(routingKey: string): string {
    const [context, version] = routingKey.split('.');

    if (!context || !version) {
      return `${this.getPrefix()}.${routingKey}`;
    }

    return `${this.getPrefix()}.${context}.${version}.announcements`;
  }

  public fromRoutingKeyForNetwork(
    routingKey: string,
    networkId: string,
  ): string {
    const [context, version] = routingKey.split('.');

    if (!context || !version) {
      return `${this.getPrefix()}.networks.${networkId}.${routingKey}`;
    }

    return `${this.getPrefix()}.networks.${networkId}.${context}.${version}.announcements`;
  }
}
