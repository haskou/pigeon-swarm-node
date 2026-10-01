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
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

import { OrbitDBDeviceAuthorizationDocument } from './documents/OrbitDBDeviceAuthorizationDocument';
import { OrbitDBDeviceAuthorizationSource } from './documents/OrbitDBDeviceAuthorizationSource';
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

  private static readonly MAX_OVERFLOW_SOURCE_RECORDS = 512;

  private static readonly MAX_OVERFLOW_SOURCE_BYTES = 2_200_000;

  private static readonly MAX_DOCUMENT_ADMISSION_BYTES = 6_000_000;

  private static readonly MAX_DOCUMENT_ADMISSION_NODES = 100_000;

  private static readonly MAX_DOCUMENT_ADMISSION_DEPTH = 64;

  private readonly identityQueues = new Map<string, Promise<void>>();

  private readonly documentValidationCache = new Map<string, boolean>();

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
      left.epoch === right.epoch &&
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

  private uniqueTransitionRecords(
    histories: OrbitDBDeviceAuthorizationTransitionRecord[][],
  ): OrbitDBDeviceAuthorizationTransitionRecord[] {
    const uniqueRecords = new Map<
      string,
      OrbitDBDeviceAuthorizationTransitionRecord
    >();

    for (const history of histories) {
      for (const record of history) {
        uniqueRecords.set(this.canonicalString(record), record);
      }
    }

    return [...uniqueRecords.values()].sort((left, right) => {
      const operationOrder = left.transition.operationId.localeCompare(
        right.transition.operationId,
      );

      return (
        operationOrder ||
        this.canonicalString(left).localeCompare(this.canonicalString(right))
      );
    });
  }

  private effectiveHistory(
    document: OrbitDBDeviceAuthorizationDocument,
  ): OrbitDBDeviceAuthorizationTransitionRecord[] {
    return this.uniqueTransitionRecords(
      this.documentSources(document).map((source) => source.history),
    );
  }

  private effectiveCheckpoint(
    document: OrbitDBDeviceAuthorizationDocument,
  ): OrbitDBDeviceAuthorizationDocument['checkpoint'] {
    return this.preferredSourceCheckpoint(this.documentSources(document));
  }

  private documentSources(
    document: OrbitDBDeviceAuthorizationDocument,
  ): OrbitDBDeviceAuthorizationSource[] {
    return (
      document.overflow?.sources ??
      document.sources ?? [
        {
          ...(document.checkpoint ? { checkpoint: document.checkpoint } : {}),
          history: document.history,
        },
      ]
    );
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

  private compactEquivalentCandidates(
    candidates: Array<{
      authorization: DeviceAuthorization;
      record: OrbitDBDeviceAuthorizationTransitionRecord;
      transition: DeviceAuthorizationTransition;
    }>,
  ): Array<{
    authorization: DeviceAuthorization;
    record: OrbitDBDeviceAuthorizationTransitionRecord;
    transition: DeviceAuthorizationTransition;
  }> {
    const candidatesByEffect = new Map<string, (typeof candidates)[number]>();

    for (const candidate of candidates) {
      const effect = this.canonicalString({
        operation: candidate.transition.getOperation().valueOf(),
        previousRevision: candidate.transition.getPreviousRevision().valueOf(),
        targetCredential: candidate.transition.getTargetCredential().valueOf(),
      });
      const current = candidatesByEffect.get(effect);

      if (
        !current ||
        this.canonicalString(candidate.record) <
          this.canonicalString(current.record)
      ) {
        candidatesByEffect.set(effect, candidate);
      }
    }

    return [...candidatesByEffect.values()];
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

    const compactedCandidates = this.compactEquivalentCandidates(candidates);

    if (compactedCandidates.length === 0) {
      return { authorization, history: [] };
    }

    const [checkpoint] = this.concurrentAuthorizations(
      authorization,
      compactedCandidates,
    );

    assert(
      checkpoint !== undefined,
      new InvalidDeviceAuthorizationTransitionError(),
    );
    const replay = this.replayFrom(checkpoint, recordsByRevision);

    return {
      authorization: replay.authorization,
      history: [
        ...compactedCandidates.map(({ record }) => record),
        ...replay.history,
      ],
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
    sources?: OrbitDBDeviceAuthorizationSource[],
  ): OrbitDBDeviceAuthorizationDocument {
    assert(
      this.hasBoundedHistoryShape(history),
      new InvalidDeviceAuthorizationTransitionError(),
    );
    const baseAuthorization = checkpoint
      ? this.authorizationFromCheckpoint(genesis, checkpoint)
      : genesis;
    const replay = this.rebuild(baseAuthorization, history);
    const canonicalSources = this.sourcesAtPreferredCheckpoint(
      genesis,
      this.canonicalSources(
        sources ?? [
          {
            ...(checkpoint ? { checkpoint } : {}),
            history: replay.history,
          },
        ],
      ),
    );
    const projection = this.replaySources(genesis, canonicalSources);

    return this.documentFromReplay(
      genesis,
      projection.replay,
      canonicalSources,
      projection.checkpoint,
    );
  }

  private documentFromReplay(
    genesis: DeviceAuthorization,
    replay: DeviceAuthorizationReplay,
    sources: OrbitDBDeviceAuthorizationSource[],
    checkpoint?: OrbitDBDeviceAuthorizationDocument['checkpoint'],
  ): OrbitDBDeviceAuthorizationDocument {
    assert(
      this.hasBoundedHistoryShape(replay.history) &&
        this.hasBoundedSourcesShape(sources),
      new InvalidDeviceAuthorizationTransitionError(),
    );

    return {
      authorization: replay.authorization.toPrimitives(),
      ...(checkpoint ? { checkpoint } : {}),
      genesis: genesis.toPrimitives(),
      history: replay.history,
      id: this.documentId(replay.authorization.getIdentityId()),
      identityId: replay.authorization.getIdentityId().valueOf(),
      kind: 'device_authorization',
      sources,
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

  private canonicalSources(
    sources: OrbitDBDeviceAuthorizationSource[],
  ): OrbitDBDeviceAuthorizationSource[] {
    const unique = new Map<string, OrbitDBDeviceAuthorizationSource>();

    for (const source of sources) {
      unique.set(this.canonicalString(source), source);
    }

    const candidates = [...unique.values()];
    const retained = candidates.filter(
      (candidate) =>
        !candidates.some(
          (other) =>
            other !== candidate && this.sourceExtends(other, candidate),
        ),
    );

    return retained.sort((left, right) =>
      this.canonicalString(left).localeCompare(this.canonicalString(right)),
    );
  }

  private sourceExtends(
    candidate: OrbitDBDeviceAuthorizationSource,
    prefix: OrbitDBDeviceAuthorizationSource,
  ): boolean {
    if (
      candidate.history.length <= prefix.history.length ||
      !isDeepStrictEqual(candidate.checkpoint, prefix.checkpoint)
    ) {
      return false;
    }

    return prefix.history.every((record, index) =>
      isDeepStrictEqual(record, candidate.history[index]),
    );
  }

  private hasBoundedSourcesShape(
    sources: OrbitDBDeviceAuthorizationSource[],
  ): boolean {
    const recordCount = sources.reduce(
      (count, source) => count + source.history.length,
      0,
    );

    return (
      sources.length > 0 &&
      recordCount <=
        OrbitDBDeviceAuthorizationRepository.MAX_TRANSITION_RECORDS &&
      Buffer.byteLength(JSON.stringify(sources), 'utf8') <=
        OrbitDBDeviceAuthorizationRepository.MAX_TRANSITION_HISTORY_BYTES
    );
  }

  private hasBoundedOverflowSourcesShape(
    sources: OrbitDBDeviceAuthorizationSource[],
  ): boolean {
    const recordCount = sources.reduce(
      (count, source) => count + source.history.length,
      0,
    );

    return (
      recordCount <=
        OrbitDBDeviceAuthorizationRepository.MAX_OVERFLOW_SOURCE_RECORDS &&
      Buffer.byteLength(JSON.stringify(sources), 'utf8') <=
        OrbitDBDeviceAuthorizationRepository.MAX_OVERFLOW_SOURCE_BYTES
    );
  }

  private hasCheckpointShape(checkpoint: unknown): boolean {
    return (
      checkpoint === undefined ||
      (this.isRecord(checkpoint) &&
        this.hasExactKeys(checkpoint, [
          'authorization',
          'lineage',
          'transition',
        ]) &&
        this.isRecord(checkpoint.authorization) &&
        Array.isArray(checkpoint.lineage) &&
        checkpoint.lineage.length <= 1024 &&
        checkpoint.lineage.every((record) =>
          this.isBoundedTransitionRecord(record),
        ) &&
        this.isBoundedTransitionRecord(checkpoint.transition))
    );
  }

  private hasOverflowShape(overflow: unknown, checkpoint: unknown): boolean {
    return (
      overflow === undefined ||
      (checkpoint === undefined &&
        this.isRecord(overflow) &&
        this.hasOverflowFields(overflow))
    );
  }

  private hasOverflowFields(overflow: Record<string, unknown>): boolean {
    return (
      this.hasExactKeys(overflow, ['frontier', 'sources']) &&
      Array.isArray(overflow.sources) &&
      this.isRecord(overflow.frontier)
    );
  }

  private hasDocumentCoreShape(value: Record<string, unknown>): boolean {
    return (
      value.kind === 'device_authorization' &&
      typeof value.id === 'string' &&
      typeof value.identityId === 'string' &&
      Array.isArray(value.history) &&
      (value.sources === undefined || Array.isArray(value.sources)) &&
      this.isRecord(value.genesis) &&
      this.isRecord(value.authorization)
    );
  }

  private hasDocumentShape(value: Record<string, unknown>): boolean {
    const checkpoint = value.checkpoint;
    const overflow = value.overflow;

    return (
      this.hasExactKeys(value, [
        'authorization',
        'genesis',
        'history',
        'id',
        'identityId',
        'kind',
        ...(value.sources === undefined ? [] : ['sources']),
        ...(checkpoint === undefined ? [] : ['checkpoint']),
        ...(overflow === undefined ? [] : ['overflow']),
      ]) &&
      this.hasDocumentCoreShape(value) &&
      this.hasCheckpointShape(checkpoint) &&
      this.hasOverflowShape(overflow, checkpoint)
    );
  }

  private authorizationFromCheckpoint(
    genesis: DeviceAuthorization,
    checkpoint: NonNullable<OrbitDBDeviceAuthorizationDocument['checkpoint']>,
  ): DeviceAuthorization {
    const authorization = [...checkpoint.lineage, checkpoint.transition].reduce(
      (current, record) => {
        const transition = this.transitionFromRecord(record);

        assert(
          transition !== undefined && transition.isRecovery(),
          new InvalidDeviceAuthorizationTransitionError(),
        );

        return this.policy.applyRecoveryCheckpoint(current, transition);
      },
      genesis,
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

  private hasSourceShape(
    source: unknown,
  ): source is OrbitDBDeviceAuthorizationSource {
    if (!this.isRecord(source)) {
      return false;
    }

    const checkpoint = source.checkpoint;

    return (
      this.hasExactKeys(source, [
        'history',
        ...(checkpoint === undefined ? [] : ['checkpoint']),
      ]) &&
      Array.isArray(source.history) &&
      this.hasCheckpointShape(checkpoint)
    );
  }

  private sourceReplay(
    genesis: DeviceAuthorization,
    source: OrbitDBDeviceAuthorizationSource,
  ): DeviceAuthorizationReplay {
    return this.rebuild(
      source.checkpoint
        ? this.authorizationFromCheckpoint(genesis, source.checkpoint)
        : genesis,
      source.history,
    );
  }

  private isValidSource(
    genesis: DeviceAuthorization,
    source: OrbitDBDeviceAuthorizationSource,
  ): boolean {
    if (!this.hasBoundedHistoryShape(source.history)) {
      return false;
    }

    return isDeepStrictEqual(
      this.sourceReplay(genesis, source).history,
      source.history,
    );
  }

  private preferredSourceCheckpoint(
    sources: OrbitDBDeviceAuthorizationSource[],
  ): OrbitDBDeviceAuthorizationDocument['checkpoint'] {
    return sources
      .map((source) => source.checkpoint)
      .filter(
        (
          checkpoint,
        ): checkpoint is NonNullable<
          OrbitDBDeviceAuthorizationDocument['checkpoint']
        > => checkpoint !== undefined,
      )
      .sort(
        (left, right) =>
          right.authorization.revision - left.authorization.revision ||
          this.canonicalString(left).localeCompare(this.canonicalString(right)),
      )[0];
  }

  private replaySources(
    genesis: DeviceAuthorization,
    sources: OrbitDBDeviceAuthorizationSource[],
  ): {
    checkpoint?: OrbitDBDeviceAuthorizationDocument['checkpoint'];
    replay: DeviceAuthorizationReplay;
  } {
    const checkpoint = this.preferredSourceCheckpoint(sources);
    const checkpointRevision = checkpoint?.authorization.revision ?? 0;
    const history = this.uniqueTransitionRecords(
      sources.map((source) => source.history),
    ).filter(
      (record) => record.transition.previousRevision >= checkpointRevision,
    );

    return {
      ...(checkpoint ? { checkpoint } : {}),
      replay: this.rebuild(
        checkpoint
          ? this.authorizationFromCheckpoint(genesis, checkpoint)
          : genesis,
        history,
      ),
    };
  }

  private sourcesAtPreferredCheckpoint(
    genesis: DeviceAuthorization,
    sources: OrbitDBDeviceAuthorizationSource[],
  ): OrbitDBDeviceAuthorizationSource[] {
    const checkpoint = this.preferredSourceCheckpoint(sources);

    if (!checkpoint) {
      return this.canonicalSources(sources);
    }

    const authorization = this.authorizationFromCheckpoint(genesis, checkpoint);

    return this.canonicalSources(
      sources.map((source) => ({
        checkpoint,
        history: isDeepStrictEqual(source.checkpoint, checkpoint)
          ? this.rebuild(authorization, source.history).history
          : [],
      })),
    );
  }

  private hasBoundedProjection(
    replay: DeviceAuthorizationReplay,
    sources: OrbitDBDeviceAuthorizationSource[],
  ): boolean {
    return (
      this.hasBoundedSourcesShape(sources) &&
      this.hasBoundedHistoryShape(replay.history)
    );
  }

  private hasValidSources(
    document: OrbitDBDeviceAuthorizationDocument,
    genesis: DeviceAuthorization,
  ): boolean {
    const sources = this.documentSources(document);

    if (
      !this.hasBoundedSourcesShape(sources) ||
      !isDeepStrictEqual(sources, this.canonicalSources(sources)) ||
      !sources.every(
        (source) =>
          this.hasSourceShape(source) && this.isValidSource(genesis, source),
      )
    ) {
      return false;
    }

    const normalizedSources = this.sourcesAtPreferredCheckpoint(
      genesis,
      sources,
    );
    const { checkpoint, replay } = this.replaySources(
      genesis,
      normalizedSources,
    );

    return (
      isDeepStrictEqual(sources, normalizedSources) &&
      isDeepStrictEqual(document.checkpoint, checkpoint) &&
      this.matchesReplay(document, replay)
    );
  }

  private isDocument(
    value: Record<string, unknown>,
  ): value is OrbitDBDeviceAuthorizationDocument {
    if (!this.hasDocumentAdmissionShape(value)) {
      return false;
    }

    let fingerprint: string;

    try {
      const serialized = JSON.stringify(value);

      if (
        Buffer.byteLength(serialized, 'utf8') >
        OrbitDBDeviceAuthorizationRepository.MAX_DOCUMENT_ADMISSION_BYTES
      ) {
        return false;
      }

      fingerprint = createHash('sha256')
        .update(this.canonicalString(value))
        .digest('base64url');
    } catch {
      return false;
    }
    const cached = this.documentValidationCache.get(fingerprint);

    if (cached !== undefined) {
      return cached;
    }

    const valid = this.validateDocument(value);

    this.documentValidationCache.set(fingerprint, valid);

    if (this.documentValidationCache.size > 128) {
      const [oldest] = this.documentValidationCache.keys();

      if (oldest) {
        this.documentValidationCache.delete(oldest);
      }
    }

    return valid;
  }

  private hasDocumentAdmissionShape(value: unknown): boolean {
    const stack: Array<{ depth: number; value: unknown }> = [
      { depth: 0, value },
    ];
    let bytes = 0;
    let nodes = 0;

    while (stack.length > 0) {
      const current = stack.pop();

      if (!current) {
        continue;
      }

      nodes += 1;

      if (this.exceedsAdmissionTraversal(nodes, current.depth)) {
        return false;
      }

      const admitted = this.admitDocumentNode(current.value);

      if (!admitted) {
        return false;
      }

      bytes += admitted.bytes;
      stack.push(
        ...admitted.children.map((item) => ({
          depth: current.depth + 1,
          value: item,
        })),
      );

      if (
        bytes >
        OrbitDBDeviceAuthorizationRepository.MAX_DOCUMENT_ADMISSION_BYTES
      ) {
        return false;
      }
    }

    return true;
  }

  private exceedsAdmissionTraversal(nodes: number, depth: number): boolean {
    return (
      nodes >
        OrbitDBDeviceAuthorizationRepository.MAX_DOCUMENT_ADMISSION_NODES ||
      depth > OrbitDBDeviceAuthorizationRepository.MAX_DOCUMENT_ADMISSION_DEPTH
    );
  }

  private admitDocumentNode(
    value: unknown,
  ): { bytes: number; children: unknown[] } | undefined {
    if (typeof value === 'string') {
      return { bytes: Buffer.byteLength(value, 'utf8'), children: [] };
    }

    if (Array.isArray(value)) {
      return value.length <= 1024 ? { bytes: 0, children: value } : undefined;
    }

    if (!this.isRecord(value)) {
      return { bytes: 8, children: [] };
    }

    const entries = Object.entries(value);

    return entries.length <= 32
      ? {
          bytes: entries.reduce(
            (total, [key]) => total + Buffer.byteLength(key, 'utf8'),
            0,
          ),
          children: entries.map(([, item]) => item),
        }
      : undefined;
  }

  private validateDocument(value: Record<string, unknown>): boolean {
    try {
      if (!this.hasDocumentShape(value)) {
        return false;
      }

      const document = value as unknown as OrbitDBDeviceAuthorizationDocument;

      if (document.overflow) {
        return this.isOverflowDocument(document);
      }

      if (!this.hasBoundedHistoryShape(document.history)) {
        return false;
      }

      const genesis = DeviceAuthorization.fromPrimitives(document.genesis);

      return (
        this.hasValidGenesis(document, genesis) &&
        isDeepStrictEqual(document.genesis, genesis.toPrimitives()) &&
        this.hasValidSources(document, genesis)
      );
    } catch {
      return false;
    }
  }

  private isOverflowDocument(
    document: OrbitDBDeviceAuthorizationDocument,
  ): boolean {
    const overflow = document.overflow;

    if (!overflow || !this.hasValidOverflowEvidence(document, overflow)) {
      return false;
    }

    const genesis = DeviceAuthorization.fromPrimitives(document.genesis);
    const replay = this.replaySources(genesis, overflow.sources).replay;
    const authorization = replay.authorization.requireRecoveryAt(
      this.overflowRevision(replay, overflow.frontier),
    );

    return (
      this.hasValidGenesis(document, genesis) &&
      isDeepStrictEqual(document.genesis, genesis.toPrimitives()) &&
      isDeepStrictEqual(document.authorization, authorization.toPrimitives())
    );
  }

  private hasValidOverflowEvidence(
    document: OrbitDBDeviceAuthorizationDocument,
    overflow: NonNullable<OrbitDBDeviceAuthorizationDocument['overflow']>,
  ): boolean {
    if (!this.hasEmptyOverflowProjection(document)) {
      return false;
    }

    const genesis = DeviceAuthorization.fromPrimitives(document.genesis);

    return (
      this.hasDominantOverflowFrontier(document, genesis, overflow) &&
      this.isMinimalOverflowSources(genesis, overflow.sources)
    );
  }

  private hasDominantOverflowFrontier(
    document: OrbitDBDeviceAuthorizationDocument,
    genesis: DeviceAuthorization,
    overflow: NonNullable<OrbitDBDeviceAuthorizationDocument['overflow']>,
  ): boolean {
    if (
      overflow.frontier.overflow !== undefined ||
      !this.isDocument(overflow.frontier) ||
      this.documentSources(overflow.frontier).length !== 1 ||
      !this.sameGenesis(document, overflow.frontier)
    ) {
      return false;
    }

    const sources = this.sourcesAtPreferredCheckpoint(
      genesis,
      this.canonicalSources([
        ...overflow.sources,
        ...this.documentSources(overflow.frontier),
      ]),
    );

    return isDeepStrictEqual(
      overflow.frontier,
      this.frontierFromSources(genesis, sources),
    );
  }

  private hasEmptyOverflowProjection(
    document: OrbitDBDeviceAuthorizationDocument,
  ): boolean {
    return (
      document.checkpoint === undefined &&
      document.history.length === 0 &&
      (document.sources?.length ?? 0) === 0
    );
  }

  private isMinimalOverflowSources(
    genesis: DeviceAuthorization,
    sources: OrbitDBDeviceAuthorizationSource[],
  ): boolean {
    const replay = this.replaySources(genesis, sources).replay;
    const hasBoundedHistory = this.hasBoundedHistoryShape(replay.history);
    const hasBoundedSources = this.hasBoundedSourcesShape(sources);

    if (
      sources.length === 0 ||
      (hasBoundedHistory && hasBoundedSources) ||
      !this.hasBoundedOverflowSourcesShape(sources) ||
      !isDeepStrictEqual(sources, this.canonicalSources(sources)) ||
      !isDeepStrictEqual(
        sources,
        this.sourcesAtPreferredCheckpoint(genesis, sources),
      ) ||
      !sources.every(
        (source) =>
          this.hasSourceShape(source) && this.isValidSource(genesis, source),
      )
    ) {
      return false;
    }

    return this.hasBoundedOverflowPrefix(
      genesis,
      sources.slice(0, -1),
      hasBoundedHistory,
    );
  }

  private hasBoundedOverflowPrefix(
    genesis: DeviceAuthorization,
    sources: OrbitDBDeviceAuthorizationSource[],
    completeHistoryIsBounded: boolean,
  ): boolean {
    if (completeHistoryIsBounded) {
      return this.hasBoundedSourcesShape(sources);
    }

    return this.hasBoundedProjection(
      this.replaySources(genesis, sources).replay,
      sources,
    );
  }

  private overflowRevision(
    replay: DeviceAuthorizationReplay,
    frontier: OrbitDBDeviceAuthorizationDocument,
  ): DeviceAuthorizationRevision {
    const replayRevision = replay.authorization.getRevision();
    const frontierRevision = new DeviceAuthorizationRevision(
      frontier.authorization.revision,
    );
    const latestRevision = replayRevision.isGreaterThan(frontierRevision)
      ? replayRevision
      : frontierRevision;

    return latestRevision.next();
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

  private mergedReplay(
    left: OrbitDBDeviceAuthorizationDocument,
    right: OrbitDBDeviceAuthorizationDocument,
  ): {
    checkpoint?: OrbitDBDeviceAuthorizationDocument['checkpoint'];
    genesis: DeviceAuthorization;
    replay: DeviceAuthorizationReplay;
    sources: OrbitDBDeviceAuthorizationSource[];
  } {
    const genesis = DeviceAuthorization.fromPrimitives(left.genesis);
    const sources = this.sourcesAtPreferredCheckpoint(
      genesis,
      this.canonicalSources([
        ...this.mergeSourceEvidence(left),
        ...this.mergeSourceEvidence(right),
      ]),
    );
    const { checkpoint, replay } = this.replaySources(genesis, sources);

    return {
      ...(checkpoint ? { checkpoint } : {}),
      genesis,
      replay,
      sources,
    };
  }

  private mergeSourceEvidence(
    document: OrbitDBDeviceAuthorizationDocument,
  ): OrbitDBDeviceAuthorizationSource[] {
    return [
      ...this.documentSources(document),
      ...(document.overflow
        ? this.documentSources(document.overflow.frontier)
        : []),
    ];
  }

  private frontierFromSources(
    genesis: DeviceAuthorization,
    sources: OrbitDBDeviceAuthorizationSource[],
  ): OrbitDBDeviceAuthorizationDocument {
    const ordered = sources
      .map((source) => ({
        replay: this.sourceReplay(genesis, source),
        source,
      }))
      .sort(
        (left, right) =>
          right.replay.authorization.getRevision().valueOf() -
            left.replay.authorization.getRevision().valueOf() ||
          this.canonicalString(left.source).localeCompare(
            this.canonicalString(right.source),
          ),
      );
    const [frontier] = ordered;

    assert(
      frontier !== undefined,
      new InvalidDeviceAuthorizationTransitionError(),
    );

    return this.toDocument(
      genesis,
      frontier.source.history,
      frontier.source.checkpoint,
      [frontier.source],
    );
  }

  private minimalOverflowSources(
    genesis: DeviceAuthorization,
    sources: OrbitDBDeviceAuthorizationSource[],
  ): OrbitDBDeviceAuthorizationSource[] {
    const hasBoundedHistory = this.hasBoundedHistoryShape(
      this.replaySources(genesis, sources).replay.history,
    );

    for (let length = 1; length <= sources.length; length += 1) {
      const candidate = sources.slice(0, length);

      if (
        hasBoundedHistory
          ? !this.hasBoundedSourcesShape(candidate)
          : !this.hasBoundedProjection(
              this.replaySources(genesis, candidate).replay,
              candidate,
            )
      ) {
        return candidate;
      }
    }

    assert(false, new InvalidDeviceAuthorizationTransitionError());
  }

  private overflowDocument(
    genesis: DeviceAuthorization,
    sources: OrbitDBDeviceAuthorizationSource[],
    frontier: OrbitDBDeviceAuthorizationDocument,
  ): OrbitDBDeviceAuthorizationDocument {
    const witness = this.minimalOverflowSources(genesis, sources);
    const replay = this.replaySources(genesis, witness).replay;
    const authorization = replay.authorization.requireRecoveryAt(
      this.overflowRevision(replay, frontier),
    );

    return {
      authorization: authorization.toPrimitives(),
      genesis: genesis.toPrimitives(),
      history: [],
      id: this.documentId(genesis.getIdentityId()),
      identityId: genesis.getIdentityId().valueOf(),
      kind: 'device_authorization',
      overflow: {
        frontier,
        sources: witness,
      },
      sources: [],
    };
  }

  private recoverySupersedesOverflow(
    candidate: OrbitDBDeviceAuthorizationDocument,
    overflow: OrbitDBDeviceAuthorizationDocument,
  ): boolean {
    const checkpoint = candidate.checkpoint;

    if (!checkpoint) {
      return false;
    }

    const checkpointRevision = new DeviceAuthorizationRevision(
      checkpoint.authorization.revision,
    );
    const overflowRevision = new DeviceAuthorizationRevision(
      overflow.authorization.revision,
    );

    return (
      checkpointRevision.isGreaterThan(overflowRevision) ||
      checkpointRevision.isEqual(overflowRevision)
    );
  }

  private mergeOverflow(
    left: OrbitDBDeviceAuthorizationDocument,
    right: OrbitDBDeviceAuthorizationDocument,
  ): OrbitDBDeviceAuthorizationDocument | undefined {
    if (!left.overflow && !right.overflow) {
      return undefined;
    }

    const recovery = this.supersedingRecovery(left, right);

    if (recovery) {
      return recovery;
    }

    const merged = this.mergedReplay(left, right);

    return this.overflowDocument(
      merged.genesis,
      merged.sources,
      this.frontierFromSources(merged.genesis, merged.sources),
    );
  }

  private supersedingRecovery(
    left: OrbitDBDeviceAuthorizationDocument,
    right: OrbitDBDeviceAuthorizationDocument,
  ): OrbitDBDeviceAuthorizationDocument | undefined {
    if (
      left.overflow &&
      !right.overflow &&
      this.recoverySupersedesOverflow(right, left)
    ) {
      return right;
    }

    if (
      right.overflow &&
      !left.overflow &&
      this.recoverySupersedesOverflow(left, right)
    ) {
      return left;
    }

    return undefined;
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

    const overflow = this.mergeOverflow(acceptedCurrent, acceptedCandidate);

    if (overflow) {
      return overflow;
    }

    const merged = this.mergedReplay(acceptedCurrent, acceptedCandidate);
    const { checkpoint, genesis, replay, sources } = merged;

    return this.hasBoundedProjection(replay, sources)
      ? this.documentFromReplay(genesis, replay, sources, checkpoint)
      : this.overflowDocument(
          genesis,
          sources,
          this.frontierFromSources(genesis, sources),
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
    const checkpoint = this.effectiveCheckpoint(document);

    return Boolean(
      this.effectiveHistory(document).some(
        (record) =>
          record.transition.operationId === operationId ||
          (pairingId !== undefined &&
            record.transition.pairingId === pairingId),
      ) || checkpoint?.transition.transition.operationId === operationId,
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

  private applyOverflowRecovery(
    suspended: DeviceAuthorization,
    transition: DeviceAuthorizationTransition,
  ): DeviceAuthorization {
    assert(
      transition.isRecovery() &&
        suspended.getEpoch().isEqual(transition.getEpoch()) &&
        suspended.getRevision().isEqual(transition.getPreviousRevision()) &&
        transition.getRevision().immediatelyFollows(suspended.getRevision()),
      new InvalidDeviceAuthorizationTransitionError(),
    );

    return this.policy.applyRecoveryCheckpoint(suspended, transition);
  }

  private documentAfterTransition(
    stored: OrbitDBDeviceAuthorizationDocument,
    genesis: DeviceAuthorization,
    authorization: DeviceAuthorization,
    transition: DeviceAuthorizationTransition,
  ): OrbitDBDeviceAuthorizationDocument {
    const transitionRecord = { transition: transition.toPrimitives() };

    if (transition.isRecovery()) {
      const checkpoint = this.effectiveCheckpoint(stored);

      return this.toDocument(genesis, [], {
        authorization: authorization.toPrimitives(),
        lineage: checkpoint
          ? [...checkpoint.lineage, checkpoint.transition]
          : [],
        transition: transitionRecord,
      });
    }

    const source: OrbitDBDeviceAuthorizationSource = {
      ...(stored.checkpoint ? { checkpoint: stored.checkpoint } : {}),
      history: [...stored.history, transitionRecord],
    };
    const sources = this.sourcesAtPreferredCheckpoint(
      genesis,
      this.canonicalSources([...this.documentSources(stored), source]),
    );
    const projection = this.replaySources(genesis, sources);

    return this.hasBoundedProjection(projection.replay, sources)
      ? this.documentFromReplay(
          genesis,
          projection.replay,
          sources,
          projection.checkpoint,
        )
      : this.overflowDocument(
          genesis,
          sources,
          this.toDocument(genesis, source.history, source.checkpoint),
        );
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
          : await this.save(this.toDocument(trustedGenesis, []));

      assert(
        !this.hasReplay(stored, transition),
        new InvalidDeviceAuthorizationTransitionError(),
      );
      this.policy.verifyFirstAcceptance(transition, new Timestamp(Date.now()));

      const genesis = DeviceAuthorization.fromPrimitives(stored.genesis);
      const authorization = stored.overflow
        ? this.applyOverflowRecovery(
            DeviceAuthorization.fromPrimitives(stored.authorization),
            transition,
          )
        : this.policy.apply(
            this.rebuild(
              stored.checkpoint
                ? this.authorizationFromCheckpoint(genesis, stored.checkpoint)
                : genesis,
              stored.history,
            ).authorization,
            transition,
          );
      const document = this.documentAfterTransition(
        stored,
        genesis,
        authorization,
        transition,
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

  public withdrawProvision(
    identityId: IdentityId,
    identityVersion: IdentityVersion,
    identityExternalIdentifier: IdentityExternalIdentifier,
  ): Promise<void> {
    return this.withIdentityLock(identityId, () => {
      const key = identityId.valueOf();
      const currentVersion = this.routingVersionByIdentity.get(key);
      const currentExternalIdentifier =
        this.routingExternalIdentifierByIdentity.get(key);

      if (
        currentVersion?.isEqual(identityVersion) &&
        currentExternalIdentifier?.isEqual(identityExternalIdentifier)
      ) {
        this.routingNetworkIdsByIdentity.delete(key);
        this.routingVersionByIdentity.delete(key);
        this.routingExternalIdentifierByIdentity.delete(key);
        this.trustedGenesisByIdentity.delete(key);
      }

      return Promise.resolve();
    });
  }
}
