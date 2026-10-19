import { KeychainExternalIdentifierNotFoundError } from '@app/contexts/keychains/domain/errors/KeychainExternalIdentifierNotFoundError';
import { KeychainOwnershipUnverifiedError } from '@app/contexts/keychains/domain/errors/KeychainOwnershipUnverifiedError';
import { Keychain } from '@app/contexts/keychains/domain/Keychain';
import { KeychainCandidate } from '@app/contexts/keychains/domain/KeychainCandidate';
import KeychainRepository from '@app/contexts/keychains/domain/repositories/KeychainRepository';
import { KeychainExternalIdentifier } from '@app/contexts/keychains/domain/value-objects/KeychainExternalIdentifier';
import KeychainMetadataIndex from '@app/contexts/keychains/infrastructure/metadata/KeychainMetadataIndex';
import { KeychainMetadataRecord } from '@app/contexts/keychains/infrastructure/metadata/KeychainMetadataRecord';
import { InvalidPublicMutationError } from '@app/contexts/public-mutations/domain/errors/InvalidPublicMutationError';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { IPFSId } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import IPFS from '@app/contexts/shared/infrastructure/ipfs/IPFS';
import Kernel from '@haskou/ddd-kernel';

import { IpfsKeychainDocument } from './documents/IpfsKeychainDocument';
import IpfsKeychainMapper from './mappers/IpfsKeychainMapper';

export default class IpfsKeychainRepository extends KeychainRepository {
  private readonly ROUTING_KEY_PREFIX = 'pigeon-swarm_keychain-';
  private readonly MAX_ROUTED_CANDIDATES = 20;
  // Above the 100 kB publish body limit (body-parser default), so every
  // keychain a publish can store is readable. Larger records fail closed.
  private readonly MAX_ROUTED_DOCUMENT_BYTES = 256 * 1024;
  private readonly OVERFLOW_LOG_INTERVAL_MS = 60_000;
  private lastOverflowLogAt = 0;
  private readonly keychainByCid = new Map<string, Keychain>();

  constructor(
    private readonly ipfsManager: IPFS,
    private readonly mapper: IpfsKeychainMapper,
    private readonly metadataIndex: KeychainMetadataIndex,
  ) {
    super();
  }

  private async getDocumentFromCid(cid: IPFSId): Promise<IpfsKeychainDocument> {
    try {
      return await this.ipfsManager.getJSON<IpfsKeychainDocument>(cid);
    } catch {
      const bytes = await this.ipfsManager.getBytes(cid);

      return JSON.parse(
        Buffer.from(bytes).toString('utf8'),
      ) as IpfsKeychainDocument;
    }
  }

  private async getKeychainFromCid(cid: IPFSId): Promise<Keychain> {
    const cached = this.keychainByCid.get(cid.valueOf());

    if (cached) {
      return cached;
    }

    const document = await this.getDocumentFromCid(cid);
    const keychain = this.mapper.toDomain(document);

    this.keychainByCid.set(cid.valueOf(), keychain);

    return keychain;
  }

  private async findCandidateFromCid(
    cid: IPFSId,
    shouldSaveMetadata: boolean = true,
  ): Promise<Keychain | undefined> {
    try {
      const keychain = await this.getKeychainFromCid(cid);

      if (shouldSaveMetadata) {
        await this.metadataIndex.save(
          keychain,
          new KeychainExternalIdentifier(cid.valueOf()),
        );
      }

      return keychain;
    } catch {
      this.keychainByCid.delete(cid.valueOf());

      return undefined;
    }
  }

  private async findCandidateReferenceFromMetadata(
    metadata: KeychainMetadataRecord,
  ): Promise<KeychainCandidate | undefined> {
    const externalIdentifier = new KeychainExternalIdentifier(metadata.cid);

    if (metadata.keychain) {
      return KeychainCandidate.localCandidate(
        externalIdentifier,
        metadata.keychain,
      );
    }

    const keychain = await this.findCandidateFromCid(
      new IPFSId(metadata.cid),
      false,
    ).catch((): undefined => undefined);

    return keychain
      ? KeychainCandidate.localCandidate(externalIdentifier, keychain)
      : undefined;
  }

