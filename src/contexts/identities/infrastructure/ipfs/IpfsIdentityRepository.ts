import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { IPFSContentNotFoundError } from '@app/contexts/shared/infrastructure/ipfs/errors/IPFSContentNotFoundError';
import { IPFSId } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import IPFS from '@app/contexts/shared/infrastructure/ipfs/IPFS';
import ReplicatedStateNotReadyError from '@app/contexts/shared/infrastructure/orbitdb/ReplicatedStateNotReadyError';

import { IdentityNotFoundError } from '../../domain/errors/IdentityNotFoundError';
import { InvalidIdentityCandidateError } from '../../domain/errors/InvalidIdentityCandidateError';
import { Identity } from '../../domain/Identity';
import { IdentityCandidate } from '../../domain/IdentityCandidate';
import IdentityRepository from '../../domain/repositories/IdentityRepository';
import IdentityCandidateValidationDomainService from '../../domain/services/IdentityCandidateValidationDomainService';
import IdentityHandleOwnershipDomainService from '../../domain/services/IdentityHandleOwnershipDomainService';
import IdentityRoutingDomainService from '../../domain/services/IdentityRoutingDomainService';
import IdentityVersionPrecedenceDomainService from '../../domain/services/IdentityVersionPrecedenceDomainService';
import { IdentityExternalIdentifier } from '../../domain/value-objects/IdentityExternalIdentifier';
import { ProfileHandle } from '../../domain/value-objects/ProfileHandle';
import IdentityMetadataIndex from '../metadata/IdentityMetadataIndex';
import { IdentityMetadataRecord } from '../metadata/IdentityMetadataRecord';
import { IpfsIdentityDocument } from './documents/IpfsIdentityDocument';
import { IpfsIdentityDocumentShape } from './documents/IpfsIdentityDocumentShape';
import IpfsIdentityMapper from './mappers/IpfsIdentityMapper';

export default class IpfsIdentityRepository extends IdentityRepository {
  private static readonly MAX_CACHED_IDENTITIES = 1024;
  private static readonly MAX_DOCUMENT_BYTES = 64 * 1024;
  private static readonly MAX_REMOTE_CANDIDATES = 32;
  private readonly HANDLE_ROUTING_KEY_PREFIX = 'pigeon-swarm_identity-handle-';
  private readonly ROUTING_KEY_PREFIX = 'pigeon-swarm_identity-';
  private readonly validator = new IdentityCandidateValidationDomainService();
  private readonly ownership = new IdentityHandleOwnershipDomainService();
  private readonly versions = new IdentityVersionPrecedenceDomainService();
  private readonly routing = new IdentityRoutingDomainService();
  private readonly identityByCid = new Map<string, Identity>();
  private readonly activeRemoteCandidateRefreshes = new Set<string>();

  constructor(
    private readonly ipfsManager: IPFS,
    private readonly mapper: IpfsIdentityMapper,
    private readonly metadataIndex: IdentityMetadataIndex,
  ) {
    super();
  }

  private async findValidMetadata(
    id: IdentityId,
  ): Promise<IdentityMetadataRecord[]> {
    try {
      return this.versions.newestFirst(
        await this.metadataIndex.findByIdentityId(id),
      );
    } catch (error: unknown) {
      if (error instanceof ReplicatedStateNotReadyError) {
        throw error;
      }

      return [];
    }
  }

  private async saveMetadata(identity: Identity, cid: IPFSId): Promise<void> {
    try {
      await this.metadataIndex.save(
        identity,
        new IdentityExternalIdentifier(cid.valueOf()),
      );
    } catch {
      return;
    }
  }

  private rememberIdentity(cid: IPFSId, identity: Identity): void {
    if (
      this.identityByCid.size >= IpfsIdentityRepository.MAX_CACHED_IDENTITIES
    ) {
      const [oldest] = this.identityByCid.keys();

      this.identityByCid.delete(oldest);
    }

    this.identityByCid.set(cid.valueOf(), identity);
  }

