import { OrbitDBDocumentDeduplicatorOptions } from './OrbitDBDocumentDeduplicatorOptions';

export class OrbitDBDocumentDeduplicator<TDocument extends object> {
  constructor(
    private readonly options: OrbitDBDocumentDeduplicatorOptions<TDocument>,
  ) {}

  public deduplicate(documents: TDocument[]): TDocument[] {
    const deduplicated = new Map<string, TDocument>();
    const withoutId: TDocument[] = [];

    for (const document of documents) {
      const id = this.options.recordId(document);

      if (!id) {
        withoutId.push(document);

        continue;
      }

      const current = deduplicated.get(id);

      if (
        !current ||
        (this.options.shouldReplace?.(current, document) ?? true)
      ) {
        deduplicated.set(id, document);
      }
    }

    return [...withoutId, ...deduplicated.values()];
  }
}
