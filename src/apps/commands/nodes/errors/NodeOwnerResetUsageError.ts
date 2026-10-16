/** The operator ran `yarn node:reset-owner` without one valid new owner. */
export class NodeOwnerResetUsageError extends Error {
  private static readonly USAGE =
    'yarn node:reset-owner <new owner identity id>';

  public static missingNewOwner(): NodeOwnerResetUsageError {
    return new NodeOwnerResetUsageError(
      `Name the new node owner: ${NodeOwnerResetUsageError.USAGE}`,
    );
  }

  public static invalidNewOwner(): NodeOwnerResetUsageError {
    return new NodeOwnerResetUsageError(
      `The new node owner must be an identity id: ${NodeOwnerResetUsageError.USAGE}`,
    );
  }
}
