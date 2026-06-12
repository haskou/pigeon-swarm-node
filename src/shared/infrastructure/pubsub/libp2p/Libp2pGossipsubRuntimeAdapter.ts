import { Libp2pPubSubNode } from './Libp2pPubSubNode';

export default class Libp2pGossipsubRuntimeAdapter {
  private heliaModulePromise?: Promise<typeof import('helia')>;
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

  private loadHeliaModule(): Promise<typeof import('helia')> {
    this.heliaModulePromise ??=
      this.nativeImport<typeof import('helia')>('helia');

    return this.heliaModulePromise;
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
    const [heliaModule, libp2pModule, gossipsubModule] = await Promise.all([
      this.loadHeliaModule(),
      this.loadLibp2pModule(),
      this.loadGossipsubModule(),
    ]);
    const libp2pConfig = this.withoutWebRtcTransports(
      heliaModule.libp2pDefaults(),
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
