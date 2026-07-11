import CallSignalDeliveryExpirationRegistrar from '@app/contexts/calls/application/expire-signal-deliveries/CallSignalDeliveryExpirationRegistrar';
import CallSignalDeliveryRetrier from '@app/contexts/calls/application/retry-signal-deliveries/CallSignalDeliveryRetrier';
import InMemoryCallSignalDeliveryRepository from '@app/contexts/calls/infrastructure/memory/InMemoryCallSignalDeliveryRepository';
import NodeRepository from '@app/contexts/nodes/domain/repositories/NodeRepository';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import { Runtime } from '@app/shared/infrastructure/lifecycle/Runtime';
import Kernel from '@haskou/ddd-kernel';
import { Timestamp } from '@haskou/value-objects';

export default class CallSignalDeliveryMaintenanceRuntime implements Runtime {
  private static readonly FAILURE_BACKOFF_MS = 1_000;

  private maintenanceTimeout?: ReturnType<typeof setTimeout>;

  private listenerRegistered = false;

  private maintenanceRunning = false;

  private ownerNodeId?: NodeId;

  constructor(
    private readonly repository: InMemoryCallSignalDeliveryRepository,
    private readonly retrier: CallSignalDeliveryRetrier,
    private readonly expirationRegistrar: CallSignalDeliveryExpirationRegistrar,
    private readonly nodeRepository: NodeRepository,
  ) {}

  private scheduleNextMaintenance(minimumDelayMs = 0): void {
    if (this.maintenanceRunning || !this.ownerNodeId) {
      return;
    }

    if (this.maintenanceTimeout) {
      clearTimeout(this.maintenanceTimeout);
      this.maintenanceTimeout = undefined;
    }

    const nextMaintenanceAt = this.repository.findNextMaintenanceAt(
      this.ownerNodeId,
    );

    if (!nextMaintenanceAt) {
      return;
    }

    const delay = Math.max(
      minimumDelayMs,
      nextMaintenanceAt.valueOf() - Date.now(),
    );

    this.maintenanceTimeout = setTimeout(() => {
      this.maintenanceTimeout = undefined;
      void this.maintain();
    }, delay);
    this.maintenanceTimeout.unref?.();
  }

  private async maintain(): Promise<void> {
    const now = Timestamp.now();
    let minimumDelayMs = 0;

    this.maintenanceRunning = true;

    try {
      await this.retrier.retry(now);
      await this.expirationRegistrar.expire(now);
    } catch (error: unknown) {
      minimumDelayMs = CallSignalDeliveryMaintenanceRuntime.FAILURE_BACKOFF_MS;
      Kernel.logger.warn(
        `Call signal delivery maintenance failed: ${String(error)}`,
      );
    } finally {
      this.maintenanceRunning = false;
      this.scheduleNextMaintenance(minimumDelayMs);
    }
  }

  public async run(): Promise<void> {
    this.ownerNodeId = await this.nodeRepository.loadLocalNodeId();

    if (!this.listenerRegistered) {
      this.listenerRegistered = true;
      this.repository.onChanged(() => this.scheduleNextMaintenance());
    }

    this.scheduleNextMaintenance();
  }
}
