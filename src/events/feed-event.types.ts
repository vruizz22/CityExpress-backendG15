// RF04
export type FeedEventType =
  | 'package-created'
  | 'package-received'
  | 'package-redirected'
  | 'insurance-charged'
  | 'package-status';

// RF04
export interface FeedEvent {
  type: FeedEventType;
  timestamp: string;
  packageId?: string;
  status?: string;
  reason?: string;
  origin?: string;
  destination?: string;
  amount?: number;
  message?: string;
}

export type FeedEventInput = Omit<FeedEvent, 'timestamp'> & {
  timestamp?: string;
};
