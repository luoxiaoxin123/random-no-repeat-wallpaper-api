'use strict';

const crypto = require('node:crypto');

function safeEqual(a, b) {
  const left = Buffer.from(a || '', 'utf8');
  const right = Buffer.from(b || '', 'utf8');
  if (left.length !== right.length) {
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

function extractBearerToken(headerValue) {
  if (!headerValue) {
    return '';
  }
  const match = String(headerValue).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function authPreHandler(apiToken) {
  return async function onRequest(request, reply) {
    if (!apiToken) {
      return;
    }
    const token = extractBearerToken(request.headers.authorization);
    if (!safeEqual(token, apiToken)) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
  };
}

module.exports = {
  authPreHandler
};
