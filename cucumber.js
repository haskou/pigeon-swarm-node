const api = [
  'tests/api/features/**/*.feature',
  '--require tests/api/steps/*.ts',
  '--require-module ts-node/register',
  '--require-module tsconfig-paths/register tsconfig',
  '--exit',
].join(' ');

const api_support = [
  '--require tests/api/steps/*.ts',
  '--require-module ts-node/register',
  '--require-module tsconfig-paths/register tsconfig',
  '--exit',
].join(' ');

const consumer = [
  'tests/consumers/features/*.feature',
  '--require tests/consumers/steps/*.ts',
  '--require-module ts-node/register',
  '--require-module tsconfig-paths/register tsconfig',
  '--exit',
].join(' ');

const scheduler = [
  'tests/scheduler/features/*.feature',
  '--require tests/scheduler/steps/*.ts',
  '--require-module ts-node/register',
  '--require-module tsconfig-paths/register tsconfig',
  '--exit',
].join(' ');

module.exports = {
  api,
  api_support,
  consumer,
  scheduler,
};
