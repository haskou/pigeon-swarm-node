import { IpfsIdentityDocument } from '../../ipfs/documents/IpfsIdentityDocument';

export interface MongoIdentityMetadataDocument {
  _id: string;
  identityId: string;
  cid: string;
  handle?: string;
  identity?: IpfsIdentityDocument;
  networkIds?: string[];
  version: number;
  previousCid: string | undefined;
  receivedAt: number;
}
