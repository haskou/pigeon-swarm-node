import IdentityRepository from '@app/contexts/identities/domain/repositories/IdentityRepository';
import { IdentityExternalIdentifier } from '@app/contexts/identities/domain/value-objects/IdentityExternalIdentifier';
import { IdentityVersion } from '@app/contexts/identities/domain/value-objects/IdentityVersion';
import { DeviceAuthorization } from '@app/contexts/identity-devices/domain/DeviceAuthorization';
import { DeviceAuthorizationTransition } from '@app/contexts/identity-devices/domain/DeviceAuthorizationTransition';
import { InvalidDeviceAuthorizationTransitionError } from '@app/contexts/identity-devices/domain/errors/InvalidDeviceAuthorizationTransitionError';
import { DeviceAuthorizationRepository } from '@app/contexts/identity-devices/domain/repositories/DeviceAuthorizationRepository';
import DeviceAuthorizationPolicy from '@app/contexts/identity-devices/domain/services/DeviceAuthorizationPolicy';
import { DeviceAuthorizationRevision } from '@app/contexts/identity-devices/domain/value-objects/DeviceAuthorizationRevision';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { Timestamp, assert } from '@haskou/value-objects';
import { isDeepStrictEqual } from 'node:util';

import { OrbitDBDeviceAuthorizationDocument } from './documents/OrbitDBDeviceAuthorizationDocument';
import { OrbitDBDeviceAuthorizationTransitionRecord } from './documents/OrbitDBDeviceAuthorizationTransitionRecord';

interface DeviceAuthorizationReplay {
  authorization: DeviceAuthorization;
  history: OrbitDBDeviceAuthorizationTransitionRecord[];
}

export default class OrbitDBDeviceAuthorizationRepository extends DeviceAuthorizationRepository {
  private static readonly HEAD_PREFIX = 'device-authorization:';

  private readonly identityQueues = new Map<string, Promise<void>>();

  private readonly trustedGenesisByIdentity = new Map<
    string,
    DeviceAuthorization
  >();

  private readonly routingNetworkIdsByIdentity = new Map<string, string[]>();

  private readonly routingVersionByIdentity = new Map<
    string,
    IdentityVersion
  >();

  private readonly routingExternalIdentifierByIdentity = new Map<
    string,
    IdentityExternalIdentifier
  >();

  public constructor(
    private readonly registry: OrbitDBReplicatedStateRegistry,
    private readonly policy: DeviceAuthorizationPolicy,
    private readonly identityRepository: IdentityRepository,
  ) {
    super();
    this.registry.registerHeadRecordMerger(
      OrbitDBDeviceAuthorizationRepository.HEAD_PREFIX,
      (current, candidate) => this.mergeRecords(current, candidate),
    );
  }

  private headKey(identityId: IdentityId): string {
    return `${OrbitDBDeviceAuthorizationRepository.HEAD_PREFIX}${identityId.valueOf()}`;
  }

  private documentId(identityId: IdentityId): string {
    return `device-authorization:${identityId.valueOf()}`;
  }

  private sameGenesis(
    left: OrbitDBDeviceAuthorizationDocument,
    right: OrbitDBDeviceAuthorizationDocument,
  ): boolean {
    return this.sameAuthorizationGenesis(left.genesis, right.genesis);
  }

  private sameAuthorizationGenesis(
    left: OrbitDBDeviceAuthorizationDocument['genesis'],
    right: OrbitDBDeviceAuthorizationDocument['genesis'],
  ): boolean {
    return (
      left.identityId === right.identityId &&
      left.recoveryAuthority === right.recoveryAuthority &&
      left.revision === right.revision &&
      isDeepStrictEqual(left.credentials, right.credentials)
    );
  }

  private rememberRoutingNetworks(
    authorization: DeviceAuthorization,
    identityVersion: IdentityVersion,
    identityExternalIdentifier: IdentityExternalIdentifier,
  ): void {
    const identityId = authorization.getIdentityId().valueOf();
    const currentVersion = this.routingVersionByIdentity.get(identityId);
    const candidateNetworkIds = this.networkIds(authorization);

    if (
      currentVersion &&
      !this.shouldReplaceRoutingNetworks(
        identityId,
        currentVersion,
        identityVersion,
        identityExternalIdentifier,
      )
    ) {
      return;
    }

    this.routingNetworkIdsByIdentity.set(identityId, candidateNetworkIds);
    this.routingVersionByIdentity.set(identityId, identityVersion);
    this.routingExternalIdentifierByIdentity.set(
      identityId,
      identityExternalIdentifier,
    );
    this.trustedGenesisByIdentity.set(identityId, authorization);
  }

