import { DistanceTableEntry } from '@/messaging/message.types';
import { buildAdjacency, CityTables, pathTo, shortestPaths } from './dijkstra';

const entry = (
  dest: string,
  distance: number,
  transportCost: number,
  enabled = true,
): DistanceTableEntry => ({
  destinationCode: dest,
  destinationName: dest,
  distance,
  transportCost,
  enabled,
});

describe('dijkstra', () => {
  const tables: CityTables = {
    A: { B: entry('B', 10, 1), C: entry('C', 1, 100) },
    B: { D: entry('D', 1, 1) },
    C: { D: entry('D', 1, 1) },
    D: {},
  };

  it('encuentra la ruta más corta por distancia', () => {
    const adj = buildAdjacency(tables, 'distance');
    const paths = shortestPaths(adj, 'A');
    const d = pathTo(paths, 'D');
    expect(d.reachable).toBe(true);
    expect(d.path).toEqual(['A', 'C', 'D']);
    expect(d.cost).toBe(2);
    expect(d.hops).toBe(2);
    expect(d.nextHop).toBe('C');
  });

  it('encuentra la ruta más económica por precio', () => {
    const adj = buildAdjacency(tables, 'price');
    const paths = shortestPaths(adj, 'A');
    const d = pathTo(paths, 'D');
    expect(d.path).toEqual(['A', 'B', 'D']);
    expect(d.cost).toBe(2);
    expect(d.nextHop).toBe('B');
  });

  it('marca inalcanzable un destino sin ruta', () => {
    const adj = buildAdjacency(tables, 'distance');
    const paths = shortestPaths(adj, 'A');
    const z = pathTo(paths, 'Z');
    expect(z.reachable).toBe(false);
    expect(z.cost).toBe(Infinity);
  });

  it('ignora aristas con enabled=false (costo infinito)', () => {
    const disabled: CityTables = {
      A: { B: entry('B', 5, 5, false) },
      B: {},
    };
    const adj = buildAdjacency(disabled, 'distance');
    const paths = shortestPaths(adj, 'A');
    expect(pathTo(paths, 'B').reachable).toBe(false);
  });
});
