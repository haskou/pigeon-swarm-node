export type OrbitDBHeadIndexPutOptions<TDocument extends object> = {
  filter?(document: TDocument): boolean;
  networkIds?: string[];
};
