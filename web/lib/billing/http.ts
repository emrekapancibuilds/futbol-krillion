import 'server-only';
import { assertSameOrigin, HttpError, json, readBody } from './security.ts';
import { visitor, type Visitor } from './session.ts';

export function endpoint(fn: (req: Request, session: Visitor, body: Record<string, unknown>) => Promise<unknown>) {
  return async (req: Request) => {
    let session: Visitor | null = null;
    try {
      if (req.method !== 'GET') assertSameOrigin(req);
      const body = req.method === 'GET' ? {} : await readBody(req);
      session = await visitor(req);
      return json(await fn(req, session!, body), 200, session?.cookie);
    } catch (error) {
      if (!(error instanceof HttpError)) console.error('billing_request_failed', { name: error instanceof Error ? error.name : 'Unknown' });
      return json({ error: error instanceof HttpError ? error.message : 'Unable to complete this request. Please try again.' },
        error instanceof HttpError ? error.status : 503, session?.cookie);
    }
  };
}
