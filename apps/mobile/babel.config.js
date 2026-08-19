module.exports = function babelConfig(api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'react' }]],
    plugins: [
      // Last on purpose: the worklet transform has to run over everything the
      // other plugins produce. Named directly rather than through
      // `react-native-reanimated/plugin`, which in Reanimated 4 is a one-line
      // re-export of this and resolves only from inside Reanimated's own
      // directory.
      'react-native-worklets/plugin',
    ],
  };
};
