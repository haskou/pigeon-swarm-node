export interface LocalNodeRegistrationCodeDocument extends Record<
  string,
  unknown
> {
  _id: string;
  expiresAt: number;
  hash: string;
  maxUses: number;
  usesLeft: number;
}