  private async getDocumentFromCid(
    cid: IPFSId,
    networkIds?: string[],
  ): Promise<IpfsIdentityDocument> {
    const document = await this.readDocumentFromCid(cid, networkIds);

    if (!IpfsIdentityDocumentShape.isIpfsIdentityDocument(document)) {
      throw new InvalidIdentityCandidateError();
    }

    return document;
  }

  private async readDocumentFromCid(
    cid: IPFSId,
    networkIds?: string[],
  ): Promise<unknown> {
    try {
      return networkIds && networkIds.length > 0
        ? await this.ipfsManager.getJSONFromNetworks<unknown>(
            cid,
            networkIds,
            IpfsIdentityRepository.MAX_DOCUMENT_BYTES,
          )
        : await this.ipfsManager.getJSON<unknown>(
            cid,
            IpfsIdentityRepository.MAX_DOCUMENT_BYTES,
          );
    } catch (jsonError: unknown) {
      const bytes = await this.readDocumentBytes(cid, networkIds, jsonError);

      const document: unknown = JSON.parse(Buffer.from(bytes).toString('utf8'));

      return document;
    }
  }

  private async readDocumentBytes(
    cid: IPFSId,
    networkIds: string[] | undefined,
    jsonError: unknown,
  ): Promise<Buffer> {
    try {
      return networkIds && networkIds.length > 0
        ? await this.ipfsManager.getBytesFromNetworks(
            cid,
            networkIds,
            IpfsIdentityRepository.MAX_DOCUMENT_BYTES,
          )
        : await this.ipfsManager.getBytes(
            cid,
            IpfsIdentityRepository.MAX_DOCUMENT_BYTES,
          );
    } catch (bytesError: unknown) {
      // A NotFound verdict counts only when the JSON read also verified absence.
      if (
        bytesError instanceof IPFSContentNotFoundError &&
        !(jsonError instanceof IPFSContentNotFoundError)
      ) {
        throw new ReplicatedStateNotReadyError();
      }

      throw bytesError;
    }
  }

  private async getIdentityFromCid(
    cid: IPFSId,
    networkIds?: string[],
  ): Promise<Identity> {
    const cached = this.identityByCid.get(cid.valueOf());

    if (cached) {
      return cached;
    }

    const document = await this.getDocumentFromCid(cid, networkIds);
    const identity = this.mapper.toDomain(document);

    this.rememberIdentity(cid, identity);

    return identity;
  }

  private async findPreviousIdentity(
    externalIdentifier: IdentityExternalIdentifier,
    networkIds?: string[],
  ): Promise<Identity | undefined> {
    try {
      return await this.getIdentityFromCid(
        new IPFSId(externalIdentifier.valueOf()),
        networkIds,
      );
    } catch (error: unknown) {
      if (error instanceof ReplicatedStateNotReadyError) {
        throw error;
      }

      return undefined;
    }
  }

  // A not-ready local read is rethrown. It never reads as "no previous identity".
  private async findLocalPreviousIdentity(
    externalIdentifier: IdentityExternalIdentifier,
    networkIds?: string[],
  ): Promise<Identity | undefined> {
    try {
      return await this.findPreviousIdentity(externalIdentifier, networkIds);
    } catch (error: unknown) {
      if (error instanceof ReplicatedStateNotReadyError) {
        throw error;
      }

      return undefined;
    }
  }

  private async findCandidateFromCid(
    id: IdentityId,
    cid: IPFSId,
    shouldSaveMetadata: boolean = true,
  ): Promise<Identity | undefined> {
    try {
      const identity = await this.getIdentityFromCid(cid);

      const isValid = await this.validator.isValidChainFor(
        id,
        identity,
        (externalIdentifier) => this.findPreviousIdentity(externalIdentifier),
      );

      if (!isValid) {
        this.identityByCid.delete(cid.valueOf());

        return undefined;
      }

      if (shouldSaveMetadata) {
        await this.saveMetadata(identity, cid);
      }

      return identity;
    } catch (error: unknown) {
      if (error instanceof ReplicatedStateNotReadyError) {
        throw error;
      }

      return undefined;
    }
  }

