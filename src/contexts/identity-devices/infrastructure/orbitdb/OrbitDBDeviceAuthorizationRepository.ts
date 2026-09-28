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
import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
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

  private static readonly MAX_CONCURRENT_TRANSITIONS = 128;

  private static readonly MAX_TRANSITION_RECORDS = 256;

  private static readonly MAX_TRANSITION_HISTORY_BYTES = 1_048_576;

  private static readonly MAX_TRANSITION_RECORD_BYTES = 16_384;

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
    private readonly networkRegistry: IPFSNetworkRegistry,
  ) {
    super();
    this.registry.registerHeadRecordMerger(
      OrbitDBDeviceAuthorizationRepository.HEAD_PREFIX,
      (current, candidate) => this.mergeRecords(current, candidate),
      (networkId, value) =>
        this.isPrivateNetwork(networkId) ? value : undefined,
    );
  }

  private isPrivateNetwork(networkId: string): boolean {
    return this.networkRegistry
      .getAll()
      .some((network) => network.getId() === networkId && network.isPrivate());
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

    try {
      const [candidate] =
        await this.identityRepository.findFreshCandidateReferencesById(
          identityId,
        );

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
      return cached;
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

  private concurrentAuthorizations(
    authorization: DeviceAuthorization,
    candidates: Array<{
      authorization: DeviceAuthorization;
      transition: DeviceAuthorizationTransition;
    }>,
  ): DeviceAuthorization[] {
    const recoveries = candidates.filter(({ transition }) =>
      transition.isRecovery(),
    );

    if (recoveries.length > 0) {
      return [recoveries[0].authorization];
    }

    const revocations = candidates.filter(({ transition }) =>
      transition.isRevocation(),
    );

    if (revocations.length > 0) {
      return [
        authorization.revokeConcurrently(
          revocations.map(({ transition }) => transition.getTargetCredential()),
        ),
      ];
    }

    return [
      authorization.enrollConcurrently(
        candidates.map(({ transition }) => transition.getTargetCredential()),
      ),
    ];
  }

  private transitionFromRecord(
    record: OrbitDBDeviceAuthorizationTransitionRecord,
  ): DeviceAuthorizationTransition | undefined {
    const transition = DeviceAuthorizationTransition.fromPrimitives(
      record.transition,
    );

    return this.canonicalString(transition.toPrimitives()) ===
      this.canonicalString(record.transition)
      ? transition
      : undefined;
  }

  private replayFrom(
    authorization: DeviceAuthorization,
    recordsByRevision: Map<
      number,
      OrbitDBDeviceAuthorizationTransitionRecord[]
    >,
  ): DeviceAuthorizationReplay {
    const records =
      recordsByRevision.get(authorization.getRevision().valueOf()) ?? [];
    const candidates: Array<{
      authorization: DeviceAuthorization;
      record: OrbitDBDeviceAuthorizationTransitionRecord;
      transition: DeviceAuthorizationTransition;
    }> = [];

    for (const record of records) {
      try {
        const transition = this.transitionFromRecord(record);

        if (transition) {
          candidates.push({
            authorization: this.policy.apply(authorization, transition),
            record,
            transition,
          });
        }
      } catch {
        continue;
      }
    }

    if (candidates.length === 0) {
      return { authorization, history: [] };
    }

    const [checkpoint] = this.concurrentAuthorizations(
      authorization,
      candidates,
    );

    assert(
      checkpoint !== undefined,
      new InvalidDeviceAuthorizationTransitionError(),
    );
    const replay = this.replayFrom(checkpoint, recordsByRevision);

    return {
      authorization: replay.authorization,
      history: [...candidates.map(({ record }) => record), ...replay.history],
    };
  }

  private rebuild(
    genesis: DeviceAuthorization,
    history: OrbitDBDeviceAuthorizationTransitionRecord[],
  ): DeviceAuthorizationReplay {
    const recordsByRevision = this.transitionRecordsByRevision(history);

    return this.replayFrom(genesis, recordsByRevision);
  }

  private toDocument(
    genesis: DeviceAuthorization,
    history: OrbitDBDeviceAuthorizationTransitionRecord[],
    checkpoint?: OrbitDBDeviceAuthorizationDocument['checkpoint'],
  ): OrbitDBDeviceAuthorizationDocument {
    assert(
      this.hasBoundedHistoryShape(history),
      new InvalidDeviceAuthorizationTransitionError(),
    );
    const baseAuthorization = checkpoint
      ? this.authorizationFromCheckpoint(genesis, checkpoint)
      : genesis;
    const replay = this.rebuild(baseAuthorization, history);

    return {
      authorization: replay.authorization.toPrimitives(),
      ...(checkpoint ? { checkpoint } : {}),
      genesis: genesis.toPrimitives(),
      history: replay.history,
      id: this.documentId(replay.authorization.getIdentityId()),
      identityId: replay.authorization.getIdentityId().valueOf(),
      kind: 'device_authorization',
    };
  }

  private hasExactKeys(
    value: Record<string, unknown>,
    expected: string[],
  ): boolean {
    const keys = Object.keys(value).sort();

    return isDeepStrictEqual(keys, [...expected].sort());
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private isBoundedTransitionRecord(
    value: unknown,
  ): value is { transition: Record<string, unknown> } {
    if (
      !this.isRecord(value) ||
      !this.hasExactKeys(value, ['transition']) ||
      Buffer.byteLength(JSON.stringify(value), 'utf8') >
        OrbitDBDeviceAuthorizationRepository.MAX_TRANSITION_RECORD_BYTES
    ) {
      return false;
    }

    return this.isRecord(value.transition);
  }

  private previousRevisionOf(record: {
    transition: Record<string, unknown>;
  }): number | undefined {
    const { previousRevision } = record.transition;

    return typeof previousRevision === 'number' &&
      Number.isSafeInteger(previousRevision) &&
      previousRevision >= 0
      ? previousRevision
      : undefined;
  }

  private hasBoundedHistoryShape(history: unknown[]): boolean {
    if (
      history.length >
      OrbitDBDeviceAuthorizationRepository.MAX_TRANSITION_RECORDS
    ) {
      return false;
    }

    const recordsByRevision = new Map<number, number>();
    let historyBytes = 0;

    for (const value of history) {
      if (!this.isBoundedTransitionRecord(value)) {
        return false;
      }

      historyBytes += Buffer.byteLength(JSON.stringify(value), 'utf8');

      if (
        historyBytes >
        OrbitDBDeviceAuthorizationRepository.MAX_TRANSITION_HISTORY_BYTES
      ) {
        return false;
      }

      const previousRevision = this.previousRevisionOf(value);

      if (previousRevision === undefined) {
        return false;
      }

      const count = (recordsByRevision.get(previousRevision) ?? 0) + 1;

      recordsByRevision.set(previousRevision, count);

      if (
        count > OrbitDBDeviceAuthorizationRepository.MAX_CONCURRENT_TRANSITIONS
      ) {
        return false;
      }
    }

    return true;
  }

  private hasDocumentShape(value: Record<string, unknown>): boolean {
    const checkpoint = value.checkpoint;

    return [
      this.hasExactKeys(value, [
        'authorization',
        'genesis',
        'history',
        'id',
        'identityId',
        'kind',
        ...(checkpoint === undefined ? [] : ['checkpoint']),
      ]),
      value.kind === 'device_authorization',
      typeof value.id === 'string',
      typeof value.identityId === 'string',
      Array.isArray(value.history),
      typeof value.genesis === 'object' && value.genesis !== null,
      typeof value.authorization === 'object' && value.authorization !== null,
      checkpoint === undefined ||
        (this.isRecord(checkpoint) &&
          this.hasExactKeys(checkpoint, ['authorization', 'transition']) &&
          this.isRecord(checkpoint.authorization) &&
          this.isBoundedTransitionRecord(checkpoint.transition)),
    ].every(Boolean);
  }

  private authorizationFromCheckpoint(
    genesis: DeviceAuthorization,
    checkpoint: NonNullable<OrbitDBDeviceAuthorizationDocument['checkpoint']>,
  ): DeviceAuthorization {
    const transition = this.transitionFromRecord(checkpoint.transition);

    assert(
      transition !== undefined && transition.isRecovery(),
      new InvalidDeviceAuthorizationTransitionError(),
    );
    const authorization = this.policy.applyRecoveryCheckpoint(
      genesis,
      transition,
    );

    assert(
      isDeepStrictEqual(checkpoint.authorization, authorization.toPrimitives()),
      new InvalidDeviceAuthorizationTransitionError(),
    );

    return authorization;
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

      if (!this.hasBoundedHistoryShape(document.history)) {
        return false;
      }

      const genesis = DeviceAuthorization.fromPrimitives(document.genesis);
      const baseAuthorization = document.checkpoint
        ? this.authorizationFromCheckpoint(genesis, document.checkpoint)
        : genesis;
      const replay = this.rebuild(baseAuthorization, document.history);

      return (
        this.hasValidGenesis(document, genesis) &&
        isDeepStrictEqual(document.genesis, genesis.toPrimitives()) &&
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
    const acceptedCandidate = this.trustedDocument(candidate);

    if (!acceptedCandidate) {
      return current;
    }

    const acceptedCurrent = this.trustedDocument(current);

    if (!acceptedCurrent) {
      return acceptedCandidate;
    }

    if (!this.sameGenesis(acceptedCurrent, acceptedCandidate)) {
      return acceptedCurrent;
    }

    const checkpoint = this.preferredCheckpoint(
      acceptedCurrent,
      acceptedCandidate,
    );
    const checkpointRevision = checkpoint?.authorization.revision ?? 0;
    const history = this.transitionRecords(
      acceptedCurrent,
      acceptedCandidate,
    ).filter(
      (record) => record.transition.previousRevision >= checkpointRevision,
    );

    if (!this.hasBoundedHistoryShape(history)) {
      return this.preferredBoundedDocument(acceptedCurrent, acceptedCandidate);
    }

    return this.toDocument(
      DeviceAuthorization.fromPrimitives(acceptedCurrent.genesis),
      history,
      checkpoint,
    );
  }

  private trustedDocument(
    value: Record<string, unknown> | undefined,
  ): OrbitDBDeviceAuthorizationDocument | undefined {
    if (!value || !this.isDocument(value)) {
      return undefined;
    }

    return this.conflictsWithTrustedGenesis(value) ? undefined : value;
  }

  private preferredBoundedDocument(
    left: OrbitDBDeviceAuthorizationDocument,
    right: OrbitDBDeviceAuthorizationDocument,
  ): OrbitDBDeviceAuthorizationDocument {
    const documents: [
      OrbitDBDeviceAuthorizationDocument,
      OrbitDBDeviceAuthorizationDocument,
    ] = [left, right];

    documents.sort(
      (first, second) =>
        (second.checkpoint?.authorization.revision ?? 0) -
          (first.checkpoint?.authorization.revision ?? 0) ||
        first.authorization.credentials.length -
          second.authorization.credentials.length ||
        this.canonicalString(first).localeCompare(this.canonicalString(second)),
    );

    return documents[0];
  }

  private preferredCheckpoint(
    left: OrbitDBDeviceAuthorizationDocument,
    right: OrbitDBDeviceAuthorizationDocument,
  ): OrbitDBDeviceAuthorizationDocument['checkpoint'] {
    const checkpoints = [left.checkpoint, right.checkpoint].filter(
      (
        checkpoint,
      ): checkpoint is NonNullable<
        OrbitDBDeviceAuthorizationDocument['checkpoint']
      > => checkpoint !== undefined,
    );

    return checkpoints.sort(
      (first, second) =>
        second.authorization.revision - first.authorization.revision ||
        this.canonicalString(first).localeCompare(this.canonicalString(second)),
    )[0];
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

    return (
      document.history.some(
        (record) =>
          record.transition.operationId === operationId ||
          (pairingId !== undefined &&
            record.transition.pairingId === pairingId),
      ) ||
      document.checkpoint?.transition.transition.operationId === operationId
    );
  }

  private networkIds(authorization: DeviceAuthorization): string[] {
    return authorization
      .getNetworkIds()
      .map((networkId) => networkId.valueOf())
      .sort();
  }

  private privateNetworkIds(networkIds: string[]): string[] {
    const routableNetworkIds = new Set(networkIds);

    return this.networkRegistry
      .getAll()
      .filter(
        (network) =>
          network.isPrivate() && routableNetworkIds.has(network.getId()),
      )
      .map((network) => network.getId())
      .sort();
  }

  private async save(
    document: OrbitDBDeviceAuthorizationDocument,
  ): Promise<OrbitDBDeviceAuthorizationDocument> {
    const authorization = DeviceAuthorization.fromPrimitives(
      document.authorization,
    );
    const routableNetworkIds =
      this.routingNetworkIdsByIdentity.get(
        authorization.getIdentityId().valueOf(),
      ) ?? this.networkIds(authorization);
    const networkIds = this.privateNetworkIds(routableNetworkIds);

    assert(
      networkIds.length > 0,
      new InvalidDeviceAuthorizationTransitionError(),
    );

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

      const genesis = DeviceAuthorization.fromPrimitives(stored.genesis);
      const baseAuthorization = stored.checkpoint
        ? this.authorizationFromCheckpoint(genesis, stored.checkpoint)
        : genesis;
      const current = this.rebuild(
        baseAuthorization,
        stored.history,
      ).authorization;
      const authorization = this.policy.apply(current, transition);
      const transitionRecord = { transition: transition.toPrimitives() };
      const document = transition.isRecovery()
        ? this.toDocument(genesis, [], {
            authorization: authorization.toPrimitives(),
            transition: transitionRecord,
          })
        : this.toDocument(
            genesis,
            [...stored.history, transitionRecord],
            stored.checkpoint,
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
