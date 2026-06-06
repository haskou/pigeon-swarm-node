import { PollScope } from '@app/contexts/polls/domain/PollScope';

export type PollScopeAccess = {
  recipients: {
    memberIds?: string[];
    participantIds?: string[];
  };
  scope: PollScope;
};
