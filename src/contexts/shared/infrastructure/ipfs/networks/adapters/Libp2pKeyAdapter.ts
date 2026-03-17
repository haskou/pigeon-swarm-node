import type { PrivateKey as Libp2pPrivateKey } from '@libp2p/interface';

export type Libp2pPrivateKeyLike = Libp2pPrivateKey;

export class Libp2pKeyAdapter {
  private keysModulePromise?: Promise<typeof import('@libp2p/crypto/keys')>;

  private loadKeysModule(): Promise<typeof import('@libp2p/crypto/keys')> {
    this.keysModulePromise ??= import('@libp2p/crypto/keys');

    return this.keysModulePromise;
  }

  public generateEd25519KeyPair(): Promise<Libp2pPrivateKey> {
    return this.loadKeysModule().then((keysModule) =>
      keysModule.generateKeyPair('Ed25519'),
    );
  }

  public async privateKeyFromProtobuf(
    protobuf: Uint8Array,
  ): Promise<Libp2pPrivateKey> {
    const keysModule = await this.loadKeysModule();

    return keysModule.privateKeyFromProtobuf(protobuf);
  }

  public async privateKeyToProtobuf(
    privateKey: Libp2pPrivateKey,
  ): Promise<Uint8Array> {
    const keysModule = await this.loadKeysModule();

    return keysModule.privateKeyToProtobuf(privateKey);
  }
}

const libp2pKeyAdapter = new Libp2pKeyAdapter();

export default libp2pKeyAdapter;
