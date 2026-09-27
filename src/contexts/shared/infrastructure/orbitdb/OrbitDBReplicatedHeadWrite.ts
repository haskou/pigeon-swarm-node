import { OrbitDBReplicatedHeadCollectionName } from './OrbitDBReplicatedHeadCollectionName';

export class OrbitDBReplicatedHeadWrite {
  private static readonly DIRECTIVE_ATTRIBUTE = '__pigeonHeadWrite';
  private static readonly DIRECTIVE_VERSION = 1;
  private static readonly REPLACE_MODE = 'replace';

  private static replacementCollectionName(
    directive: unknown,
  ): OrbitDBReplicatedHeadCollectionName | undefined {
    if (
      typeof directive !== 'object' ||
      directive === null ||
      Array.isArray(directive) ||
      Reflect.get(directive, 'mode') !==
        OrbitDBReplicatedHeadWrite.REPLACE_MODE ||
      Reflect.get(directive, 'version') !==
        OrbitDBReplicatedHeadWrite.DIRECTIVE_VERSION
    ) {
      return undefined;
    }

    const value = Reflect.get(directive, 'collectionName');

    if (typeof value !== 'string') return undefined;

    try {
      return new OrbitDBReplicatedHeadCollectionName(value);
    } catch {
      return undefined;
    }
  }

  public static merge(
    head: Record<string, unknown>,
  ): OrbitDBReplicatedHeadWrite {
    return new OrbitDBReplicatedHeadWrite(head, false);
  }

  public static replacement(
    head: Record<string, unknown>,
    collectionName: OrbitDBReplicatedHeadCollectionName,
  ): OrbitDBReplicatedHeadWrite {
    return new OrbitDBReplicatedHeadWrite(head, true, collectionName);
  }

  public static from(
    value: Record<string, unknown>,
  ): OrbitDBReplicatedHeadWrite {
    const head = { ...value };
    const directive = head[OrbitDBReplicatedHeadWrite.DIRECTIVE_ATTRIBUTE];
    delete head[OrbitDBReplicatedHeadWrite.DIRECTIVE_ATTRIBUTE];
    const collectionName =
      OrbitDBReplicatedHeadWrite.replacementCollectionName(directive);

    return collectionName
      ? new OrbitDBReplicatedHeadWrite(head, true, collectionName)
      : OrbitDBReplicatedHeadWrite.merge(head);
  }

  private constructor(
    private readonly head: Record<string, unknown>,
    private readonly replace: boolean,
    private readonly collectionName?: OrbitDBReplicatedHeadCollectionName,
  ) {}

  public getCollectionName(): OrbitDBReplicatedHeadCollectionName | undefined {
    return this.collectionName;
  }

  public getHead(): Record<string, unknown> {
    return this.head;
  }

  public replacesCurrentHead(): boolean {
    return this.replace;
  }

  public toPrimitives(): Record<string, unknown> {
    if (!this.replace) {
      return this.head;
    }

    return {
      ...this.head,
      [OrbitDBReplicatedHeadWrite.DIRECTIVE_ATTRIBUTE]: {
        collectionName: this.collectionName?.valueOf(),
        mode: OrbitDBReplicatedHeadWrite.REPLACE_MODE,
        version: OrbitDBReplicatedHeadWrite.DIRECTIVE_VERSION,
      },
    };
  }
}
