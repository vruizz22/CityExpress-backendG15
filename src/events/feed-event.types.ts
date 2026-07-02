// RF04
export type FeedEventType =
  | 'package-created'
  | 'package-received'
  | 'package-redirected'
  | 'insurance-charged';

// RF04
export interface FeedEvent {
  type: FeedEventType;
  at: string;
  packageId?: string;
  cityId?: string;
  message?: string;
  data?: Record<string, unknown>;
}

export type FeedEventInput = Omit<FeedEvent, 'at'> & { at?: string };
