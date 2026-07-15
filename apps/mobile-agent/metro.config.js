const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
// Hierarchical lookup stays ON: packages with nested deps (react-native-webrtc →
// event-target-shim@6) resolve from their own node_modules. npm hoisting keeps
// the tree deduped; expo-doctor also expects the default here.
config.resolver.disableHierarchicalLookup = false;

// Shared packages use NodeNext-style `./x.js` specifiers (required by the API's
// tsconfig). Metro resolves file paths literally, so retry without the extension.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  try {
    return context.resolveRequest(context, moduleName, platform);
  } catch (error) {
    if (moduleName.startsWith('.') && moduleName.endsWith('.js')) {
      return context.resolveRequest(context, moduleName.replace(/\.js$/, ''), platform);
    }
    throw error;
  }
};

module.exports = config;
