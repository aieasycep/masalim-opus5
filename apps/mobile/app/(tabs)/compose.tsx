import { Redirect } from 'expo-router';

/**
 * The Create slot in the tab bar.
 *
 * A placeholder, and deliberately one. The tab bar needs a fourth slot for the
 * raised Create button to sit in — with three tabs the centre of the bar falls
 * inside the middle tab, and no amount of margin puts a gap there. The button
 * itself is drawn by `tabBarButton` in the layout and starts the wizard, so
 * this screen is never reached by tapping it.
 *
 * It redirects rather than rendering nothing, because a route that exists must
 * do something sensible if a deep link or a back gesture ever lands on it.
 */
export default function ComposeSlot() {
  return <Redirect href="/create" />;
}
