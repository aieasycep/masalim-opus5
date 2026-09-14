const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

/**
 * Monorepo wiring.
 *
 * The workspace packages are consumed as TypeScript source rather than built
 * output, so Metro watches the whole repo and resolves from both node_modules
 * trees.
 *
 * Hierarchical lookup stays *on*. Disabling it is the standard advice for hoisted
 * npm/yarn workspaces, and it is actively wrong under pnpm: pnpm gives every
 * package its own `node_modules` inside the store and walking up from the
 * importing file is the only way a dependency finds its own dependencies. Turning
 * it off resolves the app's imports fine and then fails deep inside a vendor
 * package — `expo` looking for `expo-modules-core` — which is a confusing failure
 * to read a fortnight later.
 */
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

/**
 * The single-instance packages, pinned to the app's copy.
 *
 * This is what the old `disableHierarchicalLookup` was reaching for: two Reacts in
 * one bundle break hooks with an error that blames your component. Rather than
 * crippling resolution everywhere to get it, name the packages that must be
 * singletons — React and anything holding native state or context — and let
 * everything else resolve normally.
 */
config.resolver.extraNodeModules = {
  react: path.resolve(projectRoot, 'node_modules/react'),
  'react-native': path.resolve(projectRoot, 'node_modules/react-native'),
  'react-native-safe-area-context': path.resolve(
    projectRoot,
    'node_modules/react-native-safe-area-context',
  ),
  'react-native-gesture-handler': path.resolve(
    projectRoot,
    'node_modules/react-native-gesture-handler',
  ),
  'react-native-reanimated': path.resolve(projectRoot, 'node_modules/react-native-reanimated'),
};

module.exports = config;
