import { Stack } from 'expo-router';

/**
 * Child profiles.
 *
 * A plain stack: adding a child and editing one are both single screens reached
 * from Profile and returning to it, so there is no flow here to keep in step.
 */
export default function ChildLayout() {
  return <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />;
}
