const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const sharedEntry = path.resolve(projectRoot, '../../packages/shared/src/index.ts');
const sharedRoot = path.resolve(projectRoot, '../../packages/shared');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [sharedRoot];
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];
// Keep React Native's React in apps/mobile. Walking up would hit the Vite app's node_modules.
config.resolver.disableHierarchicalLookup = true;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@spine/shared') {
    return { type: 'sourceFile', filePath: sharedEntry };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
