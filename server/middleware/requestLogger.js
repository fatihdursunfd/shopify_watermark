import crypto from 'crypto';

/**
 * Lightweight Request Logger
 * Logs incoming requests and response status if DEBUG_AUTH=1
 */
export function requestLogger() {
  const enabled = process.env.DEBUG_AUTH === '1';

  return function (req, res, next) {
    if (!enabled) return next();

    const requestId = crypto.randomUUID();
    const started = Date.now();
    const shop = req.query?.shop || req.body?.shop || null;

    // Log Request Start
    console.log(JSON.stringify({
      ts: new Date().toISOString(),
      level: 'info',
      stage: 'req_start',
      requestId,
      method: req.method,
      path: req.path,
      shop,
      hasAuthHeader: !!req.headers['authorization']
    }));

    res.locals.__requestId = requestId;

    // Log Response End
    const origEnd = res.end;
    res.end = function (...args) {
      const duration = Date.now() - started;
      console.log(JSON.stringify({
        ts: new Date().toISOString(),
        level: 'info',
        stage: 'req_end',
        requestId,
        status: res.statusCode,
        duration,
        shop // Log shop again to correlate easily
      }));
      return origEnd.apply(this, args);
    };

    next();
  };
}

/**
 * Diagnostic helper to log session details
 */
export function logSessionCheck(stage, req, extra = {}) {
  if (process.env.DEBUG_AUTH !== '1') return;

  const requestId = req?.res?.locals?.__requestId || 'orphan';
  const session = req?.res?.locals?.shopify?.session || null;

  console.log(JSON.stringify({
    ts: new Date().toISOString(),
    level: 'info',
    stage,
    requestId,
    path: req?.path,
    shop: session?.shop || req?.query?.shop || null,
    sessionFound: !!session,
    ...extra
  }));
}