  private shouldReplaceRoutingNetworks(
    identityId: string,
    currentVersion: IdentityVersion,
    candidateVersion: IdentityVersion,
    candidateExternalIdentifier: IdentityExternalIdentifier,
  ): boolean {
    if (candidateVersion.isGreaterThan(currentVersion)) {
      return true;
    }

    if (currentVersion.isGreaterThan(candidateVersion)) {
      return false;
    }

    const currentExternalIdentifier =
      this.routingExternalIdentifierByIdentity.get(identityId);

    assert(
      currentExternalIdentifier !== undefined,
      new InvalidDeviceAuthorizationTransitionError(),
    );

    return (
      candidateExternalIdentifier.valueOf() <
      currentExternalIdentifier.valueOf()
    );
  }

  private canonicalValue(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.canonicalValue(item));
    }

    if (typeof value !== 'object' || value === null) {
      return value;
    }

    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, this.canonicalValue(item)]),
    );
  }

  private canonicalString(value: unknown): string {
    return JSON.stringify(this.canonicalValue(value));
  }

  private async resolveTrustedGenesis(
    identityId: IdentityId,
  ): Promise<DeviceAuthorization | undefined> {
    const cached = this.trustedGenesisByIdentity.get(identityId.valueOf());

    if (cached) {
      return cached;
    }

    try {
      const [candidate] =
        await this.identityRepository.findCandidateReferencesById(identityId);

      assert(
        candidate !== undefined,
        new InvalidDeviceAuthorizationTransitionError(),
      );
      const identity = candidate.getIdentity();
      const genesis = DeviceAuthorization.genesis(
        identityId,
        identity.getNetworkIds(),
        identity.getInitialDeviceCredential(),
        identity.getRecoveryAuthority(),
      );
      this.rememberRoutingNetworks(
        genesis,
        identity.getVersion(),
        candidate.getExternalIdentifier(),
      );

      return genesis;
    } catch {
      return undefined;
    }
  }

  private hasTrustedGenesis(
    document: OrbitDBDeviceAuthorizationDocument,
    genesis: DeviceAuthorization,
  ): boolean {
    return this.sameAuthorizationGenesis(
      document.genesis,
      genesis.toPrimitives(),
    );
  }

  private transitionRecords(
    left: OrbitDBDeviceAuthorizationDocument,
    right: OrbitDBDeviceAuthorizationDocument,
  ): OrbitDBDeviceAuthorizationTransitionRecord[] {
    const records = new Map<
      string,
      OrbitDBDeviceAuthorizationTransitionRecord
    >();

    for (const record of [...left.history, ...right.history]) {
      records.set(this.canonicalString(record), record);
    }

    return [...records.values()].sort((left, right) => {
      const operationOrder = left.transition.operationId.localeCompare(
        right.transition.operationId,
      );

      return (
        operationOrder ||
        this.canonicalString(left).localeCompare(this.canonicalString(right))
      );
    });
  }

  private transitionRecordsByRevision(
    history: OrbitDBDeviceAuthorizationTransitionRecord[],
  ): Map<number, OrbitDBDeviceAuthorizationTransitionRecord[]> {
    const recordsByRevision = new Map<
      number,
      OrbitDBDeviceAuthorizationTransitionRecord[]
    >();

    for (const record of history) {
      const revision = record.transition.previousRevision;
      const records = recordsByRevision.get(revision) ?? [];

      records.push(record);
      recordsByRevision.set(revision, records);
    }

    for (const records of recordsByRevision.values()) {
      records.sort((left, right) => {
        const operationOrder = left.transition.operationId.localeCompare(
          right.transition.operationId,
        );

        return (
          operationOrder ||
          this.canonicalString(left).localeCompare(this.canonicalString(right))
        );
      });
    }

    return recordsByRevision;
  }

  private resolveConcurrentAuthorization(
    authorization: DeviceAuthorization,
    candidates: Array<{
      authorization: DeviceAuthorization;
      record: OrbitDBDeviceAuthorizationTransitionRecord;
      transition: DeviceAuthorizationTransition;
    }>,
  ): DeviceAuthorization {
    const recovery = candidates.find(({ transition }) =>
      transition.isRecovery(),
    );

    if (recovery) {
      return recovery.authorization;
    }

    const revocations = candidates.filter(({ transition }) =>
      transition.isRevocation(),
    );

    if (revocations.length > 0) {
      return authorization.revokeConcurrently(
        revocations.map(({ transition }) => transition.getTargetCredential()),
      );
    }

    return candidates[0].authorization;
  }

  private rebuild(
    genesis: DeviceAuthorization,
    history: OrbitDBDeviceAuthorizationTransitionRecord[],
  ): DeviceAuthorizationReplay {
    let authorization = genesis;
    const verifiedHistory: OrbitDBDeviceAuthorizationTransitionRecord[] = [];
    const recordsByRevision = this.transitionRecordsByRevision(history);

    while (true) {
      const candidates =
        recordsByRevision.get(authorization.getRevision().valueOf()) ?? [];
      const validCandidates: Array<{
        authorization: DeviceAuthorization;
        record: OrbitDBDeviceAuthorizationTransitionRecord;
        transition: DeviceAuthorizationTransition;
      }> = [];

      for (const candidate of candidates) {
        try {
          const transition = DeviceAuthorizationTransition.fromPrimitives(
            candidate.transition,
          );

          validCandidates.push({
            authorization: this.policy.apply(authorization, transition),
            record: candidate,
            transition,
          });
        } catch {
          continue;
        }
      }

      if (validCandidates.length === 0) {
        return {
          authorization,
          history: verifiedHistory,
        };
      }

      verifiedHistory.push(...validCandidates.map(({ record }) => record));
      authorization = this.resolveConcurrentAuthorization(
        authorization,
        validCandidates,
      );
    }
  }

  private toDocument(
    genesis: DeviceAuthorization,
    history: OrbitDBDeviceAuthorizationTransitionRecord[],
  ): OrbitDBDeviceAuthorizationDocument {
    const replay = this.rebuild(genesis, history);

    return {
      authorization: replay.authorization.toPrimitives(),
      genesis: genesis.toPrimitives(),
      history: replay.history,
      id: this.documentId(replay.authorization.getIdentityId()),
      identityId: replay.authorization.getIdentityId().valueOf(),
      kind: 'device_authorization',
    };
  }

  private hasDocumentShape(value: Record<string, unknown>): boolean {
    return [
      value.kind === 'device_authorization',
      typeof value.id === 'string',
      typeof value.identityId === 'string',
      Array.isArray(value.history),
      typeof value.genesis === 'object' && value.genesis !== null,
      typeof value.authorization === 'object' && value.authorization !== null,
    ].every(Boolean);
  }

  private hasValidGenesis(
    document: OrbitDBDeviceAuthorizationDocument,
    genesis: DeviceAuthorization,
  ): boolean {
    const credentials = genesis.getCredentials();

    return (
      document.id === this.documentId(genesis.getIdentityId()) &&
      document.identityId === genesis.getIdentityId().valueOf() &&
      genesis.getRevision().isEqual(DeviceAuthorizationRevision.initial()) &&
      credentials.length === 1
    );
  }

  private matchesReplay(
    document: OrbitDBDeviceAuthorizationDocument,
    replay: DeviceAuthorizationReplay,
  ): boolean {
    return (
      isDeepStrictEqual(
        document.authorization,
        replay.authorization.toPrimitives(),
      ) && isDeepStrictEqual(document.history, replay.history)
    );
  }

  private isDocument(
    value: Record<string, unknown>,
  ): value is OrbitDBDeviceAuthorizationDocument {
    try {
      if (!this.hasDocumentShape(value)) {
        return false;
      }

      const document = value as unknown as OrbitDBDeviceAuthorizationDocument;
      const genesis = DeviceAuthorization.fromPrimitives(document.genesis);
      const replay = this.rebuild(genesis, document.history);

      return (
        this.hasValidGenesis(document, genesis) &&
        this.matchesReplay(document, replay)
      );
    } catch {
      return false;
    }
  }

  private conflictsWithTrustedGenesis(
    document: OrbitDBDeviceAuthorizationDocument,
  ): boolean {
    const trusted = this.trustedGenesisByIdentity.get(document.identityId);

    return Boolean(
      trusted &&
      !this.sameAuthorizationGenesis(document.genesis, trusted.toPrimitives()),
    );
  }

  private mergeRecords(
    current: Record<string, unknown> | undefined,
    candidate: Record<string, unknown>,
  ): Record<string, unknown> | undefined {
    if (!this.isDocument(candidate)) {
      return current;
    }

    if (this.conflictsWithTrustedGenesis(candidate)) {
      return current;
    }

    if (!current || !this.isDocument(current)) {
      return candidate;
    }

    if (this.conflictsWithTrustedGenesis(current)) {
      return candidate;
    }

    if (!this.sameGenesis(current, candidate)) {
      return current;
    }

    return this.toDocument(
      DeviceAuthorization.fromPrimitives(current.genesis),
      this.transitionRecords(current, candidate),
    );
  }

  private async withIdentityLock<T>(
    identityId: IdentityId,
    operation: () => Promise<T>,
  ): Promise<T> {
    const key = identityId.valueOf();
    const previous = this.identityQueues.get(key) ?? Promise.resolve();
    let release: () => void = () => undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queued = previous.then(() => current);

    this.identityQueues.set(key, queued);
    await previous;

    try {
      return await operation();
    } finally {
      release();

      if (this.identityQueues.get(key) === queued) {
        this.identityQueues.delete(key);
      }
    }
  }

  private hasReplay(
    document: OrbitDBDeviceAuthorizationDocument,
    transition: DeviceAuthorizationTransition,
  ): boolean {
    const operationId = transition.getOperationId().valueOf();
    const pairingId = transition.isEnrollment()
      ? transition.getPairingId().valueOf()
      : undefined;

    return document.history.some(
      (record) =>
        record.transition.operationId === operationId ||
        (pairingId !== undefined && record.transition.pairingId === pairingId),
    );
  }

  private networkIds(authorization: DeviceAuthorization): string[] {
    return authorization
      .getNetworkIds()
      .map((networkId) => networkId.valueOf())
      .sort();
  }

  private async save(
    document: OrbitDBDeviceAuthorizationDocument,
  ): Promise<OrbitDBDeviceAuthorizationDocument> {
    const authorization = DeviceAuthorization.fromPrimitives(
      document.authorization,
    );
    const networkIds =
      this.routingNetworkIdsByIdentity.get(
        authorization.getIdentityId().valueOf(),
      ) ?? this.networkIds(authorization);

    await this.registry.putDocument('identities', document, networkIds);
    await this.registry.putHead(
      this.headKey(authorization.getIdentityId()),
      document,
      networkIds,
    );
    const saved = await this.registry.findHead(
      this.headKey(authorization.getIdentityId()),
    );

    assert(
      saved !== undefined && this.isDocument(saved),
      new InvalidDeviceAuthorizationTransitionError(),
    );

    return saved;
  }

  public compareAndApply(
    transition: DeviceAuthorizationTransition,
  ): Promise<DeviceAuthorization> {
    return this.withIdentityLock(transition.getIdentityId(), async () => {
      const trustedGenesis = await this.resolveTrustedGenesis(
        transition.getIdentityId(),
      );
      const candidate = await this.registry.findHead(
        this.headKey(transition.getIdentityId()),
      );

      assert(
        trustedGenesis !== undefined,
        new InvalidDeviceAuthorizationTransitionError(),
      );
      const stored =
        candidate &&
        this.isDocument(candidate) &&
        this.hasTrustedGenesis(candidate, trustedGenesis)
          ? candidate
          : this.toDocument(trustedGenesis, []);

      if (stored !== candidate) {
        await this.save(stored);
      }
      assert(
        !this.hasReplay(stored, transition),
        new InvalidDeviceAuthorizationTransitionError(),
      );
      this.policy.verifyFirstAcceptance(transition, new Timestamp(Date.now()));

      const current = this.rebuild(
        DeviceAuthorization.fromPrimitives(stored.genesis),
        stored.history,
      ).authorization;
      this.policy.apply(current, transition);

      const document = this.toDocument(
        DeviceAuthorization.fromPrimitives(stored.genesis),
        [
          ...stored.history,
          {
            transition: transition.toPrimitives(),
          },
        ],
      );

      const saved = await this.save(document);

      return DeviceAuthorization.fromPrimitives(saved.authorization);
    });
  }

  public async find(
    identityId: IdentityId,
  ): Promise<DeviceAuthorization | undefined> {
    return this.withIdentityLock(identityId, async () => {
      const trustedGenesis = await this.resolveTrustedGenesis(identityId);

      if (!trustedGenesis) {
        return undefined;
      }

      const candidate = await this.registry.findHead(this.headKey(identityId));
      const document =
        candidate &&
        this.isDocument(candidate) &&
        this.hasTrustedGenesis(candidate, trustedGenesis)
          ? candidate
          : this.toDocument(trustedGenesis, []);

      const resolved =
        document !== candidate ? await this.save(document) : document;

      return DeviceAuthorization.fromPrimitives(resolved.authorization);
    });
  }

  public provision(
    authorization: DeviceAuthorization,
    identityVersion: IdentityVersion,
    identityExternalIdentifier: IdentityExternalIdentifier,
  ): Promise<void> {
    return this.withIdentityLock(authorization.getIdentityId(), async () => {
      const key = this.headKey(authorization.getIdentityId());
      this.rememberRoutingNetworks(
        authorization,
        identityVersion,
        identityExternalIdentifier,
      );
      const existing = await this.registry.findHead(key);

      if (existing) {
        if (
          !this.isDocument(existing) ||
          !this.sameAuthorizationGenesis(
            existing.genesis,
            authorization.toPrimitives(),
          )
        ) {
          await this.save(this.toDocument(authorization, []));
        } else {
          await this.save(existing);
        }

        return;
      }

      await this.save(this.toDocument(authorization, []));
    });
  }
}
