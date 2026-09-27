import IdentityRepository from '@app/contexts/identities/domain/repositories/IdentityRepository';
import { DeviceAuthorization } from '@app/contexts/identity-devices/domain/DeviceAuthorization';
import { DeviceAuthorizationTransition } from '@app/contexts/identity-devices/domain/DeviceAuthorizationTransition';
import { InvalidDeviceAuthorizationTransitionError } from '@app/contexts/identity-devices/domain/errors/InvalidDeviceAuthorizationTransitionError';
import { DeviceAuthorizationRepository } from '@app/contexts/identity-devices/domain/repositories/DeviceAuthorizationRepository';
import DeviceAuthorizationPolicy from '@app/contexts/identity-devices/domain/services/DeviceAuthorizationPolicy';
import { DeviceAuthorizationRevision } from '@app/contexts/identity-devices/domain/value-objects/DeviceAuthorizationRevision';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { assert } from '@haskou/value-objects';
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

  private sameGenesis(
    left: OrbitDBDeviceAuthorizationDocument,
    right: OrbitDBDeviceAuthorizationDocument,
  ): boolean {
    return isDeepStrictEqual(left.genesis, right.genesis);
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
      const identity = await this.identityRepository.findById(identityId);
      const genesis = DeviceAuthorization.genesis(
        identityId,
        identity.getNetworkIds(),
        identity.getInitialDeviceCredential(),
        identity.getRecoveryAuthority(),
      );
      this.trustedGenesisByIdentity.set(identityId.valueOf(), genesis);

      return genesis;
    } catch {
      return undefined;
    }
  }

  private hasTrustedGenesis(
    document: OrbitDBDeviceAuthorizationDocument,
    genesis: DeviceAuthorization,
  ): boolean {
    return isDeepStrictEqual(document.genesis, genesis.toPrimitives());
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
      const operationId = record.transition.operationId;
      const current = records.get(operationId);

      if (
        !current ||
        this.canonicalString(record) < this.canonicalString(current)
      ) {
        records.set(operationId, record);
      }
    }

    return [...records.values()].sort((left, right) =>
      left.transition.operationId.localeCompare(right.transition.operationId),
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
      records.sort((left, right) =>
        left.transition.operationId.localeCompare(right.transition.operationId),
      );
    }

    return recordsByRevision;
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
      }> = [];

      for (const candidate of candidates) {
        try {
          validCandidates.push({
            authorization: this.policy.apply(
              authorization,
              DeviceAuthorizationTransition.fromPrimitives(
                candidate.transition,
              ),
            ),
            record: candidate,
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
      authorization = validCandidates[0].authorization;
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
      id: replay.authorization.getIdentityId().valueOf(),
      kind: 'device_authorization',
    };
  }

  private hasDocumentShape(value: Record<string, unknown>): boolean {
    return [
      value.kind === 'device_authorization',
      typeof value.id === 'string',
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
      document.id === genesis.getIdentityId().valueOf() &&
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
    const trusted = this.trustedGenesisByIdentity.get(document.id);

    return Boolean(
      trusted && !isDeepStrictEqual(document.genesis, trusted.toPrimitives()),
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
      .map((networkId) => networkId.valueOf());
  }

  private async save(
    document: OrbitDBDeviceAuthorizationDocument,
  ): Promise<void> {
    const authorization = DeviceAuthorization.fromPrimitives(
      document.authorization,
    );
    const networkIds = this.networkIds(authorization);

    await this.registry.putDocument('identities', document, networkIds);
    await this.registry.putHead(
      this.headKey(authorization.getIdentityId()),
      document,
      networkIds,
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
          : this.toDocument(trustedGenesis, []);

      if (stored !== candidate) {
        await this.save(stored);
      }
      assert(
        !this.hasReplay(stored, transition),
        new InvalidDeviceAuthorizationTransitionError(),
      );

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

      await this.save(document);

      return DeviceAuthorization.fromPrimitives(document.authorization);
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

      if (document !== candidate) {
        await this.save(document);
      }

      return DeviceAuthorization.fromPrimitives(document.authorization);
    });
  }

  public provision(authorization: DeviceAuthorization): Promise<void> {
    return this.withIdentityLock(authorization.getIdentityId(), async () => {
      const key = this.headKey(authorization.getIdentityId());
      this.trustedGenesisByIdentity.set(
        authorization.getIdentityId().valueOf(),
        authorization,
      );
      const existing = await this.registry.findHead(key);

      if (existing) {
        if (
          !this.isDocument(existing) ||
          !isDeepStrictEqual(existing.genesis, authorization.toPrimitives())
        ) {
          await this.save(this.toDocument(authorization, []));
        }

        return;
      }

      await this.save(this.toDocument(authorization, []));
    });
  }
}
