import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ClientOptions } from '../types';
import { Workflow } from './workflow';

const createJsonResponse = (data: any) => ({ ok: true, json: async () => data });

describe('Workflow (fetch-mocked)', () => {
  let fetchMock: any;
  let wf: Workflow;

  beforeEach(() => {
    fetchMock = vi.fn((input: any) => {
      const url = String(input);
      if (url.includes('/create-run')) return Promise.resolve(createJsonResponse({ runId: 'r-123' }));
      if (url.includes('/start?runId=')) return Promise.resolve(createJsonResponse({ message: 'started' }));
      if (url.includes('/start-async')) return Promise.resolve(createJsonResponse({ result: 'started-async' }));
      if (url.includes('/resume?runId=')) return Promise.resolve(createJsonResponse({ message: 'resumed' }));
      if (url.includes('/resume-async')) return Promise.resolve(createJsonResponse({ result: 'resumed-async' }));
      if (url.includes('/watch?')) {
        const body = Workflow.createRecordStream([
          { type: 'transition', payload: { step: 's1' } },
          { type: 'transition', payload: { step: 's2' } },
        ]);
        return Promise.resolve(new Response(body as unknown as ReadableStream, { status: 200 }));
      }
      if (url.includes('/stream?')) {
        const body = Workflow.createRecordStream([
          { type: 'log', payload: { msg: 'hello' } },
          { type: 'result', payload: { ok: true } },
        ]);
        return Promise.resolve(new Response(body as unknown as ReadableStream, { status: 200 }));
      }
      return Promise.reject(new Error(`Unhandled fetch to ${url}`));
    });
    globalThis.fetch = fetchMock as any;

    const options: ClientOptions = { baseUrl: 'http://localhost', retries: 0 } as any;
    wf = new Workflow(options, 'wf-1');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns runId when creating new run', async () => {
    const run = await wf.createRunAsync();
    expect(run.runId).toBe('r-123');
  });

  it('starts workflow run synchronously', async () => {
    const run = await wf.createRunAsync();
    const startRes = await run.start({ inputData: { a: 1 } });
    expect(startRes).toEqual({ message: 'started' });
  });

  it('starts workflow run asynchronously', async () => {
    const run = await wf.createRunAsync();
    const startAsyncRes = await run.startAsync({ inputData: { a: 1 } });
    expect(startAsyncRes).toEqual({ result: 'started-async' });
  });

  it('resumes workflow run synchronously', async () => {
    const run = await wf.createRunAsync();
    const resumeRes = await run.resume({ step: 's1' });
    expect(resumeRes).toEqual({ message: 'resumed' });
  });

  it('resumes workflow run asynchronously', async () => {
    const run = await wf.createRunAsync();
    const resumeAsyncRes = await run.resumeAsync({ step: 's1' });
    expect(resumeAsyncRes).toEqual({ result: 'resumed-async' });
  });

  it('watches workflow transitions and yields parsed records', async () => {
    const run = await wf.createRunAsync();
    const seen: any[] = [];
    await run.watch(rec => {
      seen.push(rec);
    });
    expect(seen).toEqual([
      { type: 'transition', payload: { step: 's1' } },
      { type: 'transition', payload: { step: 's2' } },
    ]);
  });

  it('streams workflow execution as parsed objects', async () => {
    const run = await wf.createRunAsync();
    const stream = await run.stream({ inputData: { x: 1 } });
    const reader = (stream as ReadableStream<any>).getReader();
    const records: any[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      records.push(value);
    }
    expect(records).toEqual([
      { type: 'log', payload: { msg: 'hello' } },
      { type: 'result', payload: { ok: true } },
    ]);
  });

  it('start uses provided runId', async () => {
    const res = await wf.start({ runId: 'r-x', inputData: { b: 2 } });
    expect(res).toEqual({ message: 'started' });
  });
});
