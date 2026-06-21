export class ContentDocument {
  public readonly contentType!: string;
  public readonly encrypted?: true;
  public readonly encryptedData?: string;
  public readonly filename?: string;
  public readonly size!: number;
  public readonly uploadedAt!: number;
  public readonly uploadedByIdentityId!: string;
}
