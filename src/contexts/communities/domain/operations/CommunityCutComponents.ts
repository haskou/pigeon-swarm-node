type CommunityCutFrame = { next: number; node: string };

/**
 * The strongly connected components of the cut graph, in topological order:
 * Tarjan's algorithm, iterative so a long chain of cuts cannot exhaust the
 * stack.
 */
export class CommunityCutComponents {
  private readonly index = new Map<string, number>();

  private readonly low = new Map<string, number>();

  private readonly stack: string[] = [];

  private readonly onStack = new Set<string>();

  private readonly work: CommunityCutFrame[] = [];

  private readonly components: string[][] = [];

  public static of(
    nodes: string[],
    successors: ReadonlyMap<string, string[]>,
  ): string[][] {
    const graph = new CommunityCutComponents(successors);

    for (const root of nodes) {
      if (!graph.index.has(root)) graph.walkFrom(root);
    }

    // Tarjan emits a component after every component it reaches.
    return graph.components.reverse();
  }

  private constructor(
    private readonly successors: ReadonlyMap<string, string[]>,
  ) {}

  private visit(node: string): void {
    this.index.set(node, this.index.size);
    this.low.set(node, this.index.size - 1);
    this.stack.push(node);
    this.onStack.add(node);
    this.work.push({ next: 0, node });
  }

  private lower(node: string, value: number): void {
    this.low.set(node, Math.min(this.low.get(node) as number, value));
  }

  /** Follows the next edge of `frame`; false once it has none left. */
  private follow(frame: CommunityCutFrame): boolean {
    const edges = this.successors.get(frame.node) ?? [];

    if (frame.next >= edges.length) return false;

    const next = edges[frame.next];

    frame.next += 1;

    if (!this.index.has(next)) {
      this.visit(next);
    } else if (this.onStack.has(next)) {
      this.lower(frame.node, this.index.get(next) as number);
    }

    return true;
  }

  /** Leaves `frame`, emitting its component when it is the root of one. */
  private finish(frame: CommunityCutFrame): void {
    this.work.pop();

    const parent = this.work[this.work.length - 1];

    if (parent) this.lower(parent.node, this.low.get(frame.node) as number);

    if (this.low.get(frame.node) !== this.index.get(frame.node)) return;

    const component: string[] = [];
    let member: string;

    do {
      member = this.stack.pop() as string;
      this.onStack.delete(member);
      component.push(member);
    } while (member !== frame.node);

    this.components.push(component);
  }

  private walkFrom(root: string): void {
    this.visit(root);

    while (this.work.length > 0) {
      const frame = this.work[this.work.length - 1];

      if (!this.follow(frame)) this.finish(frame);
    }
  }
}