  private async findCandidateFromMetadata(
    metadata: IdentityMetadataRecord,
  ): Promise<Identity | undefined> {
    try {
      const id = new IdentityId(metadata.identityId);
      const cid = new IPFSId(metadata.cid);
      const candidate = metadata.identity;
      const calculatedCid = await this.ipfsManager.calculateJSONId(
        this.mapper.toDocument(candidate),
      );

      if (!calculatedCid.isEqual(cid)) {
        return undefined;
      }

      const isValid = await this.validator.isValidChainFor(
        id,
        candidate,
        (externalIdentifier) =>
          this.findPreviousIdentity(externalIdentifier, metadata.networkIds),
      );

      if (!isValid) {
        this.identityByCid.delete(cid.valueOf());

        return undefined;
      }

      return candidate;
    } catch (error: unknown) {
      if (error instanceof ReplicatedStateNotReadyError) {
        throw error;
      }

      this.identityByCid.delete(metadata.cid);

      return undefined;
    }
  }

  private async findCandidateReferenceFromMetadata(
    metadata: IdentityMetadataRecord,
  ): Promise<IdentityCandidate | undefined> {
    const identity = await this.findCandidateFromMetadata(metadata);

    if (identity) {
      return new IdentityCandidate(
        new IdentityExternalIdentifier(metadata.cid),
        identity,
      );
    }

    return this.findPreviousCandidateReferenceFromMetadata(metadata);
  }

  private async findPreviousCandidateReferenceFromMetadata(
    metadata: IdentityMetadataRecord,
  ): Promise<IdentityCandidate | undefined> {
    if (!metadata.previousCid) {
      return undefined;
    }

    const externalIdentifier = new IdentityExternalIdentifier(
      metadata.previousCid,
    );
    const identity = await this.findLocalPreviousIdentity(
      externalIdentifier,
      metadata.networkIds,
    );

    if (!identity) {
      return undefined;
    }

    const isValid = await this.validator.isValidChainFor(
      new IdentityId(metadata.identityId),
      identity,
      (previousExternalIdentifier) =>
        this.findLocalPreviousIdentity(
          previousExternalIdentifier,
          metadata.networkIds,
        ),
    );

    if (!isValid) {
      return undefined;
    }

    await this.saveMetadata(identity, new IPFSId(metadata.previousCid));

    return new IdentityCandidate(externalIdentifier, identity);
  }

  private async findCandidateReferencesFromMetadata(
    metadata: IdentityMetadataRecord[],
  ): Promise<IdentityCandidate[]> {
    const candidates = await Promise.all(
      metadata.map((document) =>
        this.findCandidateReferenceFromMetadata(document),
      ),
    );

    return candidates.filter(
      (candidate): candidate is IdentityCandidate => candidate !== undefined,
    );
  }

  private sortCandidateReferencesByFreshness(
    candidates: IdentityCandidate[],
  ): IdentityCandidate[] {
    return [...candidates].sort((left, right) => {
      if (left.takesPrecedenceOver(right)) {
        return -1;
      }

      if (right.takesPrecedenceOver(left)) {
        return 1;
      }

      return 0;
    });
  }

  private async findRemoteCandidateReferences(
    id: IdentityId,
    knownCids: Set<string>,
  ): Promise<IdentityCandidate[]> {
    const cidStrings = await this.ipfsManager.getRecordCandidates(
      this.ROUTING_KEY_PREFIX + id.valueOf(),
    );

    return this.findCandidateReferencesFromCids(id, cidStrings, knownCids);
  }

