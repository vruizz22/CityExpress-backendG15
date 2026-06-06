import { Injectable, Logger } from '@nestjs/common';
import { DistanceTableService, RoutingTables } from './distance-table.service';
import { CITY_ID } from '@/config/city.config';

@Injectable()
export class RoutingOrchestratorService {
  private readonly logger = new Logger(RoutingOrchestratorService.name);

  private readonly jobMasterUrl =
    process.env.JOB_MASTER_URL || 'http://localhost:3001';

  constructor(private readonly distanceTable: DistanceTableService) {}

  async triggerRouteRecomputation(): Promise<void> {
    this.logger.log('Iniciando proceso de recalculo de rutas óptimas...');

    // 1. Obtener el mapa de distancias crudas actual
    const snapshot = this.distanceTable.getSnapshot();

    // 2. Construir el Grafo en el formato que espera el microservicio (Zod Schema)

    const graph: Record<
      string,
      Record<string, { distance: number; price: number }>
    > = {};

    for (const entry of Object.values(snapshot)) {
      if (!entry.enabled) continue; // Ignoramos nodos deshabilitados

      // Aseguramos que el nodo origen exista en nuestro grafo simulado
      if (!graph[CITY_ID]) graph[CITY_ID] = {};

      // Creamos la conexión desde nuestra ciudad actual hacia el destino
      graph[CITY_ID][entry.destinationCode] = {
        distance: entry.distance ?? 0, 
        price: entry.transportCost ?? 0,
      };
    }

    // 3. Enviar el trabajo al microservicio (POST /job)
    try {
      const response = await fetch(`${this.jobMasterUrl}/job`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceNode: CITY_ID,
          graph: graph,
        }),
      });

      if (!response.ok) {
        throw new Error(
          `Microservicio respondió con status: ${response.status}`,
        );
      }

      const rawData = (await response.json()) as {
        jobId: string;
        status: string;
      };
      this.logger.log(
        `Trabajo encolado exitosamente en el Microservicio. Job ID: ${rawData.jobId}`,
      );

      // 4. Iniciar el Sondeo (Polling) para esperar a que el Worker termine en Redis
      this.pollJobResult(rawData.jobId);
    } catch (error) {
      this.logger.error(
        'Error al conectar con el microservicio de rutas:',
        error,
      );
    }
  }

  /**
   * Realiza consultas periódicas (Polling) hasta que el trabajo pase a estado 'completed'
   */
  private async pollJobResult(jobId: string): Promise<void> {
    const maxRetries = 10;
    const delayMs = 1000; // Esperar 1 segundo entre intentos

    for (let i = 0; i < maxRetries; i++) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));

      try {
        const response = await fetch(`${this.jobMasterUrl}/job/${jobId}`);
        if (!response.ok) continue;

        const jobData = (await response.json()) as {
          id: string;
          state: string;
          result: RoutingTables | null;
          error: string | null;
        };

        if (jobData.state === 'completed' && jobData.result) {
          this.logger.log(
            `¡Cálculo terminado por el Worker para el Job ${jobId}! Aplicando nuevas tablas...`,
          );

          // 5. Entregarle las tablas procesadas al DistanceTableService
          this.distanceTable.updateComputedRoutes(jobData.result);
          return; // Terminamos con éxito
        }

        if (jobData.state === 'failed') {
          this.logger.error(
            `El Job ${jobId} falló en el microservicio: ${jobData.error}`,
          );
          return;
        }

        this.logger.debug(
          `Job ${jobId} en estado: ${jobData.state}. Reintentando sondeo...`,
        );
      } catch (error) {
        this.logger.warn(
          `Error ${error} en el intento de sondeo ${i + 1} para el Job ${jobId}`,
        );
      }
    }

    this.logger.error(
      `Se alcanzó el límite de reintentos para obtener el resultado del Job ${jobId}`,
    );
  }
}
