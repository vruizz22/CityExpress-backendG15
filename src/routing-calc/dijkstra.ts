import { DistanceTableEntry } from '@/messaging/message.types';

export type Criteria = 'distance' | 'price';

export interface ShortestPath {
  cost: number;
  hops: number;
  path: string[];
  nextHop: string | null;
  reachable: boolean;
}

export type CityTables = Record<string, Record<string, DistanceTableEntry>>;

const weightOf = (entry: DistanceTableEntry, criteria: Criteria): number =>
  criteria === 'price' ? entry.transportCost : entry.distance;

export function buildAdjacency(
  tables: CityTables,
  criteria: Criteria,
): Map<string, Map<string, number>> {
  const adjacency = new Map<string, Map<string, number>>();
  for (const [source, dests] of Object.entries(tables)) {
    const edges = new Map<string, number>();
    for (const [dest, entry] of Object.entries(dests)) {
      if (!entry.enabled || dest === source) continue;
      const w = weightOf(entry, criteria);
      if (!Number.isFinite(w) || w < 0) continue;
      edges.set(dest, w);
    }
    adjacency.set(source, edges);
  }
  return adjacency;
}

export function shortestPaths(
  adjacency: Map<string, Map<string, number>>,
  source: string,
): Record<string, ShortestPath> {
  const dist = new Map<string, number>();
  const prev = new Map<string, string>();
  const visited = new Set<string>();
  dist.set(source, 0);

  while (true) {
    let u: string | null = null;
    let best = Infinity;
    for (const [node, d] of dist) {
      if (!visited.has(node) && d < best) {
        best = d;
        u = node;
      }
    }
    if (u === null) break;
    visited.add(u);

    const edges = adjacency.get(u);
    if (!edges) continue;
    for (const [v, w] of edges) {
      const alt = best + w;
      if (alt < (dist.get(v) ?? Infinity)) {
        dist.set(v, alt);
        prev.set(v, u);
      }
    }
  }

  const result: Record<string, ShortestPath> = {};
  for (const [node, cost] of dist) {
    if (node === source) continue;
    const path: string[] = [];
    let cur: string | undefined = node;
    while (cur !== undefined) {
      path.unshift(cur);
      cur = prev.get(cur);
    }
    result[node] = {
      cost,
      hops: path.length - 1,
      path,
      nextHop: path.length > 1 ? path[1] : null,
      reachable: true,
    };
  }
  return result;
}

export function pathTo(
  paths: Record<string, ShortestPath>,
  destination: string,
): ShortestPath {
  return (
    paths[destination] ?? {
      cost: Infinity,
      hops: 0,
      path: [],
      nextHop: null,
      reachable: false,
    }
  );
}
