import NodeRepository from '@app/contexts/nodes/domain/repositories/NodeRepository';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

/**
 * Whether this node is ready to serve replicated state. Startup must have
 * finished, so every runtime has started. The node is then ready once the
 * replicated state is open. Before that, a node with no registered network
 * is ready only when its persisted configuration is empty: a fresh node has
 * no network to replay and would otherwise never open. Liveness is a separate
 * question, answered by `/health`.
 */
export default class NodeReadiness {
  private started = false;

  constructor(
    private readonly replicatedState: OrbitDBReplicatedStateRegistry,
    private readonly nodeRepository: NodeRepository,
  ) {}

  public markStarted(): void {
    this.started = true;
  }

  /**
   * Whether replicated state can be read now. Keychain reads use this check,
   * not `isReady`: a node with no registered network is ready for probes
   * without its replicated state ever being open.
   */
  public isServingReplicatedState(): boolean {
    return this.started && this.replicatedState.isOpen();
  }

  public async isReady(): Promise<boolean> {
    if (!this.started) {
      return false;
    }

    if (this.replicatedState.isOpen()) {
      return true;
    }

    if (this.replicatedState.hasNetworks()) {
      return false;
    }

    try {
      return await this.nodeRepository.isLocalNodeConfigurationEmpty();
    } catch {
      // A configuration that cannot be read is not a fresh node.
      return false;
    }
  }
}
