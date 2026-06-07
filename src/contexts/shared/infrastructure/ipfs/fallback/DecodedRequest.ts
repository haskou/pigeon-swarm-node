import { IPFSNetwork } from '../networks/IPFSNetwork';
import { ContentRequest } from './ContentRequest';

export type DecodedRequest = {
  network: IPFSNetwork;
  request: ContentRequest;
};
