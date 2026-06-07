import type { PrivateKey as Libp2pPrivateKey } from '@libp2p/interface';

import { Libp2pKeysModule } from './types/Libp2pKeysModule';
import { Libp2pPublicKeyLike } from './types/Libp2pPublicKeyLike';

export { Libp2pPrivateKeyLike } from './types/Libp2pPrivateKeyLike';
export { Libp2pPublicKeyLike } from './types/Libp2pPublicKeyLike';

export class Libp2pKeyAdapter {
  private keysModulePromise?: Promise<Libp2pKeysModule>;

  private isJestRuntime(): boolean {
    return process.env.JEST_WORKER_ID !== undefined;
  }

  private async nativeImport<TModule>(modulePath: string): Promise<TModule> {
    if (this.isJestRuntime()) {
      return import(modulePath) as TModule;
    }

    const importer = new Function('path', 'return import(path)') as (
      path: string,
    ) => Promise<TModule>;

    return importer(modulePath);
  }

  private loadKeysModule(): Promise<Libp2pKeysModule> {
    this.keysModulePromise ??= this.nativeImport<Libp2pKeysModule>(
      '@libp2p/crypto/keys',
    );

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

  public async publicKeyFromProtobuf(
    protobuf: Uint8Array,
  ): Promise<Libp2pPublicKeyLike> {
    const keysModule = await this.loadKeysModule();

    return keysModule.publicKeyFromProtobuf(protobuf);
  }

  public async publicKeyToProtobuf(
    publicKey: Libp2pPublicKeyLike,
  ): Promise<Uint8Array> {
    const keysModule = await this.loadKeysModule();

    return keysModule.publicKeyToProtobuf(publicKey);
  }

  public peerIdFromPrivateKey(privateKey: Libp2pPrivateKey): string {
    return privateKey.publicKey.toString();
  }

  public peerIdFromPublicKey(publicKey: Libp2pPublicKeyLike): string {
    return publicKey.toString();
  }
}

const libp2pKeyAdapter = new Libp2pKeyAdapter();

export default libp2pKeyAdapter;
