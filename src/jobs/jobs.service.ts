import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);
  private readonly jobMasterUrl =
    process.env.JOB_MASTER_URL || 'http://localhost:3001';

  /**
   * Consulta el `/heartbeat` del servicio de jobs (job-master) con un timeout
   * corto. Devuelve `true` solo si responde 200 y no marca `status:false`.
   * Nunca lanza: ante caída/timeout/error devuelve `false`.
   */
  async isJobsServiceUp(timeoutMs = 2000): Promise<boolean> {
    try {
      const res = await fetch(`${this.jobMasterUrl}/heartbeat`, {
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        return false;
      }
      const body = (await res.json().catch(() => ({}))) as { status?: boolean };
      return body.status !== false;
    } catch (err) {
      this.logger.warn(
        `Jobs service heartbeat falló: ${(err as Error).message}`,
      );
      return false;
    }
  }
}
