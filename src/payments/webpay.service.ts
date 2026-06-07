import { Injectable } from '@nestjs/common';
import {
  WebpayPlus,
  IntegrationCommerceCodes,
  IntegrationApiKeys,
} from 'transbank-sdk';

export interface WebpayCreateResponse {
  token: string;
  url: string;
}

export interface WebpayCommitResponse {
  response_code?: number;
  status?: string;
  authorization_code?: string;
  transaction_date?: string;
  amount?: number;
  buy_order?: string;
  [key: string]: unknown;
}

@Injectable()
export class WebpayService {
  private buildTransaction() {
    const env = process.env.WEBPAY_ENVIRONMENT ?? 'integration';
    if (env === 'production') {
      return WebpayPlus.Transaction.buildForProduction(
        process.env.WEBPAY_COMMERCE_CODE as string,
        process.env.WEBPAY_API_KEY as string,
      );
    }
    return WebpayPlus.Transaction.buildForIntegration(
      process.env.WEBPAY_COMMERCE_CODE || IntegrationCommerceCodes.WEBPAY_PLUS,
      process.env.WEBPAY_API_KEY || IntegrationApiKeys.WEBPAY,
    );
  }

  async create(
    buyOrder: string,
    sessionId: string,
    amount: number,
    returnUrl: string,
  ): Promise<WebpayCreateResponse> {
    const tx = this.buildTransaction();
    const res = (await tx.create(
      buyOrder,
      sessionId,
      amount,
      returnUrl,
    )) as WebpayCreateResponse;
    return { token: res.token, url: res.url };
  }

  async commit(token: string): Promise<WebpayCommitResponse> {
    const tx = this.buildTransaction();
    return (await tx.commit(token)) as WebpayCommitResponse;
  }
}
