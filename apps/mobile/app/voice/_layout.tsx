import { Stack } from 'expo-router';

/**
 * The Voice Studio.
 *
 * A stack rather than a wizard shell: the studio itself is a destination a parent
 * returns to, and the enrolment screens after it are a linear run they can back
 * out of at any point without losing anything they cannot redo.
 */
export default function VoiceLayout() {
  return <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />;
}
