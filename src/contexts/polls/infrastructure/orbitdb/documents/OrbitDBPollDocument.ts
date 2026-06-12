import { PollScopeTypeValue } from '../../../domain/value-objects/PollScopeType';
import { PollStatusValue } from '../../../domain/value-objects/PollStatus';

export interface OrbitDBPollDocument extends Record<string, unknown> {
  allowsMultipleVotes: boolean;
  createdAt: number;
  creatorIdentityId: string;
  expiresAt?: number;
  id: string;
  networkId: string;
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
  updatedAt?: number;
  votes: {
    createdAt: number;
    optionIds: string[];
    voterIdentityId: string;
  }[];
}
