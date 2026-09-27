import { assert } from '@haskou/value-objects';

import { InvalidPrivateAuthorizationError } from './errors/InvalidPrivateAuthorizationError';
import { PrivateControlOperation } from './PrivateControlOperation';

export class PrivateOperationDependencyGraph {
  private readonly dependencies = new Map<string, Set<string>>();

  public constructor(operations: PrivateControlOperation[]) {
    for (const operation of operations) {
      const value = operation.toPrimitives();

      assert(
        !this.dependencies.has(value.id),
        new InvalidPrivateAuthorizationError(),
      );
      const dependencies = new Set(value.previousOperationIds);

      if (value.proposalOperationId) {
        dependencies.add(value.proposalOperationId);
      }
      this.dependencies.set(value.id, dependencies);
    }
  }

  private visit(
    operationId: string,
    visiting: Set<string>,
    visited: Set<string>,
  ): void {
    if (visited.has(operationId)) return;
    assert(!visiting.has(operationId), new InvalidPrivateAuthorizationError());
    visiting.add(operationId);

    for (const dependencyId of this.dependencies.get(operationId) ?? []) {
      if (this.dependencies.has(dependencyId)) {
        this.visit(dependencyId, visiting, visited);
      }
    }

    visiting.delete(operationId);
    visited.add(operationId);
  }

  public assertAcyclic(): void {
    const visited = new Set<string>();

    for (const operationId of this.dependencies.keys()) {
      this.visit(operationId, new Set(), visited);
    }
  }
}
