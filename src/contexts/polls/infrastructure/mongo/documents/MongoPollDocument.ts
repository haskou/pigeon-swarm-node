import { PollScopeTypeValue } from '../../../domain/value-objects/PollScopeType';
import { PollStatusValue } from '../../../domain/value-objects/PollStatus';

export interface MongoPollDocument {
  _id: string;
  allowsMultipleVotes: boolean;
  createdAt: number;
  creatorIdentityId: string;
  expiresAt?: number;
  options: {
    id: string;
    text: string;
  }[];
  question: string;
  scope: {
    channelId: string | undefined;
    communityId: string | undefined;
    conversationId: string | undefined;
    networkId: string;
    type: PollScopeTypeValue;
  };
  status: PollStatusValue;
  votes: {
    createdAt: number;
    optionIds: string[];
    voterIdentityId: string;
  }[];
}
