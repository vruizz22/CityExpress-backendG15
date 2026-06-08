import { RoutingOrchestratorService } from './routing-orchestrator.service';
import { DistanceTableService } from './distance-table.service';
import { ReceivedTableRepository } from '@/routing-calc/received-table.repository';

const flush = () => Promise.resolve();

describe('RoutingOrchestratorService - debounce', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  function build() {
    const distanceTable = {
      getSnapshot: jest.fn().mockReturnValue({}),
    } as unknown as DistanceTableService;
    const receivedTables = {
      getAllTables: jest.fn().mockResolvedValue({}),
    } as unknown as ReceivedTableRepository;
    const orchestrator = new RoutingOrchestratorService(
      distanceTable,
      receivedTables,
    );
    const triggerSpy = jest
      .spyOn(orchestrator, 'triggerRouteRecomputation')
      .mockResolvedValue(undefined);
    return { orchestrator, triggerSpy };
  }

  it('agrupa una ráfaga de schedules en un solo recálculo', async () => {
    const { orchestrator, triggerSpy } = build();

    orchestrator.scheduleRouteRecomputation();
    orchestrator.scheduleRouteRecomputation();
    orchestrator.scheduleRouteRecomputation();
    // Aún dentro de la ventana de debounce: no recalcula todavía.
    expect(triggerSpy).not.toHaveBeenCalled();

    jest.runOnlyPendingTimers();
    await flush();

    expect(triggerSpy).toHaveBeenCalledTimes(1);
  });

  it('ráfagas separadas en el tiempo recalculan una vez cada una', async () => {
    const { orchestrator, triggerSpy } = build();

    orchestrator.scheduleRouteRecomputation();
    jest.runOnlyPendingTimers();
    await flush();
    await flush();
    expect(triggerSpy).toHaveBeenCalledTimes(1);

    orchestrator.scheduleRouteRecomputation();
    jest.runOnlyPendingTimers();
    await flush();
    expect(triggerSpy).toHaveBeenCalledTimes(2);
  });
});
