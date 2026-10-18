import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

/**
 * Whether this node is ready to serve replicated state. Startup must have
 * finished, so every runtime has started, and the replicated state must be
 * open. Liveness is a separate question, answered by `/health`.
 */
export default class NodeReadiness {
  private started = false;

  constructor(
    private readonly replicatedState: OrbitDBReplicatedStateRegistry,
  ) {}

  public markStarted(): void {
    this.started = true;
  }

  public isReady(): boolean {
    return this.started && this.replicatedState.isOpen();
  }
}
