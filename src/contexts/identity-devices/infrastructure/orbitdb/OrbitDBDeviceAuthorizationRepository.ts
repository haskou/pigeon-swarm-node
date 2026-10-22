import IdentityRepository from '@app/contexts/identities/domain/repositories/IdentityRepository';
import { IdentityExternalIdentifier } from '@app/contexts/identities/domain/value-objects/IdentityExternalIdentifier';
import { IdentityVersion } from '@app/contexts/identities/domain/value-objects/IdentityVersion';
import { DeviceAuthorization } from '@app/contexts/identity-devices/domain/DeviceAuthorization';
import { DeviceAuthorizationTimeline } from '@app/contexts/identity-devices/domain/DeviceAuthorizationTimeline';
import { DeviceAuthorizationTransition } from '@app/contexts/identity-devices/domain/DeviceAuthorizationTransition';
import { DeviceAuthorizationTransitionLog } from '@app/contexts/identity-devices/domain/DeviceAuthorizationTransitionLog';
import { DeviceCompromiseCaps } from '@app/contexts/identity-devices/domain/DeviceCompromiseCaps';
import { DeviceAuthorizationGenesisConflictError } from '@app/contexts/identity-devices/domain/errors/DeviceAuthorizationGenesisConflictError';
import { DeviceAuthorizationNotFoundError } from '@app/contexts/identity-devices/domain/errors/DeviceAuthorizationNotFoundError';
import { InvalidDeviceAuthorizationTransitionError } from '@app/contexts/identity-devices/domain/errors/InvalidDeviceAuthorizationTransitionError';
import { DeviceAuthorizationRepository } from '@app/contexts/identity-devices/domain/repositories/DeviceAuthorizationRepository';
import DeviceAuthorizationPolicy from '@app/contexts/identity-devices/domain/services/DeviceAuthorizationPolicy';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import ReplicatedStateNotReadyError from '@app/contexts/shared/infrastructure/orbitdb/ReplicatedStateNotReadyError';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';
import { Timestamp, assert } from '@haskou/value-objects';

import { OrbitDBDeviceAuthorizationDocument } from './documents/OrbitDBDeviceAuthorizationDocument';
import OrbitDBDeviceAuthorizationCanonicalizer from './OrbitDBDeviceAuthorizationCanonicalizer';
import OrbitDBDeviceAuthorizationDocumentFactory from './OrbitDBDeviceAuthorizationDocumentFactory';
import OrbitDBDeviceAuthorizationDocumentMerger from './OrbitDBDeviceAuthorizationDocumentMerger';
import OrbitDBDeviceAuthorizationDocumentShape from './OrbitDBDeviceAuthorizationDocumentShape';
import OrbitDBDeviceAuthorizationDocumentValidator from './OrbitDBDeviceAuthorizationDocumentValidator';
import OrbitDBDeviceAuthorizationGenesisMatcher from './OrbitDBDeviceAuthorizationGenesisMatcher';
import OrbitDBDeviceAuthorizationIdentityLock from './OrbitDBDeviceAuthorizationIdentityLock';
import OrbitDBDeviceAuthorizationReplayer from './OrbitDBDeviceAuthorizationReplayer';
import OrbitDBDeviceAuthorizationRouting from './OrbitDBDeviceAuthorizationRouting';
import OrbitDBDeviceAuthorizationSources from './OrbitDBDeviceAuthorizationSources';
import OrbitDBDeviceAuthorizationTransitionProjector from './OrbitDBDeviceAuthorizationTransitionProjector';

export default class OrbitDBDeviceAuthorizationRepository extends DeviceAuthorizationRepository {
  private static readonly HEAD_PREFIX = 'device-authorization:';

  private static readonly LOCAL_NAMESPACE = 'identity_device_authorizations';

  private readonly replayer: OrbitDBDeviceAuthorizationReplayer;

  private readonly lock: OrbitDBDeviceAuthorizationIdentityLock;

  private readonly routing: OrbitDBDeviceAuthorizationRouting;

  private readonly genesisMatcher: OrbitDBDeviceAuthorizationGenesisMatcher;

  private readonly shape: OrbitDBDeviceAuthorizationDocumentShape;

  private readonly factory: OrbitDBDeviceAuthorizationDocumentFactory;

  private readonly validator: OrbitDBDeviceAuthorizationDocumentValidator;

  private readonly merger: OrbitDBDeviceAuthorizationDocumentMerger;

  private readonly projector: OrbitDBDeviceAuthorizationTransitionProjector;

