import { IPFSId } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSId';

export class ContentGetMessage {
  public readonly cid: IPFSId;

  constructor(cid: string) {
    this.cid = new IPFSId(cid);
  }
}
