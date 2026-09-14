import { Stack } from 'expo-router';

export default function OnboardingLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        // Fading rather than sliding: the onboarding slides are a single
        // continuous idea, not a stack a parent drills into.
        animation: 'fade',
      }}
    />
  );
}
