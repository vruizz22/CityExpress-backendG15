import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { DistanceTableService, RoutingTables } from './distance-table.service';
import { CITY_ID } from '@/config/city.config';
import { ReceivedTableRepository } from '@/routing-calc/received-table.repository';

type RouteEdge = {
  code: string;
  distance: number;
  transportCost: number;
  enabled: boolean;
};

@Injectable()
export class RoutingOrchestratorService {
  private readonly logger = new Logger(RoutingOrchestratorService.name);

  private readonly jobMasterUrl =
    process.env.JOB_MASTER_URL || 'http://localhost:3001';

  constructor(
    @Inject(forwardRef(() => DistanceTableService))
    private readonly distanceTable: DistanceTableService,
    private readonly receivedTables: ReceivedTableRepository,
  ) {}

  // --- Debounce / anti-spam del recálculo (RNF01 / RNF03) ---
  // Agrupa ráfagas de cost-update en un solo recálculo y evita solapar jobs.
  private readonly debounceMs = Number(
    process.env.ROUTE_RECOMPUTE_DEBOUNCE_MS ?? 3000,
  );
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private recomputing = false;
  private rerunRequested = false;

  /**
   * Punto de entrada con debounce. Llamar ESTE (no `triggerRouteRecomputation`)
   * desde el flujo de mensajes: si llegan varias tablas seguidas, se agrupan en
   * un único recálculo cuando la ráfaga se calma (`debounceMs`).
   */
  scheduleRouteRecomputation(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.runRecomputation();
    }, this.debounceMs);
  }

  /**
   * Ejecuta el recálculo con guard de "uno a la vez": si ya hay uno en curso,
   * marca que debe repetirse al terminar (trailing) en vez de solapar jobs.
   */
  private async runRecomputation(): Promise<void> {
    if (this.recomputing) {
      this.rerunRequested = true;
      return;
    }
    this.recomputing = true;
    try {
      await this.triggerRouteRecomputation();
    } finally {
      this.recomputing = false;
      if (this.rerunRequested) {
        this.rerunRequested = false;
        this.scheduleRouteRecomputation();
      }
    }
  }

  async triggerRouteRecomputation(): Promise<void> {
    this.logger.log('Iniciando proceso de recalculo de rutas óptimas...');

    // 1. Construir el grafo COMPLETO (matriz de adyacencia) con la tabla propia
    //    + las tablas recibidas de todas las ciudades (RF06). Antes solo se
    //    enviaba un salto (graph[CITY_ID]) y el ruteo "óptimo" era directo.
    const graph = await this.buildFullGraph();

    // 2. Enviar el trabajo al microservicio (POST /job)
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

      // 4. Sondeo (Polling) hasta que el Worker termine en Redis. Se AWAITea: si
      //    no, `runRecomputation` libera el guard `recomputing` apenas se postea
      //    el job (no al terminar), permitiendo recálculos solapados que se
      //    pisan y acumulan trabajo/memoria. Con await, el guard cubre el ciclo.
      await this.pollJobResult(rawData.jobId);
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

  /**
   * Arma la matriz de adyacencia completa en el formato que espera el
   * jobs-service / Dijkstra de los workers: `Record<city, RouteEdge[]>`.
   * Combina la tabla propia (snapshot vigente) con las tablas recibidas de las
   * demás ciudades (RF06). Las ciudades que no respondieron simplemente no
   * tienen aristas → costo infinito (RNF03).
   */
  private async buildFullGraph(): Promise<Record<string, RouteEdge[]>> {
    const graph: Record<string, RouteEdge[]> = {};

    const toEdges = (
      distances: Record<
        string,
        {
          destinationCode: string;
          distance: number;
          transportCost: number;
          enabled: boolean;
        }
      >,
    ): RouteEdge[] =>
      Object.values(distances).map((entry) => ({
        code: entry.destinationCode,
        distance: entry.distance ?? 0,
        transportCost: entry.transportCost ?? 0,
        enabled: entry.enabled,
      }));

    const ensureNode = (code: string): void => {
      if (!graph[code]) graph[code] = [];
    };

    // 1. Tablas recibidas de otras ciudades (matriz multi-salto).
    const receivedTables = await this.receivedTables.getAllTables();
    for (const [city, distances] of Object.entries(receivedTables)) {
      ensureNode(city);
      const edges = toEdges(distances);
      graph[city] = edges;
      for (const edge of edges) ensureNode(edge.code);
    }

    // 2. Tabla propia (autoritativa para nuestra ciudad).
    const ownEdges = toEdges(this.distanceTable.getSnapshot());
    graph[CITY_ID] = ownEdges;
    for (const edge of ownEdges) ensureNode(edge.code);

    return graph;
  }
}