  private async findRemoteHandleCandidateReferences(
    handle: ProfileHandle,
    knownCids: Set<string>,
  ): Promise<IdentityCandidate[]> {
    const cidStrings = await this.ipfsManager.getRecordCandidates(
      this.HANDLE_ROUTING_KEY_PREFIX + handle.valueOf(),
    );

    return this.findHandleCandidateReferencesFromCids(
      handle,
      cidStrings,
      knownCids,
    );
  }

  private async shouldUseOnlyLocalMetadata(
    metadata: IdentityMetadataRecord[],
  ): Promise<boolean> {
    return metadata.length > 0 && !(await this.ipfsManager.hasConnectedPeers());
  }

  private localCandidatesOrNotFound(
    id: IdentityId,
    candidates: IdentityCandidate[],
  ): IdentityCandidate[] {
    if (candidates.length > 0) {
      return candidates;
    }

    throw new IdentityNotFoundError(id.valueOf());
  }

  private async findRemoteCandidateReferencesOrFallback(
    id: IdentityId,
    knownCids: Set<string>,
    localCandidates: IdentityCandidate[],
  ): Promise<IdentityCandidate[]> {
    try {
      return await this.findRemoteCandidateReferences(id, knownCids);
    } catch (error) {
      if (localCandidates.length > 0) {
        return [];
      }

      throw error;
    }
  }

  private refreshRemoteCandidateReferencesInBackground(
    id: IdentityId,
    knownCids: Set<string>,
  ): void {
    const refreshKey = id.valueOf();

    if (this.activeRemoteCandidateRefreshes.has(refreshKey)) {
      return;
    }

    this.activeRemoteCandidateRefreshes.add(refreshKey);
    void this.refreshRemoteCandidateReferences(id, knownCids).finally(() => {
      this.activeRemoteCandidateRefreshes.delete(refreshKey);
    });
  }

  private async refreshRemoteCandidateReferences(
    id: IdentityId,
    knownCids: Set<string>,
  ): Promise<void> {
    try {
      if (!(await this.ipfsManager.hasConnectedPeers())) {
        return;
      }

      await this.findRemoteCandidateReferences(id, knownCids);
    } catch {
      return;
    }
  }

  private async findCandidateReferencesFromCids(
    id: IdentityId,
    cidStrings: string[],
    knownCids: Set<string>,
  ): Promise<IdentityCandidate[]> {
    const candidates = await Promise.all(
      cidStrings
        .filter((cidString) => !knownCids.has(cidString))
        .slice(0, IpfsIdentityRepository.MAX_REMOTE_CANDIDATES)
        .map(async (cidString) => {
          const candidate = await this.findCandidateFromCid(
            id,
            new IPFSId(cidString),
          );

          if (!candidate) {
            return undefined;
          }

          return new IdentityCandidate(
            new IdentityExternalIdentifier(cidString),
            candidate,
          );
        }),
    );

    return candidates.filter(
      (candidate): candidate is IdentityCandidate => candidate !== undefined,
    );
  }

  private async findHandleCandidateFromCid(
    handle: ProfileHandle,
    cid: IPFSId,
  ): Promise<Identity | undefined> {
    try {
      const identity = await this.getIdentityFromCid(cid);

      if (!identity.hasHandle(handle)) {
        return undefined;
      }

      const identityId = new IdentityId(identity.toPrimitives().id);
      const isValid = await this.validator.isValidChainFor(
        identityId,
        identity,
        (externalIdentifier) => this.findPreviousIdentity(externalIdentifier),
      );

      if (!isValid) {
        this.identityByCid.delete(cid.valueOf());

        return undefined;
      }

      await this.saveMetadata(identity, cid);

      return identity;
    } catch (error: unknown) {
      if (error instanceof ReplicatedStateNotReadyError) {
        throw error;
      }

      this.identityByCid.delete(cid.valueOf());

      return undefined;
    }
  }

