import { Stack } from 'expo-router';

/**
 * The storybook maker.
 *
 * Builder, cover and preview are three views of one book rather than steps in a
 * wizard — a parent can jump between them in any order, and everything autosaves,
 * so there is no point at which the work is "not yet committed".
 */
export default function BookLayout() {
  return <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />;
}
