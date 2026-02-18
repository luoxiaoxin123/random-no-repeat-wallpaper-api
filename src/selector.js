'use strict';

function parsePositiveNumber(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    return null;
  }
  return n;
}

function parseAspect(value) {
  if (!value) {
    return null;
  }
  const str = String(value).trim();
  if (!str) {
    return null;
  }

  if (str.includes(':')) {
    const [a, b] = str.split(':').map((part) => Number(part.trim()));
    if (Number.isFinite(a) && Number.isFinite(b) && a > 0 && b > 0) {
      return a / b;
    }
    return null;
  }

  const n = Number(str);
  if (!Number.isFinite(n) || n <= 0) {
    return null;
  }
  return n;
}

function classifyUa(ua) {
  if (!ua) {
    return 'unknown';
  }
  const text = ua.toLowerCase();
  if (/ipad|tablet/.test(text)) {
    return 'tablet';
  }
  if (/mobile|android|iphone/.test(text)) {
    return 'mobile';
  }
  return 'desktop';
}

function resolveTargetRatio({ query, userAgent, index, uaTrustMode }) {
  const width = parsePositiveNumber(query.width);
  const height = parsePositiveNumber(query.height);
  if (width && height) {
    return {
      targetRatio: width / height,
      source: 'width_height',
      deviceHint: null
    };
  }

  const aspect = parseAspect(query.aspect);
  if (aspect) {
    return {
      targetRatio: aspect,
      source: 'aspect',
      deviceHint: null
    };
  }

  const canUseUa = uaTrustMode !== 'never';
  const deviceHint = canUseUa ? classifyUa(userAgent) : 'unknown';
  if (deviceHint === 'mobile' && index.dominantPortraitRatio) {
    return {
      targetRatio: index.dominantPortraitRatio,
      source: 'ua_mobile',
      deviceHint
    };
  }
  if ((deviceHint === 'desktop' || deviceHint === 'tablet') && index.dominantLandscapeRatio) {
    return {
      targetRatio: index.dominantLandscapeRatio,
      source: 'ua_desktop',
      deviceHint
    };
  }

  if (index.dominantLandscapeRatio) {
    return {
      targetRatio: index.dominantLandscapeRatio,
      source: 'desktop_fallback',
      deviceHint
    };
  }

  if (index.dominantAllRatio) {
    return {
      targetRatio: index.dominantAllRatio,
      source: 'all_fallback',
      deviceHint
    };
  }

  return {
    targetRatio: null,
    source: 'none',
    deviceHint
  };
}

function scoreByRatio(itemRatio, targetRatio) {
  if (!targetRatio || !itemRatio) {
    return 0;
  }
  return Math.abs(Math.log(itemRatio) - Math.log(targetRatio));
}

function randomPick(arr) {
  if (!arr || arr.length === 0) {
    return null;
  }
  const idx = Math.floor(Math.random() * arr.length);
  return arr[idx];
}

function pickWallpaper({
  index,
  query,
  userAgent,
  dedupEnabled,
  dedupWindow,
  topK,
  dedupStore,
  dedupKey,
  uaTrustMode
}) {
  if (!index || !index.all || index.all.length === 0) {
    return { item: null, meta: { reason: 'empty_index' } };
  }

  const category = query.category ? String(query.category) : '';
  const sourcePool = category ? (index.byCategory.get(category) || []) : index.all;
  if (sourcePool.length === 0) {
    return { item: null, meta: { reason: 'no_category_match', category } };
  }

  const ratioDecision = resolveTargetRatio({
    query,
    userAgent,
    index,
    uaTrustMode
  });

  const sorted = ratioDecision.targetRatio
    ? [...sourcePool].sort((a, b) => scoreByRatio(a.ratio, ratioDecision.targetRatio) - scoreByRatio(b.ratio, ratioDecision.targetRatio))
    : [...sourcePool];

  if (!ratioDecision.targetRatio) {
    for (let i = sorted.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
    }
  }

  const effectiveTopK = Math.max(1, topK);
  const expansions = [1, 2, 4, 9999];
  const history = dedupEnabled && dedupKey ? (dedupStore.get(dedupKey) || []) : [];

  for (const multiplier of expansions) {
    const cap = multiplier === 9999 ? sorted.length : Math.min(sorted.length, effectiveTopK * multiplier);
    const candidates = sorted.slice(0, cap);
    if (candidates.length === 0) {
      continue;
    }

    if (!dedupEnabled || !dedupKey || dedupWindow <= 0) {
      const item = randomPick(candidates);
      return {
        item,
        meta: {
          ratioSource: ratioDecision.source,
          targetRatio: ratioDecision.targetRatio,
          poolSize: candidates.length,
          dedupApplied: false
        }
      };
    }

    const dedupWindows = [dedupWindow, Math.floor(dedupWindow / 2), 0];
    for (const win of dedupWindows) {
      const recent = new Set(history.slice(-win));
      const filtered = candidates.filter((it) => !recent.has(it.id));
      if (filtered.length > 0) {
        const item = randomPick(filtered);
        return {
          item,
          meta: {
            ratioSource: ratioDecision.source,
            targetRatio: ratioDecision.targetRatio,
            poolSize: filtered.length,
            dedupApplied: true,
            dedupWindowUsed: win
          }
        };
      }
    }
  }

  return { item: null, meta: { reason: 'no_candidate' } };
}

function updateDedupHistory(dedupStore, dedupKey, itemId, maxWindow) {
  if (!dedupKey || !itemId || maxWindow <= 0) {
    return;
  }
  const history = dedupStore.get(dedupKey) || [];
  history.push(itemId);
  const hardLimit = Math.max(maxWindow * 3, maxWindow + 10);
  while (history.length > hardLimit) {
    history.shift();
  }
  dedupStore.set(dedupKey, history);
}

module.exports = {
  parseAspect,
  classifyUa,
  pickWallpaper,
  updateDedupHistory
};