  private async findLocalCandidateReferences(
    metadata: KeychainMetadataRecord[],
  ): Promise<KeychainCandidate[]> {
    const candidates: KeychainCandidate[] = [];

    for (const document of metadata) {
      const candidate = await this.findCandidateReferenceFromMetadata(document);

      if (candidate) {
        candidates.push(candidate);
      }
    }

    return candidates;
  }

  private deduplicateMetadata(
    documents: KeychainMetadataRecord[],
  ): KeychainMetadataRecord[] {
    const deduplicated = new Map<string, KeychainMetadataRecord>();

    for (const document of documents) {
      deduplicated.set(`${document.ownerIdentityId}:${document.cid}`, document);
    }

    return [...deduplicated.values()].sort(
      (left, right) =>
        right.version - left.version || right.receivedAt - left.receivedAt,
    );
  }

  private sortCandidateReferencesByFreshness(
    candidates: KeychainCandidate[],
  ): KeychainCandidate[] {
    return [...candidates].sort((left, right) => {
      if (left.isNewerThan(right)) {
        return -1;
      }

      if (right.isNewerThan(left)) {
        return 1;
      }

      return 0;
    });
  }

  private async findRemoteCandidateReferences(
    ownerIdentityId: IdentityId,
    knownCids: Set<string>,
  ): Promise<KeychainCandidate[]> {
    const cidStrings = await this.ipfsManager.getRecordCandidates(
      this.ROUTING_KEY_PREFIX + ownerIdentityId.valueOf(),
    );
    const candidates = await Promise.all(
      cidStrings
        .filter((cidString) => !knownCids.has(cidString))
        .map(async (cidString) => {
          const candidate = await this.findCandidateFromCid(
            new IPFSId(cidString),
          );

          if (!candidate) {
            return undefined;
          }

          return KeychainCandidate.remoteCandidate(
            new KeychainExternalIdentifier(cidString),
            candidate,
          );
        }),
    );

    return candidates.filter(
      (candidate): candidate is KeychainCandidate => candidate !== undefined,
    );
  }

  private async loadByExternalIdentifier(
    externalIdentifier: KeychainExternalIdentifier,
  ): Promise<Keychain | undefined> {
    const metadata =
      await this.metadataIndex.findByExternalIdentifier(externalIdentifier);

    if (metadata?.keychain) {
      return metadata.keychain;
    }

    return this.findCandidateFromCid(new IPFSId(externalIdentifier.valueOf()));
  }

  private isOwnedMetadata(
    record: KeychainMetadataRecord,
    ownerIdentityId: IdentityId,
  ): boolean {
    if (record.ownerIdentityId !== ownerIdentityId.valueOf()) {
      return false;
    }

    return (
      record.keychain !== undefined &&
      record.keychain.belongsTo(ownerIdentityId)
    );
  }

  // Routing records are writable under the owner's key. A candidate whose
  // bytes are not a keychain document, or belong to another owner, is skipped:
  // it cannot be the owner's keychain. A candidate that cannot be fetched or
  // mapped proves nothing either way, so it fails the check closed, as do a
  // failed routing lookup, a failed local write, and an overflow past the cap
  // when no checked candidate proves the owner's keychain. One proven owner
  // keychain settles the check, whatever the other candidates are.
  private async hasRemoteKeychainForOwner(
    ownerIdentityId: IdentityId,
  ): Promise<boolean> {
    const cidStrings = await this.ipfsManager
      .getRecordCandidates(this.ROUTING_KEY_PREFIX + ownerIdentityId.valueOf())
      .catch((error: unknown) => {
        throw new KeychainOwnershipUnverifiedError(error);
      });
    const overflowed = cidStrings.length > this.MAX_ROUTED_CANDIDATES;

    if (overflowed) {
      this.logRoutedOverflow(cidStrings.length);
    }

    const checks = await Promise.allSettled(
      cidStrings
        .slice(0, this.MAX_ROUTED_CANDIDATES)
        .map((cidString) =>
          this.isRemoteKeychainOf(cidString, ownerIdentityId),
        ),
    );

    if (checks.some((check) => check.status === 'fulfilled' && check.value)) {
      return true;
    }

    const unverified = checks.find(
      (check): check is PromiseRejectedResult => check.status === 'rejected',
    );

    if (unverified) {
      const reason: unknown = unverified.reason;

      throw reason instanceof KeychainOwnershipUnverifiedError
        ? reason
        : new KeychainOwnershipUnverifiedError(reason);
    }

    if (overflowed) {
      throw new KeychainOwnershipUnverifiedError(
        new Error('routed keychain candidates exceed the check cap'),
      );
    }

    return false;
  }

