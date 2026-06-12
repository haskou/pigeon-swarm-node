import { PollScope } from '../../../domain/PollScope';

export type PollScopeAccess = {
  recipients: {
    memberIds?: string[];
    participantIds?: string[];
  };
  scope: PollScope;
};
