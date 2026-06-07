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

    // 2. Construir el grafo en el formato que espera el microservicio:
    //    Record<ciudad, RouteEdge[]> con RouteEdge = {code, distance, transportCost, enabled}.
    //    (Antes mandaba {distance, price} anidado y el master lo rechazaba con 400 — bug del merge #21.)
    type RouteEdge = {
      code: string;
      distance: number;
      transportCost: number;
      enabled: boolean;
    };
    const graph: Record<string, RouteEdge[]> = {};

    const ownEdges: RouteEdge[] = [];
    for (const entry of Object.values(snapshot)) {
      ownEdges.push({
        code: entry.destinationCode,
        distance: entry.distance ?? 0,
        transportCost: entry.transportCost ?? 0,
        enabled: entry.enabled,
      });
      // Cada destino debe existir como nodo del grafo para que Dijkstra le calcule
      // distancia (aunque hoy solo conozcamos las aristas de nuestra propia ciudad).
      if (!graph[entry.destinationCode]) graph[entry.destinationCode] = [];
    }
    graph[CITY_ID] = ownEdges;

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
      void this.pollJobResult(rawData.jobId);
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
