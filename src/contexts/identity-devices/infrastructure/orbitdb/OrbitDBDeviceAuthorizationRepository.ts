import IdentityRepository from '@app/contexts/identities/domain/repositories/IdentityRepository';
import { IdentityExternalIdentifier } from '@app/contexts/identities/domain/value-objects/IdentityExternalIdentifier';
import { IdentityVersion } from '@app/contexts/identities/domain/value-objects/IdentityVersion';
import { DeviceAuthorization } from '@app/contexts/identity-devices/domain/DeviceAuthorization';
import { DeviceAuthorizationTimeline } from '@app/contexts/identity-devices/domain/DeviceAuthorizationTimeline';
import { DeviceAuthorizationTransition } from '@app/contexts/identity-devices/domain/DeviceAuthorizationTransition';
import { InvalidDeviceAuthorizationTransitionError } from '@app/contexts/identity-devices/domain/errors/InvalidDeviceAuthorizationTransitionError';
import { DeviceAuthorizationRepository } from '@app/contexts/identity-devices/domain/repositories/DeviceAuthorizationRepository';
import DeviceAuthorizationPolicy from '@app/contexts/identity-devices/domain/services/DeviceAuthorizationPolicy';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
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
    const sources = new OrbitDBDeviceAuthorizationSources(canonicalizer);
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
      canonicalizer,
      replayer,
      sources,
      this.shape,
    );
    this.validator = new OrbitDBDeviceAuthorizationDocumentValidator(
      canonicalizer,
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

  private async readHead(
    identityId: IdentityId,
  ): Promise<Record<string, unknown> | undefined> {
    const key = this.headKey(identityId);
    let replicated = await this.registry.findHead(key);

    if (!replicated) {
      await this.registry.rehydrateHead(key);
      replicated = await this.registry.findHead(key);
    }

    if (replicated) {
      return replicated;
    }

    const local = await this.database.findOne(
      OrbitDBDeviceAuthorizationRepository.LOCAL_NAMESPACE,
      identityId.valueOf(),
    );

    return this.shape.isRecord(local?.document) ? local.document : undefined;
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

      assert(
        !this.projector.hasReplay(stored, transition),
        new InvalidDeviceAuthorizationTransitionError(),
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

      return DeviceAuthorization.fromPrimitives(saved.authorization);
    });
  }

  public find(
    identityId: IdentityId,
  ): Promise<DeviceAuthorization | undefined> {
    return this.lock.run(identityId, async () => {
      const document = await this.resolveDocument(identityId);

      return document
        ? DeviceAuthorization.fromPrimitives(document.authorization)
        : undefined;
    });
  }

  public findTimeline(
    identityId: IdentityId,
  ): Promise<DeviceAuthorizationTimeline | undefined> {
    return this.lock.run(identityId, async () => {
      const document = await this.resolveDocument(identityId);

      if (!document) {
        return undefined;
      }

      if (document.overflow) {
        return new DeviceAuthorizationTimeline([
          DeviceAuthorization.fromPrimitives(document.authorization),
        ]);
      }

      return new DeviceAuthorizationTimeline(
        this.replayer.statesOf(
          document.checkpoint
            ? this.replayer.authorizationFromCheckpoint(
                DeviceAuthorization.fromPrimitives(document.genesis),
                document.checkpoint,
              )
            : DeviceAuthorization.fromPrimitives(document.genesis),
          document.history,
        ),
      );
    });
  }

  public provision(
    authorization: DeviceAuthorization,
    identityVersion: IdentityVersion,
    identityExternalIdentifier: IdentityExternalIdentifier,
  ): Promise<void> {
    return this.lock.run(authorization.getIdentityId(), async () => {
      this.routing.remember(
        authorization,
        identityVersion,
        identityExternalIdentifier,
      );
      const existing = await this.readHead(authorization.getIdentityId());

      if (existing) {
        if (
          !this.validator.isDocument(existing) ||
          !this.genesisMatcher.sameAuthorizationGenesis(
            existing.genesis,
            authorization.toPrimitives(),
          )
        ) {
          await this.save(this.factory.toDocument(authorization, []));
        } else {
          await this.save(existing);
        }

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