  public constructor(
    private readonly registry: OrbitDBReplicatedStateRegistry,
    private readonly policy: DeviceAuthorizationPolicy,
    identityRepository: IdentityRepository,
    networkRegistry: IPFSNetworkRegistry,
    private readonly database: EmbeddedLocalDatabase,
  ) {
    super();
    const canonicalizer = new OrbitDBDeviceAuthorizationCanonicalizer();
    const sources = new OrbitDBDeviceAuthorizationSources(
      policy,
      canonicalizer,
    );
    const replayer = new OrbitDBDeviceAuthorizationReplayer(
      policy,
      canonicalizer,
      sources,
    );

    this.replayer = replayer;
    this.lock = new OrbitDBDeviceAuthorizationIdentityLock();
    this.routing = new OrbitDBDeviceAuthorizationRouting(
      identityRepository,
      networkRegistry,
    );
    this.genesisMatcher = new OrbitDBDeviceAuthorizationGenesisMatcher();
    this.shape = new OrbitDBDeviceAuthorizationDocumentShape();
    this.factory = new OrbitDBDeviceAuthorizationDocumentFactory(
      policy,
      canonicalizer,
      replayer,
      sources,
      this.shape,
    );
    this.validator = new OrbitDBDeviceAuthorizationDocumentValidator(
      policy,
      this.factory,
      this.genesisMatcher,
      replayer,
      this.shape,
      sources,
    );
    this.merger = new OrbitDBDeviceAuthorizationDocumentMerger(
      this.factory,
      this.genesisMatcher,
      replayer,
      this.routing,
      this.shape,
      sources,
      this.validator,
    );
    this.projector = new OrbitDBDeviceAuthorizationTransitionProjector(
      policy,
      this.factory,
      replayer,
      this.shape,
      sources,
    );
    this.registry.registerHeadRecordMerger(
      OrbitDBDeviceAuthorizationRepository.HEAD_PREFIX,
      (current, candidate) => this.merger.mergeRecords(current, candidate),
      (networkId, value) =>
        this.routing.isPrivateNetwork(networkId) ? value : undefined,
    );
  }

  private headKey(identityId: IdentityId): string {
    return `${OrbitDBDeviceAuthorizationRepository.HEAD_PREFIX}${identityId.valueOf()}`;
  }

  /**
   * The stored head of the identity. Absence is returned only after the
   * replicated store settled the key and the local copy was read completely;
   * any retrieval failure or unreadable copy rejects as not ready, so a caller
   * never saves a genesis-only document over history it could not read.
   */
  private async readHead(
    identityId: IdentityId,
  ): Promise<Record<string, unknown> | undefined> {
    const key = this.headKey(identityId);

    try {
      let replicated = await this.registry.findHead(key);

      if (!replicated && (await this.registry.rehydrateHead(key))) {
        replicated =
          (await this.registry.findHead(key)) ??
          (await this.registry.findPersistedHead(key));
      }

      if (replicated) {
        return replicated;
      }

      const local = await this.database.findOne(
        OrbitDBDeviceAuthorizationRepository.LOCAL_NAMESPACE,
        identityId.valueOf(),
      );

      if (local === undefined) {
        return undefined;
      }

      assert(
        this.shape.isRecord(local.document),
        new ReplicatedStateNotReadyError(),
      );

      return local.document;
    } catch (error) {
      throw error instanceof ReplicatedStateNotReadyError
        ? error
        : new ReplicatedStateNotReadyError();
    }
  }

  private async save(
    document: OrbitDBDeviceAuthorizationDocument,
  ): Promise<OrbitDBDeviceAuthorizationDocument> {
    const authorization = DeviceAuthorization.fromPrimitives(
      document.authorization,
    );
    const networkIds = this.routing.privateNetworkIds(
      this.routing.routableNetworkIds(authorization),
    );

    if (networkIds.length === 0) {
      await this.database.save(
        OrbitDBDeviceAuthorizationRepository.LOCAL_NAMESPACE,
        authorization.getIdentityId().valueOf(),
        { document },
      );

      return document;
    }

    await this.registry.putHead(
      this.headKey(authorization.getIdentityId()),
      document,
      networkIds,
    );
    const saved = await this.registry.findHead(
      this.headKey(authorization.getIdentityId()),
    );

    assert(
      saved !== undefined && this.validator.isDocument(saved),
      new InvalidDeviceAuthorizationTransitionError(),
    );

    return saved;
  }

  /** The stored document of the identity, provisioned from its genesis when absent. */
  private async resolveDocument(
    identityId: IdentityId,
  ): Promise<OrbitDBDeviceAuthorizationDocument | undefined> {
    const trustedGenesis = await this.routing.resolveTrustedGenesis(identityId);

    if (!trustedGenesis) {
      return undefined;
    }

    const candidate = await this.readHead(identityId);
    const document =
      candidate &&
      this.validator.isDocument(candidate) &&
      this.genesisMatcher.hasTrustedGenesis(candidate, trustedGenesis)
        ? candidate
        : this.factory.toDocument(trustedGenesis, []);

    return document !== candidate ? this.save(document) : document;
  }

  /**
   * The genesis this node already holds for the identity: verified earlier,
   * provisioned here, or in its stored document. It never asks the network: a
   * new identity has no version list there yet and could never publish.
   */
  private heldGenesis(
    identityId: IdentityId,
    stored: Record<string, unknown> | undefined,
  ): OrbitDBDeviceAuthorizationDocument['genesis'] | undefined {
    const known = this.routing.trustedGenesis(identityId.valueOf());

    if (known) {
      return known.toPrimitives();
    }

    return stored && this.validator.isDocument(stored)
      ? stored.genesis
      : undefined;
  }