  private async findHandleCandidateReferencesFromCids(
    handle: ProfileHandle,
    cidStrings: string[],
    knownCids: Set<string>,
  ): Promise<IdentityCandidate[]> {
    const candidates = await Promise.all(
      cidStrings
        .filter((cidString) => !knownCids.has(cidString))
        .slice(0, IpfsIdentityRepository.MAX_REMOTE_CANDIDATES)
        .map(async (cidString) => {
          const candidate = await this.findHandleCandidateFromCid(
            handle,
            new IPFSId(cidString),
          );

          if (!candidate) {
            return undefined;
          }

          return new IdentityCandidate(
            new IdentityExternalIdentifier(cidString),
            candidate,
          );
        }),
    );

    return candidates.filter(
      (candidate): candidate is IdentityCandidate => candidate !== undefined,
    );
  }

  private async findFirstHandleCandidateFromMetadata(
    handle: ProfileHandle,
    metadata: IdentityMetadataRecord[],
  ): Promise<IdentityCandidate | undefined> {
    for (const document of metadata) {
      const candidate = await this.findCandidateReferenceFromMetadata(document);

      if (candidate?.hasHandle(handle)) {
        return candidate;
      }
    }

    return undefined;
  }

  private async findCandidateReferences(
    id: IdentityId,
    awaitRemoteCandidates: boolean,
  ): Promise<IdentityCandidate[]> {
    const metadata = await this.findValidMetadata(id);
    const localCandidates =
      await this.findCandidateReferencesFromMetadata(metadata);
    const knownCids = new Set(
      localCandidates.map((candidate) =>
        candidate.getExternalIdentifier().valueOf(),
      ),
    );

    if (localCandidates.length > 0 && !awaitRemoteCandidates) {
      this.refreshRemoteCandidateReferencesInBackground(id, knownCids);

      return this.sortCandidateReferencesByFreshness(localCandidates);
    }

    if (await this.shouldUseOnlyLocalMetadata(metadata)) {
      return this.localCandidatesOrNotFound(id, localCandidates);
    }

    const remoteCandidates = await this.findRemoteCandidateReferencesOrFallback(
      id,
      knownCids,
      localCandidates,
    );
    const candidates = this.sortCandidateReferencesByFreshness([
      ...localCandidates,
      ...remoteCandidates,
    ]);

    return this.localCandidatesOrNotFound(id, candidates);
  }

  public async findById(id: IdentityId): Promise<Identity> {
    const candidates = await this.findCandidatesById(id);

    return candidates[0];
  }

  public async findByHandle(handle: ProfileHandle): Promise<Identity> {
    return (await this.findCandidateByHandle(handle)).getIdentity();
  }

  public async findCandidateByHandle(
    handle: ProfileHandle,
  ): Promise<IdentityCandidate> {
    const metadata = await this.metadataIndex.findByHandle(handle);
    const candidate = await this.findFirstHandleCandidateFromMetadata(
      handle,
      metadata,
    );

    if (candidate) {
      return candidate;
    }

    const remoteCandidates = await this.findRemoteHandleCandidateReferences(
      handle,
      new Set(metadata.map((document) => document.cid)),
    );
    const remoteCandidate = this.ownership.owner(remoteCandidates, handle);

    if (remoteCandidate) {
      return remoteCandidate;
    }

    throw new IdentityNotFoundError(handle.valueOf());
  }

  public async hasByExternalIdentifier(
    externalIdentifier: IdentityExternalIdentifier,
  ): Promise<boolean> {
    return (await this.findPreviousIdentity(externalIdentifier)) !== undefined;
  }

  public async requireByExternalIdentifier(
    externalIdentifier: IdentityExternalIdentifier,
  ): Promise<Identity> {
    const identity = await this.findPreviousIdentity(externalIdentifier);

    if (!identity) {
      throw new IdentityNotFoundError(externalIdentifier.valueOf());
    }

    await this.saveMetadata(identity, new IPFSId(externalIdentifier.valueOf()));

    return identity;
  }

