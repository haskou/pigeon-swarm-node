export type OrbitDBHeadIndexPutOptions<TDocument extends object> = {
  filter?(document: TDocument): boolean;
  networkIds?: string[];
  recordFilter?(record: Record<string, unknown>): boolean;
  replace?: boolean;
};
