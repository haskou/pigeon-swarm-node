import { NodeRegistrationCodeLimits } from '@app/contexts/nodes/domain/NodeRegistrationCodeLimits';
import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';

/** Reads the registration code bounds, falling back to the domain defaults. */
export class NodeRegistrationCodeLimitsFromEnvironment {
  private static positiveIntegerOr(value: number, fallback: number): number {
    return Number.isSafeInteger(value) && value > 0 ? value : fallback;
  }

  public static load(): NodeRegistrationCodeLimits {
    const environment = pigeonEnvironment();

    return new NodeRegistrationCodeLimits(
      NodeRegistrationCodeLimitsFromEnvironment.positiveIntegerOr(
        environment.NODE_REGISTRATION_CODE_MAX_USES,
        NodeRegistrationCodeLimits.DEFAULT_MAX_USES,
      ),
      NodeRegistrationCodeLimitsFromEnvironment.positiveIntegerOr(
        environment.NODE_REGISTRATION_CODE_MAX_TTL_DAYS,
        NodeRegistrationCodeLimits.DEFAULT_MAX_TTL_DAYS,
      ),
    );
  }
}
