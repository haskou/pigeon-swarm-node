import { Libp2pPubSubNode } from './Libp2pPubSubNode';

export default class Libp2pGossipsubRuntimeAdapter {
  private heliaLibp2pModulePromise?: Promise<typeof import('@helia/libp2p')>;
  private libp2pModulePromise?: Promise<typeof import('libp2p')>;
  private gossipsubModulePromise?: Promise<typeof import('@libp2p/gossipsub')>;

  private async nativeImport<TModule>(modulePath: string): Promise<TModule> {
    if (process.env.JEST_WORKER_ID !== undefined) {
      return import(modulePath) as TModule;
    }

    const importer = new Function('path', 'return import(path)') as (
      path: string,
    ) => Promise<TModule>;

    return importer(modulePath);
  }

  private loadHeliaLibp2pModule(): Promise<typeof import('@helia/libp2p')> {
    this.heliaLibp2pModulePromise ??=
      this.nativeImport<typeof import('@helia/libp2p')>('@helia/libp2p');

    return this.heliaLibp2pModulePromise;
  }

  private loadLibp2pModule(): Promise<typeof import('libp2p')> {
    this.libp2pModulePromise ??=
      this.nativeImport<typeof import('libp2p')>('libp2p');

    return this.libp2pModulePromise;
  }

  private loadGossipsubModule(): Promise<typeof import('@libp2p/gossipsub')> {
    this.gossipsubModulePromise ??=
      this.nativeImport<typeof import('@libp2p/gossipsub')>(
        '@libp2p/gossipsub',
      );

    return this.gossipsubModulePromise;
  }

  private withoutWebRtcTransports<
    TConfig extends {
      addresses?: { listen?: string[] };
      transports?: Array<(...args: unknown[]) => unknown>;
    },
  >(config: TConfig): TConfig {
    return {
      ...config,
      addresses: {
        ...(config.addresses || {}),
        listen: (config.addresses?.listen || []).filter(
          (address) => !address.includes('webrtc'),
        ),
      },
      transports: (config.transports || []).filter((transport) => {
        const source = transport.toString().toLowerCase();

        return !source.includes('webrtc');
      }),
    };
  }

  public async createNode(): Promise<Libp2pPubSubNode> {
    const [heliaLibp2pModule, libp2pModule, gossipsubModule] =
      await Promise.all([
        this.loadHeliaLibp2pModule(),
        this.loadLibp2pModule(),
        this.loadGossipsubModule(),
      ]);
    const libp2pConfig = this.withoutWebRtcTransports(
      heliaLibp2pModule.libp2pDefaults(),
    );
    const configWithServices = libp2pConfig as unknown as {
      services: Record<string, unknown>;
    };

    configWithServices.services = {
      ...(configWithServices.services || {}),
      pubsub: gossipsubModule.gossipsub({
        allowPublishToZeroTopicPeers: true,
      }) as unknown,
    };

    return libp2pModule.createLibp2p(
      libp2pConfig as unknown as Parameters<
        typeof libp2pModule.createLibp2p
      >[0],
    ) as unknown as Libp2pPubSubNode;
  }
}
