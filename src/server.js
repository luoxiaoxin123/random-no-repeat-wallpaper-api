'use strict';

const path = require('node:path');
const fastifyStatic = require('@fastify/static');
const Fastify = require('fastify');
const { loadConfig } = require('./config');
const { buildIndex } = require('./indexer');
const { authPreHandler } = require('./auth');
const { pickWallpaper, updateDedupHistory } = require('./selector');

function resolveClientIp(request) {
  const xff = request.headers['x-forwarded-for'];
  if (xff && typeof xff === 'string') {
    return xff.split(',')[0].trim();
  }
  return request.ip || '';
}


function buildRateLimitPreHandler(rateLimitRps) {
  if (!rateLimitRps || rateLimitRps <= 0) {
    return async function noRateLimit() {};
  }

  const buckets = new Map();

  return async function rateLimitPreHandler(request, reply) {
    const key = resolveClientIp(request) || 'unknown';
    const nowSec = Math.floor(Date.now() / 1000);
    const current = buckets.get(key);

    if (!current || current.windowSec !== nowSec) {
      buckets.set(key, { windowSec: nowSec, count: 1 });
      return;
    }

    if (current.count >= rateLimitRps) {
      return reply.code(429).send({
        error: 'too_many_requests',
        limitPerSecond: rateLimitRps
      });
    }

    current.count += 1;
  };
}

function buildPublicUrl(baseUrl, relativeUrlPath) {
  const safePath = relativeUrlPath.startsWith('/') ? relativeUrlPath.slice(1) : relativeUrlPath;
  if (baseUrl) {
    return `${baseUrl}/assets/${safePath}`;
  }
  return `/assets/${safePath}`;
}

async function start() {
  const config = loadConfig();
  const app = Fastify({
    logger: {
      level: 'info'
    },
    trustProxy: true
  });

  await app.register(fastifyStatic, {
    root: path.resolve(config.wallpapersDir),
    prefix: '/assets/',
    wildcard: false,
    decorateReply: false
  });

  let index = await buildIndex(config.wallpapersDir);
  const dedupStore = new Map();
  const rateLimitPreHandler = buildRateLimitPreHandler(config.rateLimitRps);

  app.log.info({
    wallpapersDir: config.wallpapersDir,
    totalCount: index.totalCount,
    categories: index.categories.length
  }, 'wallpaper index loaded');

  const refreshTimer = setInterval(async () => {
    try {
      const next = await buildIndex(config.wallpapersDir);
      index = next;
      app.log.info({ totalCount: next.totalCount, categories: next.categories.length }, 'wallpaper index refreshed');
    } catch (error) {
      app.log.error({ err: error }, 'failed to refresh wallpaper index');
    }
  }, config.scanIntervalSec * 1000);

  app.addHook('onClose', async () => {
    clearInterval(refreshTimer);
  });

  app.get('/api/health', async () => {
    return {
      ok: true,
      generatedAt: index.generatedAt,
      totalCount: index.totalCount,
      categories: index.categories,
      dedup: {
        enabled: config.dedupEnabled,
        window: config.dedupWindow,
        keysInMemory: dedupStore.size
      },
      security: {
        rateLimitRps: config.rateLimitRps,
        authEnabled: Boolean(config.apiToken)
      },
      matching: {
        topK: config.topK,
        uaTrustMode: config.uaTrustMode,
        dominantLandscapeRatio: index.dominantLandscapeRatio,
        dominantPortraitRatio: index.dominantPortraitRatio,
        dominantAllRatio: index.dominantAllRatio
      }
    };
  });

  app.get('/api/wallpaper', {
    preHandler: [authPreHandler(config.apiToken), rateLimitPreHandler]
  }, async (request, reply) => {
    const clientIdRaw = request.query.client_id ? String(request.query.client_id).trim() : '';
    const dedupKey = clientIdRaw || resolveClientIp(request);
    const result = pickWallpaper({
      index,
      query: request.query || {},
      userAgent: request.headers['user-agent'],
      dedupEnabled: config.dedupEnabled,
      dedupWindow: config.dedupWindow,
      topK: config.topK,
      dedupStore,
      dedupKey,
      uaTrustMode: config.uaTrustMode
    });

    if (!result.item) {
      return reply.code(404).send({
        error: 'no_wallpaper_found',
        detail: result.meta
      });
    }

    if (config.dedupEnabled && config.dedupWindow > 0 && dedupKey) {
      updateDedupHistory(dedupStore, dedupKey, result.item.id, config.dedupWindow);
    }

    const location = buildPublicUrl(config.baseUrl, result.item.relativeUrlPath);
    app.log.info({
      category: request.query.category || '',
      clientId: clientIdRaw || null,
      ip: resolveClientIp(request),
      selected: result.item.id,
      ratioSource: result.meta.ratioSource || null,
      dedupApplied: Boolean(result.meta.dedupApplied)
    }, 'wallpaper selected');

    return reply.redirect(302, location);
  });

  await app.listen({ host: config.host, port: config.port });
  app.log.info({ host: config.host, port: config.port }, 'wallpaper api started');
}

start().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