  private logRoutedOverflow(candidateCount: number): void {
    const now = Date.now();

    if (now - this.lastOverflowLogAt < this.OVERFLOW_LOG_INTERVAL_MS) {
      return;
    }

    this.lastOverflowLogAt = now;
    Kernel.logger.warn?.(
      `Routed keychain candidates exceed the check cap: candidates=${candidateCount} checked=${this.MAX_ROUTED_CANDIDATES}`,
    );
  }

  private async isRemoteKeychainOf(
    cidString: string,
    ownerIdentityId: IdentityId,
  ): Promise<boolean> {
    const keychain = await this.readRoutedKeychain(cidString);

    if (!keychain?.belongsTo(ownerIdentityId)) {
      return false;
    }

    try {
      await this.metadataIndex.save(
        keychain,
        new KeychainExternalIdentifier(cidString),
      );

      return true;
    } catch (error) {
      // The replicated gate decides every document from its content alone, so
      // its InvalidPublicMutationError proves the document is not the owner's
      // keychain. Any other failure of the write is local (replicated state,
      // storage) and fails the check closed.
      if (error instanceof InvalidPublicMutationError) {
        return false;
      }

      throw new KeychainOwnershipUnverifiedError(error);
    }
  }

  // The writer (save, through IpfsKeychainMapper.toDocument) emits exactly
  // these fields, and that format has held since the keychain format was
  // introduced. A routed CID is content-addressed, so the bytes behind the
  // owner's keychain CID are that output and always pass this check. A
  // document that fails it cannot be the owner's keychain. If the writer's
  // format changes, this check must change with it.
  private isKeychainDocument(value: unknown): value is IpfsKeychainDocument {
    if (typeof value !== 'object' || value === null) {
      return false;
    }

    const document = value as Record<string, unknown>;

    return (
      typeof document._id === 'string' &&
      typeof document.encryptedPayload === 'string' &&
      typeof document.signature === 'string' &&
      typeof document.timestamp === 'number' &&
      typeof document.version === 'number' &&
      this.isOptionalCid(document.previousCid)
    );
  }

  private isOptionalCid(value: unknown): boolean {
    return value === undefined || value === null || typeof value === 'string';
  }

  // Fetching a routed document is not definitive: a timeout, an unreachable
  // provider, or a record that does not resolve says nothing about the owner,
  // so it fails closed. Bytes that arrive but are not JSON are definitive.
  // The fetch cap refuses an oversized record, which fails closed the same way.
  private async readRoutedDocument(cidString: string): Promise<unknown> {
    const cid = new IPFSId(cidString);

    try {
      return await this.ipfsManager.getJSON<unknown>(
        cid,
        this.MAX_ROUTED_DOCUMENT_BYTES,
      );
    } catch {
      // Not a JSON block: the raw bytes may still be a keychain document.
    }

    const bytes = await this.ipfsManager
      .getBytes(cid, this.MAX_ROUTED_DOCUMENT_BYTES)
      .catch((error: unknown) => {
        throw new KeychainOwnershipUnverifiedError(error);
      });

    try {
      return JSON.parse(Buffer.from(bytes).toString('utf8')) as unknown;
    } catch {
      return undefined;
    }
  }

  // Routed bytes that fail the keychain shape check are not the owner's
  // keychain and are skipped (see isKeychainDocument). A keychain document
  // that fails to map is not definitive, because the owner's keychain may
  // carry content the domain rejects, so it throws. A document that cannot be
  // fetched throws in readRoutedDocument.
  private async readRoutedKeychain(
    cidString: string,
  ): Promise<Keychain | undefined> {
    const document = await this.readRoutedDocument(cidString);

    if (!this.isKeychainDocument(document)) {
      return undefined;
    }

    try {
      return this.mapper.toDomain(document);
    } catch (error: unknown) {
      throw new KeychainOwnershipUnverifiedError(error);
    }
  }

  public async hasByExternalIdentifier(
    externalIdentifier: KeychainExternalIdentifier,
  ): Promise<boolean> {
    return (
      (await this.loadByExternalIdentifier(externalIdentifier)) !== undefined
    );
  }

