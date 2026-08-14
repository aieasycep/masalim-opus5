module.exports = function babelConfig(api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'react' }]],
    plugins: [
      // Reanimated's plugin has to be last; the worklet transform runs over
      // everything the other plugins produce.
      'react-native-reanimated/plugin',
    ],
  };
};
