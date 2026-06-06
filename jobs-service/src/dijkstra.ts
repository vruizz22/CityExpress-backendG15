
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


function reconstructPath(destination: string, previous: Record<string, string | null>): string[] {
  const path: string[] = [];
  let current: string | null = destination;
  
  while (current !== null) {
    path.unshift(current);
    current = previous[current] ?? null;
  }
  
  return path;
}


function calculatePathTotals(path: string[], graph: Graph): { totalDistance: number; totalCost: number } {
  let totalDistance = 0;
  let totalCost = 0;

  for (let i = 0; i < path.length - 1; i++) {
    const from = path[i];
    const to = path[i + 1];
    
    const edgesFrom = graph[from] || [];
    const stepEdge = edgesFrom.find((e: RouteEdge) => e.code === to);
    
    if (stepEdge) {
      totalDistance += stepEdge.distance;
      totalCost += stepEdge.transportCost;
    }
  }

  return { totalDistance, totalCost };
}

// --- 3. Helper para armar el resultado final ---
function buildDijkstraResults(
  graph: Graph,
  source: string,
  previous: Record<string, string | null>
): Record<string, DijkstraResult> {
  const result: Record<string, DijkstraResult> = {};
  
  for (const destination of Object.keys(graph)) {
    if (destination === source) continue;

    const path = reconstructPath(destination, previous);
    const isReachable = path[0] === source;

    if (isReachable) {
      const { totalDistance, totalCost } = calculatePathTotals(path, graph);
      result[destination] = {
        nextHop: path[1] ?? null,
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


export function runDijkstra(graph: Graph, source: string, metric: 'distance' | 'transportCost'): Record<string, DijkstraResult> {
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

    // Buscar el nodo más cercano
    for (const node of unvisited) {
      const currentDist = distances[node]; 
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
      const currentDist = distances[currentNode];
      const tentativeDistance = currentDist + edgeWeight;

      if (tentativeDistance < (distances[edge.code] ?? Infinity)) {
        distances[edge.code] = tentativeDistance;
        previous[edge.code] = currentNode;
      }
    }
  }

  
  return buildDijkstraResults(graph, source, previous);
}