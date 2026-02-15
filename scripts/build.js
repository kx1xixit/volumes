#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SRC_DIR = path.join(__dirname, '../src');
const BUILD_DIR = path.join(__dirname, '../build');
const OUTPUT_FILE = path.join(BUILD_DIR, 'extension.js');
const OUTPUT_MIN_FILE = path.join(BUILD_DIR, 'min.extension.js');
const OUTPUT_MAX_FILE = path.join(BUILD_DIR, 'pretty.extension.js');

// --- Build State Guard ---
let isBuilding = false;
let pendingBuild = false;

// Create build directory if it doesn't exist
if (!fs.existsSync(BUILD_DIR)) {
  fs.mkdirSync(BUILD_DIR, { recursive: true });
}

/**
 * Read manifest file if it exists
 */
function getManifest() {
  const manifestPath = path.join(SRC_DIR, 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    try {
      return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch (err) {
      console.warn('Warning: Could not parse manifest.json');
      return {};
    }
  }
  return {};
}

/**
 * Generate Scratch extension header
 */
function generateHeader(manifest) {
  const metadata = {
    name: manifest.name || 'My Extension',
    id: manifest.id || 'myExtension',
    description: manifest.description || 'A TurboWarp extension',
    by: manifest.author || 'Anonymous',
    version: manifest.version || '1.0.0',
    license: manifest.license || 'MIT',
  };

  let header = '';
  header += `// Name: ${metadata.name}\n`;
  header += `// ID: ${metadata.id}\n`;
  header += `// Description: ${metadata.description}\n`;
  header += `// By: ${metadata.by}\n`;
  header += `// License: ${metadata.license}\n`;
  header += `\n`;
  header += `// Version: ${metadata.version}\n`;
  header += `\n`;

  return header;
}

/**
 * Get all JS files from src directory in order
 */
function getSourceFiles() {
  const files = fs
    .readdirSync(SRC_DIR)
    .filter(file => file.endsWith('.js') && !file.startsWith('.'))
    .sort();

  return files.map(file => path.join(SRC_DIR, file));
}

/**
 * Build the extension by concatenating, cleaning, minifying, and maximizing JS files
 */
async function buildExtension() {
  try {
    const manifest = getManifest();
    const header = generateHeader(manifest);
    const sourceFiles = getSourceFiles();

    let output = header;

    // Add IIFE wrapper that takes Scratch as parameter
    output += '(function (Scratch) {\n';
    output += '  "use strict";\n\n';

    // Concatenate all source files
    sourceFiles.forEach(file => {
      const filename = path.basename(file);
      output += `  // ===== ${filename} =====\n`;

      let content = fs.readFileSync(file, 'utf8');

      /**
       * TRANSFORM MODULES TO PLAIN JS
       */
      // 1. Remove import lines
      content = content.replace(/^import\s+[\s\S]*?from\s+['"].*?['"];?/gm, '');

      // 2. Remove 'export ' prefix
      content = content.replace(/^export\s+/gm, '');

      // Indent the content for the IIFE
      const indentedContent = content
        .split('\n')
        .map(line => {
          return line.length === 0 ? '' : '  ' + line;
        })
        .join('\n');

      output += indentedContent;
      output += '\n\n';
    });

    // Close IIFE
    output += '})(Scratch);\n';

    // Write standard output
    fs.writeFileSync(OUTPUT_FILE, output, 'utf8');

    const size = (output.length / 1024).toFixed(2);
    console.log(`[NORMAL] Standard build successful: ${OUTPUT_FILE} (${size} KB)`);

    // --- Maximization Step (Prettier) ---
    try {
      const { format, resolveConfig } = await import('prettier');
      const prettierConfig = (await resolveConfig(OUTPUT_MAX_FILE)) || {};
      const formatted = await format(output, {
        ...prettierConfig,
        parser: 'babel',
      });

      fs.writeFileSync(OUTPUT_MAX_FILE, formatted, 'utf8');
      const maxSize = (formatted.length / 1024).toFixed(2);
      console.log(`[PRETTY] Maximized output created: ${OUTPUT_MAX_FILE} (${maxSize} KB)`);
    } catch (err) {
      if (err.code === 'ERR_MODULE_NOT_FOUND') {
        console.warn('        (Skipping maximization: "prettier" not found)');
      } else {
        console.warn('[PRETTY] Maximization failed:', err);
      }
    }

    // --- Minification Step (Terser) ---
    try {
      const { minify } = await import('terser');
      const minified = await minify(output, {
        compress: true,
        mangle: true,
        format: {
          comments: /^\s*(Name|ID|Description|By|License|Version):/, 
        },
      });

      if (minified.code) {
        fs.writeFileSync(OUTPUT_MIN_FILE, minified.code, 'utf8');
        const minSize = (minified.code.length / 1024).toFixed(2);
        console.log(`[MINIFY] Minified output created: ${OUTPUT_MIN_FILE} (${minSize} KB)`);
      }
    } catch (err) {
      if (err.code === 'ERR_MODULE_NOT_FOUND') {
        console.warn('        (Skipping minification: "terser" not found)');
      } else {
        console.warn('[MINIFY] Minification failed:', err);
      }
    }

    return true;
  } catch (err) {
    console.error('✗ Build failed:', err.message);
    return false;
  }
}

/**
 * Coalescing guard to prevent concurrent build runs
 */
async function guardedBuild() {
  if (isBuilding) {
    pendingBuild = true;
    return;
  }

  isBuilding = true;
  await buildExtension();
  isBuilding = false;

  if (pendingBuild) {
    pendingBuild = false;
    // Trigger the next build in the next tick
    setImmediate(guardedBuild);
  }
}

/**
 * Watch for file changes
 */
async function watchFiles() {
  let chokidar;
  try {
    chokidar = (await import('chokidar')).default;
  } catch (err) {
    console.error('Watch mode requires chokidar. Install it with: npm install --save-dev chokidar');
    process.exit(1);
  }

  console.log('Watching for changes in', SRC_DIR);

  const watcher = chokidar.watch(SRC_DIR, {
    ignored: /(^|[\/\\])\./,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 100,
      pollInterval: 100,
    },
  });

  watcher.on('all', (event, file) => {
    console.log(`[WATCH] ${event}: ${path.basename(file)}`);
    guardedBuild();
  });
}

// Check for --watch flag
const watchMode = process.argv.includes('--watch');

// Execute
(async () => {
  // Always run the initial build
  await buildExtension();

  if (watchMode) {
    watchFiles();
  }
})();
