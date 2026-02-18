'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { imageSize } = require('image-size');

const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

function isImageFile(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  return ALLOWED_EXTENSIONS.has(ext);
}

function roundRatio(ratio) {
  return Math.round(ratio * 100) / 100;
}

function ratioMode(photos) {
  if (!photos || photos.length === 0) {
    return null;
  }
  const counts = new Map();
  for (const photo of photos) {
    const key = roundRatio(photo.ratio).toFixed(2);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  let bestKey = null;
  let bestCount = -1;
  for (const [key, count] of counts) {
    if (count > bestCount) {
      bestCount = count;
      bestKey = key;
    }
  }
  return bestKey ? Number.parseFloat(bestKey) : null;
}

async function walkFiles(dir) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await walkFiles(fullPath);
      files.push(...nested);
      continue;
    }
    if (entry.isFile() && isImageFile(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

async function buildIndex(wallpapersDir) {
  const files = await walkFiles(wallpapersDir);
  const all = [];
  const byCategory = new Map();
  const portrait = [];
  const landscape = [];

  for (const absPath of files) {
    try {
      const size = await new Promise((resolve, reject) => {
        imageSize(absPath, (error, dimensions) => {
          if (error) {
            reject(error);
            return;
          }
          resolve(dimensions);
        });
      });
      const width = Number(size.width);
      const height = Number(size.height);
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        continue;
      }

      const relativeFsPath = path.relative(wallpapersDir, absPath);
      const relativeUrlPath = relativeFsPath.split(path.sep).map(encodeURIComponent).join('/');
      const firstSegment = relativeFsPath.split(path.sep)[0];
      const category = firstSegment && firstSegment !== relativeFsPath ? firstSegment : 'uncategorized';
      const ratio = width / height;
      const item = {
        id: relativeFsPath,
        absPath,
        relativeFsPath,
        relativeUrlPath,
        category,
        width,
        height,
        ratio
      };
      all.push(item);
      if (!byCategory.has(category)) {
        byCategory.set(category, []);
      }
      byCategory.get(category).push(item);
      if (ratio >= 1) {
        landscape.push(item);
      } else {
        portrait.push(item);
      }
    } catch (error) {
      // Skip files that cannot be parsed as image dimensions.
      continue;
    }
  }

  const dominantLandscapeRatio = ratioMode(landscape);
  const dominantPortraitRatio = ratioMode(portrait);
  const dominantAllRatio = ratioMode(all);

  return {
    generatedAt: new Date().toISOString(),
    totalCount: all.length,
    categories: Array.from(byCategory.keys()).sort(),
    all,
    byCategory,
    dominantLandscapeRatio,
    dominantPortraitRatio,
    dominantAllRatio
  };
}

module.exports = {
  buildIndex
};
