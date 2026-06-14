/**
 * scripts/build-bundle.js v2.0
 * Конкатенирует все provider-модули в один providers-bundle.js для browser_evaluate.
 * Запуск: node scripts/build-bundle.js
 */
const fs = require('fs');
const path = require('path');

const PROVIDERS_DIR = path.join(__dirname, 'providers');
const OUTPUT = path.join(__dirname, 'providers-bundle.js');

const ORDER = [
  'base-adapter.js',
  'spec.js',
  'glm-adapter.js',
  'qwen-adapter.js',
  'deepseek-adapter.js',
  'kimi-adapter.js',
  'openai-normalizer.js',
  'index.js',
];

const HEADER = `/**
 * scripts/providers-bundle.js — AUTO-GENERATED, DO NOT EDIT
 * Build: ${new Date().toISOString()}
 * 
 * Bundle of all provider modules for browser_evaluate injection.
 * Вызов: browser_evaluate(filename='providers-bundle.js')
 */

`;

const FOOTER = `
// === Bundle complete ===
`;

let bundle = HEADER;

for (const file of ORDER) {
  const filePath = path.join(PROVIDERS_DIR, file);
  if (!fs.existsSync(filePath)) {
    console.error(`Missing: ${file}`);
    process.exit(1);
  }
  const code = fs.readFileSync(filePath, 'utf8');
  bundle += `\n// ═══ ${file} ═══\n`;
  bundle += code;
  bundle += '\n';
}

bundle += FOOTER;

fs.writeFileSync(OUTPUT, bundle, 'utf8');
const lineCount = bundle.split('\n').length;
console.log(`Bundle written: ${OUTPUT} (${lineCount} lines)`);
