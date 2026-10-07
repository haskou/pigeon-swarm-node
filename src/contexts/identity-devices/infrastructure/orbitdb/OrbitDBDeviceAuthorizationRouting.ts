import { Identity } from '@app/contexts/identities/domain/Identity';
import { IdentityCandidate } from '@app/contexts/identities/domain/IdentityCandidate';
import IdentityRepository from '@app/contexts/identities/domain/repositories/IdentityRepository';
import IdentityCandidateValidationDomainService from '@app/contexts/identities/domain/services/IdentityCandidateValidationDomainService';
import { IdentityExternalIdentifier } from '@app/contexts/identities/domain/value-objects/IdentityExternalIdentifier';
import { IdentityVersion } from '@app/contexts/identities/domain/value-objects/IdentityVersion';
import { DeviceAuthorization } from '@app/contexts/identity-devices/domain/DeviceAuthorization';
import { InvalidDeviceAuthorizationTransitionError } from '@app/contexts/identity-devices/domain/errors/InvalidDeviceAuthorizationTransitionError';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import { assert } from '@haskou/value-objects';

interface GenesisIdentity {
  externalIdentifier: IdentityExternalIdentifier;
  identity: Identity;
}

export default class OrbitDBDeviceAuthorizationRouting {
  private static readonly MAX_GENESIS_MEMO = 1024;

  private readonly validator = new IdentityCandidateValidationDomainService();

  /** Derived from the verified version-1 identity; authoritative. */
  private readonly verifiedGenesisByIdentity = new Map<
    string,
    DeviceAuthorization
  >();

  /** Provisioned locally from an already validated chain; never replaces a verified genesis. */
  private readonly provisionedGenesisByIdentity = new Map<
    string,
    DeviceAuthorization
  >();

