import { OrbitDBDocumentDeduplicatorOptions } from './OrbitDBDocumentDeduplicatorOptions';

export class OrbitDBDocumentDeduplicator<TDocument extends object> {
  constructor(
    private readonly options: OrbitDBDocumentDeduplicatorOptions<TDocument>,
  ) {}

  private merge(
    current: TDocument | undefined,
    candidate: TDocument,
  ): TDocument {
    if (!current) return candidate;

    if (this.options.merge) return this.options.merge(current, candidate);

    return (this.options.shouldReplace?.(current, candidate) ?? true)
      ? candidate
      : current;
  }

  public deduplicate(documents: TDocument[]): TDocument[] {
    const deduplicated = new Map<string, TDocument>();
    const withoutId: TDocument[] = [];

    for (const document of documents) {
      const id = this.options.recordId(document);

      if (!id) {
        withoutId.push(document);

        continue;
      }

      deduplicated.set(id, this.merge(deduplicated.get(id), document));
    }

    return [...withoutId, ...deduplicated.values()];
  }
}
