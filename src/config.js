'use strict';

function parseBool(value, defaultValue) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on') {
    return true;
  }
  if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'off') {
    return false;
  }
  return defaultValue;
}

function parseIntWithDefault(value, defaultValue, minValue) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < minValue) {
    return defaultValue;
  }
  return n;
}

function normalizeBaseUrl(url) {
  if (!url) {
    return '';
  }
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function normalizeApiToken(token) {
  if (token === undefined || token === null) {
    return '';
  }
  return String(token).trim();
}

function loadConfig() {
  const port = parseIntWithDefault(process.env.PORT, 8080, 1);
  const scanIntervalSec = parseIntWithDefault(process.env.SCAN_INTERVAL_SEC, 30, 1);
  const topK = parseIntWithDefault(process.env.TOP_K, 30, 1);
  const dedupWindow = parseIntWithDefault(process.env.DEDUP_WINDOW, 20, 0);
  const rateLimitRps = parseIntWithDefault(process.env.RATE_LIMIT_RPS, 10, 0);
  const uaTrustMode = (process.env.UA_TRUST_MODE || 'auto').toLowerCase();
  const allowedUaTrustModes = new Set(['auto', 'always', 'never']);

  return {
    port,
    host: process.env.HOST || '0.0.0.0',
    apiToken: normalizeApiToken(process.env.API_TOKEN),
    wallpapersDir: process.env.WALLPAPERS_DIR || '/data/wallpapers',
    baseUrl: normalizeBaseUrl(process.env.BASE_URL || ''),
    scanIntervalSec,
    topK,
    dedupEnabled: parseBool(process.env.DEDUP_ENABLED, true),
    dedupWindow,
    rateLimitRps,
    uaTrustMode: allowedUaTrustModes.has(uaTrustMode) ? uaTrustMode : 'auto'
  };
}

module.exports = {
  loadConfig
};