  public async requireByExternalIdentifier(
    externalIdentifier: KeychainExternalIdentifier,
  ): Promise<Keychain> {
    const keychain = await this.loadByExternalIdentifier(externalIdentifier);

    if (!keychain) {
      throw new KeychainExternalIdentifierNotFoundError(externalIdentifier);
    }

    return keychain;
  }

  public async findCandidatesByOwnerId(
    ownerIdentityId: IdentityId,
  ): Promise<Keychain[]> {
    const candidates =
      await this.findCandidateReferencesByOwnerId(ownerIdentityId);

    return candidates.map((candidate) => candidate.getKeychain());
  }

  public async findCandidateReferencesByOwnerId(
    ownerIdentityId: IdentityId,
  ): Promise<KeychainCandidate[]> {
    const metadata = this.deduplicateMetadata(
      await this.metadataIndex.findByOwnerIdentityId(ownerIdentityId),
    );
    const localCandidates = await this.findLocalCandidateReferences(metadata);

    if (localCandidates.length > 0) {
      return this.sortCandidateReferencesByFreshness(localCandidates);
    }

    const remoteCandidates = await this.findRemoteCandidateReferences(
      ownerIdentityId,
      new Set(metadata.map((document) => document.cid)),
    );

    return this.sortCandidateReferencesByFreshness(remoteCandidates);
  }

  public async hasKeychainForOwner(
    ownerIdentityId: IdentityId,
  ): Promise<boolean> {
    const metadata = await this.metadataIndex
      .findByOwnerIdentityId(ownerIdentityId)
      .catch((error: unknown) => {
        throw new KeychainOwnershipUnverifiedError(error);
      });

    if (
      metadata.some((record) => this.isOwnedMetadata(record, ownerIdentityId))
    ) {
      return true;
    }

    return this.hasRemoteKeychainForOwner(ownerIdentityId);
  }

  public async save(
    keychain: Keychain,
    networkIds: NetworkId[],
  ): Promise<KeychainExternalIdentifier> {
    const document = this.mapper.toDocument(keychain);
    const primitiveNetworkIds = networkIds.map((networkId) =>
      networkId.valueOf(),
    );
    const cid = await this.ipfsManager.addJSONToNetworks(
      document,
      primitiveNetworkIds,
    );

    await this.metadataIndex.save(
      keychain,
      new KeychainExternalIdentifier(cid.valueOf()),
      networkIds,
    );
    this.keychainByCid.set(cid.valueOf(), keychain);
    await this.ipfsManager.putRecordToNetworks(
      this.ROUTING_KEY_PREFIX + document._id,
      cid.valueOf(),
      primitiveNetworkIds,
    );

    return new KeychainExternalIdentifier(cid.valueOf());
  }

  public async republishLocalRoutingRecords(
    networkId?: string,
  ): Promise<number> {
    const metadata = await this.metadataIndex.findAll();
    const latestDocumentsByOwner = new Map<string, KeychainMetadataRecord>();

    for (const document of metadata) {
      if (!latestDocumentsByOwner.has(document.ownerIdentityId)) {
        latestDocumentsByOwner.set(document.ownerIdentityId, document);
      }
    }

    let republished = 0;
    const routableNetworkIds = [...latestDocumentsByOwner.values()]
      .flatMap((document) => document.networkIds || [])
      .filter(
        (routableNetworkId) => !networkId || routableNetworkId === networkId,
      );

    if (routableNetworkIds.length === 0) {
      return 0;
    }

    const connectedNetworkIds = new Set(
      await this.ipfsManager.findConnectedNetworkIds(routableNetworkIds),
    );

    for (const document of latestDocumentsByOwner.values()) {
      const networkIds = (document.networkIds || []).filter(
        (documentNetworkId) =>
          connectedNetworkIds.has(documentNetworkId) &&
          (!networkId || documentNetworkId === networkId),
      );

      if (networkIds.length === 0) {
        continue;
      }

      try {
        await this.ipfsManager.putRecordToNetworks(
          this.ROUTING_KEY_PREFIX + document.ownerIdentityId,
          document.cid,
          networkIds,
        );
        republished++;
      } catch {
        continue;
      }
    }

    return republished;
  }
}
