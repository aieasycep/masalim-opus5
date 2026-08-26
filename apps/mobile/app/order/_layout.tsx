import { Stack } from 'expo-router';

/**
 * Checkout and order history.
 *
 * One stack for both because they meet: the confirmation screen hands straight
 * over to the order's detail, and a parent who opens an unpaid order from the
 * list rejoins the payment step rather than starting again.
 */
export default function OrderLayout() {
  return <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />;
}
