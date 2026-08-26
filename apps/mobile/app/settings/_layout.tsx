import { Stack } from 'expo-router';

/**
 * Settings, including the data-rights screens.
 *
 * A plain stack: every screen here is reached from the index and returns to it,
 * and none of them is a step in a flow that could be left half-finished.
 */
export default function SettingsLayout() {
  return <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />;
}
