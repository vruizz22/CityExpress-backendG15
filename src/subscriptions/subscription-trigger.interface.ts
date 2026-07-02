import { Logger } from '@nestjs/common';

// RF01
export const SUBSCRIPTION_TRIGGER = 'SUBSCRIPTION_TRIGGER';

export interface SubscriptionTriggerInput {
  subscriptionId: string;
  periodSeconds: number;
  amount: number;
}

export interface SubscriptionTrigger {
  start(input: SubscriptionTriggerInput): Promise<string | null>;
}

// RF01
export class NoopSubscriptionTrigger implements SubscriptionTrigger {
  private readonly logger = new Logger('SubscriptionTrigger');

  start(input: SubscriptionTriggerInput): Promise<string | null> {
    this.logger.log(
      `[NOOP] start subscription=${input.subscriptionId} period=${input.periodSeconds}s amount=${input.amount}`,
    );
    return Promise.resolve(`noop:${input.subscriptionId}`);
  }
}
