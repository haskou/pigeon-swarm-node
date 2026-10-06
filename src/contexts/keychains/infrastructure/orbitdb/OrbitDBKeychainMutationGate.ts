import { Keychain } from '@app/contexts/keychains/domain/Keychain';
import KeychainSignatureDomainService from '@app/contexts/keychains/domain/services/KeychainSignatureDomainService';
import IPFS from '@app/contexts/shared/infrastructure/ipfs/IPFS';
import { OrbitDBMutationGate } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBMutationGate';

import IpfsKeychainMapper from '../ipfs/mappers/IpfsKeychainMapper';

/**
 * Admits a replicated keychain record only when it is the owner's own signed
 * keychain: the owner identity id is the public key that verifies the
 * signature, and the record cid is the canonical content id of the signed
 * document. A peer can therefore replay an owner's keychains but never forge,
 * alter or reorder one, nor plant it under another owner's head key.
 */
export class OrbitDBKeychainMutationGate extends OrbitDBMutationGate {
  public static readonly COLLECTION = 'keychains';
  public static readonly OWNER_HEAD_PREFIX = 'keychain:';
  public static readonly CID_HEAD_PREFIX = 'keychain-cid:';

  constructor(
    private readonly signatures: KeychainSignatureDomainService,
    private readonly mapper: IpfsKeychainMapper,
    private readonly ipfsManager: IPFS,
  ) {
    super();
  }

  private stringValue(
    record: Record<string, unknown>,
    attribute: string,
  ): string | undefined {
    const value = record[attribute];

    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  private keychainFrom(record: Record<string, unknown>): Keychain | undefined {
    const encryptedPayload = this.stringValue(record, 'encryptedPayload');
    const ownerIdentityId = this.stringValue(record, 'ownerIdentityId');
    const signature = this.stringValue(record, 'signature');
    const { timestamp, version } = record;

    if (
      !encryptedPayload ||
      !ownerIdentityId ||
      !signature ||
      typeof timestamp !== 'number' ||
      typeof version !== 'number'
    ) {
      return undefined;
    }

    return Keychain.fromPrimitives({
      encryptedPayload,
      ownerIdentityId,
      previousKeychainExternalIdentifier: this.stringValue(
        record,
        'previousCid',
      ),
      signature,
      timestamp,
      version,
    });
  }

  private async isCanonical(
    keychain: Keychain,
    cid: string | undefined,
  ): Promise<boolean> {
    const calculated = await this.ipfsManager.calculateJSONId(
      this.mapper.toDocument(keychain),
    );

    return calculated.valueOf() === cid;
  }

  private async isAuthentic(record: Record<string, unknown>): Promise<boolean> {
    try {
      const keychain = this.keychainFrom(record);

      if (!keychain || !this.signatures.isValidSignature(keychain)) {
        return false;
      }

      const hasPrevious = keychain.getPreviousKeychainExternalIdentifier();

      if (keychain.isFirstVersion() === Boolean(hasPrevious)) {
        return false;
      }

      return await this.isCanonical(keychain, this.stringValue(record, 'cid'));
    } catch {
      return false;
    }
  }

  public governs(collection: string): boolean {
    return collection === OrbitDBKeychainMutationGate.COLLECTION;
  }

  public async accepts(
    collection: string,
    record: Record<string, unknown>,
  ): Promise<boolean> {
    if (!this.governs(collection)) return true;

    return (
      record.id === record.cid &&
      record.deleted === undefined &&
      (await this.isAuthentic(record))
    );
  }

  public governsHead(key: string): boolean {
    return (
      key.startsWith(OrbitDBKeychainMutationGate.OWNER_HEAD_PREFIX) ||
      key.startsWith(OrbitDBKeychainMutationGate.CID_HEAD_PREFIX)
    );
  }

  public async acceptsHead(
    key: string,
    record: Record<string, unknown>,
  ): Promise<boolean> {
    if (!this.governsHead(key)) return true;

    const bound = key.startsWith(OrbitDBKeychainMutationGate.OWNER_HEAD_PREFIX)
      ? `${OrbitDBKeychainMutationGate.OWNER_HEAD_PREFIX}${String(record.ownerIdentityId)}`
      : `${OrbitDBKeychainMutationGate.CID_HEAD_PREFIX}${String(record.cid)}`;

    return (
      key === bound &&
      record.deleted === undefined &&
      (await this.isAuthentic(record))
    );
  }
}
