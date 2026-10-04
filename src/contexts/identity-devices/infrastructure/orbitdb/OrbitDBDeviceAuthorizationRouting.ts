import IdentityRepository from '@app/contexts/identities/domain/repositories/IdentityRepository';
import { IdentityExternalIdentifier } from '@app/contexts/identities/domain/value-objects/IdentityExternalIdentifier';
import { IdentityVersion } from '@app/contexts/identities/domain/value-objects/IdentityVersion';
import { DeviceAuthorization } from '@app/contexts/identity-devices/domain/DeviceAuthorization';
import { InvalidDeviceAuthorizationTransitionError } from '@app/contexts/identity-devices/domain/errors/InvalidDeviceAuthorizationTransitionError';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import { assert } from '@haskou/value-objects';

export default class OrbitDBDeviceAuthorizationRouting {
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

  public isPrivateNetwork(networkId: string): boolean {
    return this.networkRegistry
      .getAll()
      .some((network) => network.getId() === networkId && network.isPrivate());
  }

  public trustedGenesis(identityId: string): DeviceAuthorization | undefined {
    return this.trustedGenesisByIdentity.get(identityId);
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
      this.trustedGenesisByIdentity.delete(key);
    }
  }

  public async resolveTrustedGenesis(
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
      this.remember(
        genesis,
        identity.getVersion(),
        candidate.getExternalIdentifier(),
      );

      return genesis;
    } catch {
      return cached;
    }
  }
}
