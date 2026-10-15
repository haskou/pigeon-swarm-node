export interface LocalNodeBlockPublicationDocument extends Record<
  string,
  unknown
> {
  _id: 'local';
  published: boolean;
}
