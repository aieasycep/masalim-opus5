import { Stack } from 'expo-router';

/**
 * The paywall and its management screen.
 *
 * Presented modally from wherever a limit was hit, so it returns the parent to
 * what they were doing rather than dropping them somewhere else in the app.
 */
export default function SubscriptionLayout() {
  return <Stack screenOptions={{ headerShown: false, animation: 'slide_from_bottom' }} />;
}
