import { Injectable, Logger } from '@nestjs/common';
import {
  SFNClient,
  StartExecutionCommand,
  ExecutionAlreadyExists,
} from '@aws-sdk/client-sfn';
import {
  SubscriptionTrigger,
  SubscriptionTriggerInput,
} from './subscription-trigger.interface';

// RF01
/**
 * Trigger real de Step Functions (reemplaza al NoopSubscriptionTrigger).
 *
 * Arranca una ejecución de la state machine de suscripciones —una por
 * suscripción, idempotente vía `name`— con el input que la máquina espera
 * (`{ subscriptionId, periodSeconds, amount }`). El ARN llega por env
 * `SUBSCRIPTIONS_STATE_MACHINE_ARN` (lo inyecta el deploy / infra Terraform).
 * Devuelve el `executionArn` para que el service lo guarde en `sfnExecutionArn`.
 */
@Injectable()
export class SfnSubscriptionTrigger implements SubscriptionTrigger {
  private readonly logger = new Logger('SubscriptionTrigger');
  private readonly sfn = new SFNClient({
    region: process.env.AWS_REGION ?? 'us-east-1',
  });

  async start(input: SubscriptionTriggerInput): Promise<string | null> {
    const stateMachineArn = process.env.SUBSCRIPTIONS_STATE_MACHINE_ARN;
    if (!stateMachineArn) {
      throw new Error('SUBSCRIPTIONS_STATE_MACHINE_ARN no está definido');
    }

    try {
      const res = await this.sfn.send(
        new StartExecutionCommand({
          stateMachineArn,
          name: input.subscriptionId, // idempotente: 1 execution por suscripción
          input: JSON.stringify({
            subscriptionId: input.subscriptionId,
            periodSeconds: input.periodSeconds,
            amount: input.amount,
          }),
        }),
      );
      this.logger.log(
        `start subscription=${input.subscriptionId} → ${res.executionArn}`,
      );
      return res.executionArn ?? null;
    } catch (err) {
      // Ya existe una ejecución con ese nombre (reintento/duplicado): mantenemos
      // la idempotencia (1 execution por suscripción) sin re-arrancar ni romper.
      if (err instanceof ExecutionAlreadyExists) {
        this.logger.warn(
          `start subscription=${input.subscriptionId}: ya tenía una ejecución activa (idempotente)`,
        );
        return null;
      }
      throw err;
    }
  }
}
