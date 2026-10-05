export interface PollVoteRecord {
  createdAt: number;
  optionIds: string[];
  pollId: string;
  voterIdentityId: string;
}
