import { CommunityOperation } from './CommunityOperation';

/**
 * Causal order of one set of operations, given in an order where parents come
 * first. An ancestry test walks the parents of the later operation and never
 * below the position of the earlier one, so it touches only the operations
 * between them.
 */
export class CommunityOperationAncestry {
  private readonly positions = new Map<string, number>();

  private readonly operations = new Map<string, CommunityOperation>();

  public constructor(ordered: CommunityOperation[]) {
    ordered.forEach((operation, position) => {
      this.positions.set(operation.getHash(), position);
      this.operations.set(operation.getHash(), operation);
    });
  }

  /** The parents of a known operation; none for one outside the set. */
  private parentsOf(hash: string): string[] {
    return this.operations.get(hash)?.getParents() ?? [];
  }

  /**
   * Walks the parents of `operation` down to `floor`, the position of
   * `ancestor`: below it nothing can be `ancestor`.
   */
  private walksTo(ancestor: string, operation: string, floor: number): boolean {
    const seen = new Set<string>();
    const stack = [...this.parentsOf(operation)];

    while (stack.length > 0) {
      const hash = stack.pop() as string;

      if (hash === ancestor) return true;

      if (!seen.has(hash) && (this.positions.get(hash) ?? -1) > floor) {
        seen.add(hash);
        stack.push(...this.parentsOf(hash));
      }
    }

    return false;
  }

  /** Whether `ancestor` is in the closure of `operation` (parents and up). */
  public isAncestor(ancestor: string, operation: string): boolean {
    const floor = this.positions.get(ancestor);
    const position = this.positions.get(operation);

    // Parents come first, so nothing at or after `operation` is its ancestor.
    return (
      floor !== undefined &&
      position !== undefined &&
      floor < position &&
      this.walksTo(ancestor, operation, floor)
    );
  }

  /** Neither operation is in the closure of the other. */
  public areConcurrent(left: string, right: string): boolean {
    return (
      left !== right &&
      !this.isAncestor(left, right) &&
      !this.isAncestor(right, left)
    );
  }

  /** The union of the closures of `operations`. */
  public closureOf(operations: string[]): Set<string> {
    const closure = new Set<string>();
    const stack = operations.flatMap((hash) => this.parentsOf(hash));

    while (stack.length > 0) {
      const hash = stack.pop() as string;

      if (!closure.has(hash)) {
        closure.add(hash);
        stack.push(...this.parentsOf(hash));
      }
    }

    return closure;
  }
}
