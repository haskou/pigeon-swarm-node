import { PublicRelayConfiguration } from './PublicRelayConfiguration';

export class PublicRelayAddressFactory {
  public constructor(
    private readonly configuration = PublicRelayConfiguration.fromEnvironment(),
  ) {}

  private publicHostProtocol(): 'dns4' | 'ip4' {
    const host = this.configuration.getPublicHost();

    if (host && /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
      return 'ip4';
    }

    return 'dns4';
  }

  public relayListenAddress(): string {
    return `/ip4/0.0.0.0/tcp/${this.configuration.getRelayPort()}`;
  }

  public libp2pListenAddress(): string {
    return `/ip4/0.0.0.0/tcp/${this.configuration.getLibp2pPort()}`;
  }

  public relayAdvertiseAddress(peerId: string): string | undefined {
    const host = this.configuration.getPublicHost();

    if (!host) {
      return undefined;
    }

    return `/${this.publicHostProtocol()}/${host}/tcp/${this.configuration.getRelayPort()}/p2p/${peerId}`;
  }

  public libp2pAdvertiseAddress(peerId: string): string | undefined {
    const host = this.configuration.getPublicHost();

    if (!host) {
      return undefined;
    }

    return `/${this.publicHostProtocol()}/${host}/tcp/${this.configuration.getLibp2pPort()}/p2p/${peerId}`;
  }
}
