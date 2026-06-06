
export interface RouteEdge {
  code: string;
  distance: number;
  transportCost: number;
  enabled: boolean;
}

export type Graph = Record<string, RouteEdge[]>;

export interface DijkstraResult {
  nextHop: string | null;
  totalDistance: number;
  totalCost: number;
  path: string[];
}

export interface RoutingTables {
  byDistance: Record<string, DijkstraResult>;
  byPrice: Record<string, DijkstraResult>;
}

export function computeOptimalRoutes(graph: Graph, sourceNode: string): RoutingTables {
  const cities = Object.keys(graph);
  
  if (!cities.includes(sourceNode)) {
    return { byDistance: {}, byPrice: {} };
  }

  return {
    byDistance: runDijkstra(graph, sourceNode, 'distance'),
    byPrice: runDijkstra(graph, sourceNode, 'transportCost'),
  };
}

function runDijkstra(graph: Graph, source: string, metric: 'distance' | 'transportCost'): Record<string, DijkstraResult> {
  const distances: Record<string, number> = {};
  const previous: Record<string, string | null> = {};
  const unvisited = new Set<string>();

  // Inicialización
  for (const city of Object.keys(graph)) {
    distances[city] = city === source ? 0 : Infinity;
    previous[city] = null;
    unvisited.add(city);
  }

  while (unvisited.size > 0) {
    let currentNode: string | null = null;
    let minDistance = Infinity;

    for (const node of unvisited) {
      // Usamos "!" porque sabemos con certeza que inicializamos todas las llaves arriba
      const currentDist = distances[node]!; 
      if (currentDist < minDistance) {
        minDistance = currentDist;
        currentNode = node;
      }
    }

    if (currentNode === null) break;

    unvisited.delete(currentNode);

    const neighbors = graph[currentNode] || [];
    for (const edge of neighbors) {
      if (!edge.enabled || !unvisited.has(edge.code)) continue;

      const edgeWeight = edge[metric];
      const currentDist = distances[currentNode]!;
      const tentativeDistance = currentDist + edgeWeight;

      // Comprobamos contra el valor actual o Infinity si por alguna razón no existe
      if (tentativeDistance < (distances[edge.code] ?? Infinity)) {
        distances[edge.code] = tentativeDistance;
        previous[edge.code] = currentNode;
      }
    }
  }

  const result: Record<string, DijkstraResult> = {};
  
  for (const destination of Object.keys(graph)) {
    if (destination === source) continue;

    const path: string[] = [];
    let current: string | null = destination;

    while (current !== null) {
      path.unshift(current);
      current = previous[current] ?? null; // Manejo seguro de undefined
    }

    const isReachable = path[0] === source;

    if (isReachable) {
      let totalDistance = 0;
      let totalCost = 0;
      for (let i = 0; i < path.length - 1; i++) {
        const from = path[i]!;
        const to = path[i+1];
        
        const edgesFrom = graph[from] || [];
        // Tipado explícito de 'e' para resolver el ts(7006)
        const stepEdge = edgesFrom.find((e: RouteEdge) => e.code === to);
        
        if (stepEdge) {
          totalDistance += stepEdge.distance;
          totalCost += stepEdge.transportCost;
        }
      }

      result[destination] = {
        nextHop: path[1] ?? null, // Manejo seguro para strings (ts(2322))
        totalDistance,
        totalCost,
        path,
      };
    } else {
      result[destination] = {
        nextHop: null,
        totalDistance: Infinity,
        totalCost: Infinity,
        path: [],
      };
    }
  }

  return result;
}