  public compareAndApply(
    transition: DeviceAuthorizationTransition,
  ): Promise<DeviceAuthorization> {
    return this.lock.run(transition.getIdentityId(), async () => {
      const trustedGenesis = await this.routing.resolveTrustedGenesis(
        transition.getIdentityId(),
      );
      const candidate = await this.readHead(transition.getIdentityId());

      assert(
        trustedGenesis !== undefined,
        new InvalidDeviceAuthorizationTransitionError(),
      );
      const stored =
        candidate &&
        this.validator.isDocument(candidate) &&
        this.genesisMatcher.hasTrustedGenesis(candidate, trustedGenesis)
          ? candidate
          : await this.save(this.factory.toDocument(trustedGenesis, []));

      this.policy.verifyNotReplayed(
        transition,
        this.replayer.recordedTransitions(stored),
      );
      this.policy.verifyFirstAcceptance(transition, new Timestamp(Date.now()));

      const genesis = DeviceAuthorization.fromPrimitives(stored.genesis);
      const authorization = this.projector.authorizationAfter(
        stored,
        genesis,
        transition,
      );
      const document = this.projector.documentAfterTransition(
        stored,
        genesis,
        authorization,
        transition,
      );

      const saved = await this.save(document);

      const persisted = DeviceAuthorization.fromPrimitives(saved.authorization);
      const applied =
        JSON.stringify(persisted.toPrimitives()) ===
        JSON.stringify(authorization.toPrimitives());

      return applied ? authorization : persisted;
    });
  }

  public has(identityId: IdentityId): Promise<boolean> {
    return this.lock.run(
      identityId,
      async () => (await this.resolveDocument(identityId)) !== undefined,
    );
  }

  public require(identityId: IdentityId): Promise<DeviceAuthorization> {
    return this.lock.run(identityId, async () => {
      const document = await this.resolveDocument(identityId);

      assert(document, new DeviceAuthorizationNotFoundError());

      return DeviceAuthorization.fromPrimitives(document.authorization);
    });
  }

  public requireTimeline(
    identityId: IdentityId,
  ): Promise<DeviceAuthorizationTimeline> {
    return this.lock.run(identityId, async () => {
      const document = await this.resolveDocument(identityId);

      assert(document, new DeviceAuthorizationNotFoundError());

      return this.replayer.timelineOf(
        DeviceAuthorization.fromPrimitives(document.genesis),
        document,
      );
    });
  }

  public requireTransitionLog(
    identityId: IdentityId,
  ): Promise<DeviceAuthorizationTransitionLog> {
    return this.lock.run(identityId, async () => {
      const document = await this.resolveDocument(identityId);

      assert(document, new DeviceAuthorizationNotFoundError());

      return this.replayer.transitionLogOf(
        DeviceAuthorization.fromPrimitives(document.genesis),
        document,
      );
    });
  }

  public findCompromisedSince(
    identityId: IdentityId,
  ): Promise<DeviceCompromiseCaps> {
    return this.lock.run(identityId, async () => {
      const document = await this.resolveDocument(identityId);

      return document
        ? this.replayer.compromiseCapsOf(
            DeviceAuthorization.fromPrimitives(document.genesis),
            document,
          )
        : DeviceCompromiseCaps.none();
    });
  }

  public provision(
    authorization: DeviceAuthorization,
    identityVersion: IdentityVersion,
    identityExternalIdentifier: IdentityExternalIdentifier,
  ): Promise<void> {
    return this.lock.run(authorization.getIdentityId(), async () => {
      const identityId = authorization.getIdentityId();
      const trustedGenesis = this.heldGenesis(
        identityId,
        this.routing.trustedGenesis(identityId.valueOf())
          ? undefined
          : await this.readHead(identityId),
      );

      assert(
        !trustedGenesis ||
          this.genesisMatcher.sameAuthorizationGenesis(
            trustedGenesis,
            authorization.toPrimitives(),
          ),
        new DeviceAuthorizationGenesisConflictError(),
      );
      this.routing.remember(
        authorization,
        identityVersion,
        identityExternalIdentifier,
      );
      // Read again: the registry admits a replicated head only once its
      // genesis is trusted, so the read above may miss the stored history.
      const existing = await this.readHead(identityId);

      if (
        existing &&
        this.validator.isDocument(existing) &&
        this.genesisMatcher.sameAuthorizationGenesis(
          existing.genesis,
          authorization.toPrimitives(),
        )
      ) {
        await this.save(existing);

        return;
      }

      await this.save(this.factory.toDocument(authorization, []));
    });
  }

  public withdrawProvision(
    identityId: IdentityId,
    identityVersion: IdentityVersion,
    identityExternalIdentifier: IdentityExternalIdentifier,
  ): Promise<void> {
    return this.lock.run(identityId, () => {
      this.routing.forget(
        identityId,
        identityVersion,
        identityExternalIdentifier,
      );

      return Promise.resolve();
    });
  }
}
