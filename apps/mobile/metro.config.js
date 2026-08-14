const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

/**
 * Monorepo wiring.
 *
 * The workspace packages are consumed as TypeScript source rather than built
 * output, so Metro has to watch the whole repo and resolve modules from both
 * node_modules trees. `disableHierarchicalLookup` keeps pnpm's strict layout
 * from being bypassed, which is what stops two copies of React ending up in one
 * bundle.
 */
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
