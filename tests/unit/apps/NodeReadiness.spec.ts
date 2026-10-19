import NodeReadiness from '@app/apps/NodeReadiness';
import NodeRepository from '@app/contexts/nodes/domain/repositories/NodeRepository';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { mock, MockProxy } from 'jest-mock-extended';

describe('NodeReadiness', () => {
  let replicatedState: MockProxy<OrbitDBReplicatedStateRegistry>;
  let nodeRepository: MockProxy<NodeRepository>;
  let readiness: NodeReadiness;

  beforeEach(() => {
    replicatedState = mock<OrbitDBReplicatedStateRegistry>();
    nodeRepository = mock<NodeRepository>();
    readiness = new NodeReadiness(replicatedState, nodeRepository);
  });

  it('is not ready before startup has finished, even for an empty configuration', async () => {
    replicatedState.isOpen.mockReturnValue(false);
    replicatedState.hasNetworks.mockReturnValue(false);
    nodeRepository.isLocalNodeConfigurationEmpty.mockResolvedValue(true);

    await expect(readiness.isReady()).resolves.toBe(false);
  });

  it('is ready for a started fresh node whose persisted configuration has no networks', async () => {
    replicatedState.isOpen.mockReturnValue(false);
    replicatedState.hasNetworks.mockReturnValue(false);
    nodeRepository.isLocalNodeConfigurationEmpty.mockResolvedValue(true);
    readiness.markStarted();

    await expect(readiness.isReady()).resolves.toBe(true);
  });

  it('is not ready while a persisted network is not registered yet', async () => {
    replicatedState.isOpen.mockReturnValue(false);
    replicatedState.hasNetworks.mockReturnValue(false);
    nodeRepository.isLocalNodeConfigurationEmpty.mockResolvedValue(false);
    readiness.markStarted();

    await expect(readiness.isReady()).resolves.toBe(false);
  });

  it('is not ready while registered networks are still replaying, even when the configuration is empty', async () => {
    replicatedState.isOpen.mockReturnValue(false);
    replicatedState.hasNetworks.mockReturnValue(true);
    nodeRepository.isLocalNodeConfigurationEmpty.mockResolvedValue(true);
    readiness.markStarted();

    await expect(readiness.isReady()).resolves.toBe(false);
  });

  it('is ready once the replicated state is open', async () => {
    replicatedState.isOpen.mockReturnValue(true);
    replicatedState.hasNetworks.mockReturnValue(true);
    readiness.markStarted();

    await expect(readiness.isReady()).resolves.toBe(true);
  });

  it('is not ready when the persisted configuration cannot be read', async () => {
    replicatedState.isOpen.mockReturnValue(false);
    replicatedState.hasNetworks.mockReturnValue(false);
    nodeRepository.isLocalNodeConfigurationEmpty.mockRejectedValue(
      new Error('database unavailable'),
    );
    readiness.markStarted();

    await expect(readiness.isReady()).resolves.toBe(false);
  });

  it('is ready for a started fresh node without serving replicated state', async () => {
    replicatedState.isOpen.mockReturnValue(false);
    replicatedState.hasNetworks.mockReturnValue(false);
    nodeRepository.isLocalNodeConfigurationEmpty.mockResolvedValue(true);
    readiness.markStarted();

    await expect(readiness.isReady()).resolves.toBe(true);
    expect(readiness.isServingReplicatedState()).toBe(false);
  });

  it('serves replicated state only once started and open', () => {
    replicatedState.isOpen.mockReturnValue(true);
    expect(readiness.isServingReplicatedState()).toBe(false);

    readiness.markStarted();
    expect(readiness.isServingReplicatedState()).toBe(true);
  });
});