  private readonly genesisIdentityByCandidate = new Map<
    string,
    GenesisIdentity
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
    private readonly identityRepository: IdentityRepository,
    private readonly networkRegistry: IPFSNetworkRegistry,
  ) {}

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

  private rememberRouting(
    identityId: string,
    networkIds: string[],
    identityVersion: IdentityVersion,
    identityExternalIdentifier: IdentityExternalIdentifier,
  ): void {
    const currentVersion = this.routingVersionByIdentity.get(identityId);

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

    this.routingNetworkIdsByIdentity.set(identityId, networkIds);
    this.routingVersionByIdentity.set(identityId, identityVersion);
    this.routingExternalIdentifierByIdentity.set(
      identityId,
      identityExternalIdentifier,
    );
  }

  private async genesisIdentityOf(
    identityId: IdentityId,
    candidate: IdentityCandidate,
  ): Promise<GenesisIdentity | undefined> {
    const key = candidate.getExternalIdentifier().valueOf();
    const memoized = this.genesisIdentityByCandidate.get(key);

    if (memoized) {
      return memoized;
    }

    let root: GenesisIdentity = {
      externalIdentifier: candidate.getExternalIdentifier(),
      identity: candidate.getIdentity(),
    };
    const isValid = await this.validator.isValidChainFor(
      identityId,
      candidate.getIdentity(),
      async (externalIdentifier) => {
        const previous =
          await this.identityRepository.findByExternalIdentifier(
            externalIdentifier,
          );

        if (previous) {
          root = { externalIdentifier, identity: previous };
        }

        return previous;
      },
    );

    if (!isValid || !root.identity.isFirstVersion()) {
      return undefined;
    }

    if (
      this.genesisIdentityByCandidate.size >=
      OrbitDBDeviceAuthorizationRouting.MAX_GENESIS_MEMO
    ) {
      const [oldest] = this.genesisIdentityByCandidate.keys();

      this.genesisIdentityByCandidate.delete(oldest);
    }

    this.genesisIdentityByCandidate.set(key, root);

    return root;
  }

  private isEarlierGenesis(
    left: GenesisIdentity,
    right: GenesisIdentity,
  ): boolean {
    const leftTimestamp = left.identity.toPrimitives().timestamp;
    const rightTimestamp = right.identity.toPrimitives().timestamp;

    if (leftTimestamp !== rightTimestamp) {
      return leftTimestamp < rightTimestamp;
    }

    return (
      left.externalIdentifier.valueOf() < right.externalIdentifier.valueOf()
    );
  }

  public isPrivateNetwork(networkId: string): boolean {
    return this.networkRegistry
      .getAll()
      .some((network) => network.getId() === networkId && network.isPrivate());
  }

  public trustedGenesis(identityId: string): DeviceAuthorization | undefined {
    return (
      this.verifiedGenesisByIdentity.get(identityId) ??
      this.provisionedGenesisByIdentity.get(identityId)
    );
  }

  public routableNetworkIds(authorization: DeviceAuthorization): string[] {
    return (
      this.routingNetworkIdsByIdentity.get(
        authorization.getIdentityId().valueOf(),
      ) ?? this.networkIds(authorization)
    );
  }

  public networkIds(authorization: DeviceAuthorization): string[] {
    return authorization
      .getNetworkIds()
      .map((networkId) => networkId.valueOf())
      .sort();
  }

  public privateNetworkIds(networkIds: string[]): string[] {
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

  public remember(
    authorization: DeviceAuthorization,
    identityVersion: IdentityVersion,
    identityExternalIdentifier: IdentityExternalIdentifier,
  ): void {
    const identityId = authorization.getIdentityId().valueOf();

    this.rememberRouting(
      identityId,
      this.networkIds(authorization),
      identityVersion,
      identityExternalIdentifier,
    );

    if (!this.provisionedGenesisByIdentity.has(identityId)) {
      this.provisionedGenesisByIdentity.set(identityId, authorization);
    }
  }

  public forget(
    identityId: IdentityId,
    identityVersion: IdentityVersion,
    identityExternalIdentifier: IdentityExternalIdentifier,
  ): void {
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
      this.provisionedGenesisByIdentity.delete(key);
    }
  }

  /**
   * The genesis of an identity is derived from its verified version-1
   * identity. Among several valid version-1 forks the earliest signed one
   * wins, then the lowest external identifier. When the repository does not
   * know the identity at all, only a genesis verified earlier or provisioned by
   * the local publisher (after its own chain validation) is returned; an
   * identity whose candidates all fail validation yields no genesis.
   */
  public async resolveTrustedGenesis(
    identityId: IdentityId,
  ): Promise<DeviceAuthorization | undefined> {
    try {
      const candidates =
        await this.identityRepository.findFreshCandidateReferencesById(
          identityId,
        );

      if (candidates.length === 0) {
        return this.trustedGenesis(identityId.valueOf());
      }

      const roots = (
        await Promise.all(
          candidates.map((candidate) =>
            this.genesisIdentityOf(identityId, candidate),
          ),
        )
      ).filter((root): root is GenesisIdentity => root !== undefined);
      const genesisIdentity = roots.reduce<GenesisIdentity | undefined>(
        (best, root) =>
          !best || this.isEarlierGenesis(root, best) ? root : best,
        undefined,
      );

      if (!genesisIdentity) {
        return undefined;
      }

      const { identity } = genesisIdentity;
      const genesis = DeviceAuthorization.genesis(
        identityId,
        identity.getNetworkIds(),
        identity.getInitialDeviceCredential(),
        identity.getRecoveryAuthority(),
      );
      const [latest] = candidates;

      this.verifiedGenesisByIdentity.set(identityId.valueOf(), genesis);
      this.rememberRouting(
        identityId.valueOf(),
        latest
          .getIdentity()
          .getNetworkIds()
          .map((networkId) => networkId.valueOf())
          .sort(),
        latest.getIdentity().getVersion(),
        latest.getExternalIdentifier(),
      );

      return genesis;
    } catch {
      return this.trustedGenesis(identityId.valueOf());
    }
  }
}
