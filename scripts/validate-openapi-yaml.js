#!/usr/bin/env node
'use strict';

// Parses every swagger.yaml and open-api.yaml under src/apps/apis and fails
// when any of them is not valid YAML or is not an OpenAPI document.
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const root = path.resolve(__dirname, '..', 'src', 'apps', 'apis');
const names = new Set(['swagger.yaml', 'open-api.yaml']);

function collect(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collect(entryPath);
    return names.has(entry.name) ? [entryPath] : [];
  });
}

const files = collect(root).sort();
const failures = [];

for (const file of files) {
  const relative = path.relative(process.cwd(), file);
  try {
    const document = yaml.load(fs.readFileSync(file, 'utf8'), {
      filename: relative,
    });
    if (!document || typeof document !== 'object' || !document.openapi) {
      failures.push(`${relative}: missing top-level "openapi" field`);
    }
  } catch (error) {
    failures.push(`${relative}: ${error.message}`);
  }
}

if (files.length === 0) failures.push(`no OpenAPI YAML files found in ${root}`);

if (failures.length > 0) {
  console.error(failures.join('\n\n'));
  process.exit(1);
}

console.log(`Parsed ${files.length} OpenAPI YAML files.`);
