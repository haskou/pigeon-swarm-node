import { NodeBlockSourceFetchLimits } from '@app/contexts/nodes/domain/NodeBlockSourceFetchLimits';
import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';
import { Duration } from '@haskou/value-objects';

/** Reads the operator-configured block source fetch bounds from the process environment. */
export class NodeBlockSourceFetchLimitsFromEnvironment {
  public static load(): NodeBlockSourceFetchLimits {
    const environment = pigeonEnvironment();

    return new NodeBlockSourceFetchLimits(
      Duration.fromMilliseconds(
        environment.NODE_BLOCK_SOURCE_FETCH_INTERVAL_MS,
      ),
      environment.NODE_BLOCK_LIST_MAX_BYTES,
      Duration.fromMilliseconds(environment.NODE_BLOCK_SOURCE_FETCH_TIMEOUT_MS),
    );
  }
}
