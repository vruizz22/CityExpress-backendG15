import { computeOptimalRoutes, Graph, RoutingTables } from './dijkstra';

interface ComputeEvent {
  graph: Graph;
  sourceNode: string;
}

/**
 * Worker serverless (RNF06).
 *
 * Recibe el grafo de ciudades y la ciudad de origen, corre Dijkstra
 * (reutiliza `dijkstra.ts`, el mismo algoritmo que usa el worker local) y
 * retorna las tablas de ruteo óptimas por distancia y por precio.
 *
 * La invoca el worker BullMQ del jobs-service vía AWS SDK Lambda
 * (InvocationType: 'RequestResponse'), por lo que el `event` es directamente
 * el payload `{ graph, sourceNode }` y el retorno es el resultado del cálculo.
 */
export const compute = async (event: ComputeEvent): Promise<RoutingTables> => {
  return computeOptimalRoutes(event.graph, event.sourceNode);
};