  public async findCandidateByExternalIdentifier(
    id: IdentityId,
    externalIdentifier: IdentityExternalIdentifier,
  ): Promise<IdentityCandidate> {
    const candidate = await this.findCandidateFromCid(
      id,
      new IPFSId(externalIdentifier.valueOf()),
    );

    if (!candidate) {
      throw new IdentityNotFoundError(externalIdentifier.valueOf());
    }

    return new IdentityCandidate(externalIdentifier, candidate);
  }

  public async findCandidateReferencesById(
    id: IdentityId,
  ): Promise<IdentityCandidate[]> {
    return this.findCandidateReferences(id, false);
  }

  public async findFreshCandidateReferencesById(
    id: IdentityId,
  ): Promise<IdentityCandidate[]> {
    return this.findCandidateReferences(id, true);
  }

  public async holds(id: IdentityId): Promise<boolean> {
    return (await this.metadataIndex.findByIdentityId(id)).length > 0;
  }

  public async holdsVersion(
    id: IdentityId,
    externalIdentifier: IdentityExternalIdentifier,
  ): Promise<boolean> {
    return (await this.metadataIndex.findByIdentityId(id)).some(
      (record) => record.cid === externalIdentifier.valueOf(),
    );
  }

  public async findCandidatesById(id: IdentityId): Promise<Identity[]> {
    const candidates = await this.findCandidateReferencesById(id);

    return candidates.map((candidate) => candidate.getIdentity());
  }

  public async calculateExternalIdentifier(
    identity: Identity,
  ): Promise<IdentityExternalIdentifier> {
    const cid = await this.ipfsManager.calculateJSONId(
      this.mapper.toDocument(identity),
    );

    return new IdentityExternalIdentifier(cid.valueOf());
  }

  public async save(identity: Identity): Promise<IdentityExternalIdentifier> {
    const document = this.mapper.toDocument(identity);
    const networks: string[] = document.networks;
    const cid = await this.ipfsManager.addJSONToNetworks(document, networks);

    await this.saveMetadata(identity, cid);
    this.rememberIdentity(cid, identity);

    await this.ipfsManager.putRecordToNetworks(
      this.ROUTING_KEY_PREFIX + document._id,
      cid.valueOf(),
      networks,
    );

    if (document.profile.handle) {
      await this.ipfsManager.putRecordToNetworks(
        this.HANDLE_ROUTING_KEY_PREFIX + document.profile.handle,
        cid.valueOf(),
        networks,
      );
    }

    return new IdentityExternalIdentifier(cid.valueOf());
  }

  public async republishLocalRoutingRecords(
    networkId?: string,
  ): Promise<number> {
    let republished = 0;
    const documents = this.versions.latestPerIdentity(
      await this.metadataIndex.findAllCanonical(),
    );
    const routableNetworkIds = this.routing.networksToCheck(
      documents,
      networkId,
    );

    if (routableNetworkIds.length === 0) {
      return 0;
    }

    const connectedNetworkIds = new Set(
      await this.ipfsManager.findConnectedNetworkIds(routableNetworkIds),
    );

    for (const document of documents) {
      const networkIds = this.routing.republishNetworkIds(
        document,
        connectedNetworkIds,
        networkId,
      );
      const handle = document.handle;

      if (networkIds.length === 0) {
        continue;
      }

      try {
        await this.ipfsManager.putRecordToNetworks(
          this.ROUTING_KEY_PREFIX + document.identityId,
          document.cid,
          networkIds,
        );

        if (handle) {
          await this.ipfsManager.putRecordToNetworks(
            this.HANDLE_ROUTING_KEY_PREFIX + handle,
            document.cid,
            networkIds,
          );
        }

        republished++;
      } catch {
        continue;
      }
    }

    return republished;
  }
}
