import { Stack } from 'expo-router';

/**
 * The story wizard.
 *
 * Six steps in a stack of their own so "Geri" moves through the wizard rather
 * than out of it, and so leaving mid-way lands back where the parent started
 * instead of somewhere in the middle.
 */
export default function CreateLayout() {
  return <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />;
}
