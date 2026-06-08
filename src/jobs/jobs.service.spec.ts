import { JobsService } from './jobs.service';

describe('JobsService', () => {
  let service: JobsService;
  const fetchMock = jest.fn();

  beforeEach(() => {
    service = new JobsService();
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('true cuando el job-master responde 200 con status:true', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: true }),
    });
    await expect(service.isJobsServiceUp()).resolves.toBe(true);
  });

  it('false cuando responde no-ok (5xx/4xx)', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({}),
    });
    await expect(service.isJobsServiceUp()).resolves.toBe(false);
  });

  it('false cuando fetch lanza (caído/timeout)', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(service.isJobsServiceUp()).resolves.toBe(false);
  });
});
