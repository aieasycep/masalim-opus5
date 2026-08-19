import { Pressable, StyleSheet, View } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, MIN_TOUCH_TARGET, Text, useTheme, type IconName } from '@masalim/ui';
import { useI18n } from '../../src/i18n';

const TABS: Array<{ name: string; icon: IconName; labelKey: string }> = [
  { name: 'index', icon: 'home', labelKey: 'tabs.home' },
  { name: 'library', icon: 'library', labelKey: 'tabs.library' },
  { name: 'compose', icon: 'create', labelKey: 'tabs.create' },
  { name: 'profile', icon: 'profile', labelKey: 'tabs.profile' },
];

/** The raised circle sticks this far above the top edge of the bar. */
const LIFT = 18;
const CIRCLE = 56;

/**
 * The bottom navigation.
 *
 * Three destinations plus a raised Create action, exactly as the design has it.
 * Create is drawn as a floating circle rather than a flat tab because it starts
 * a flow rather than switching between places — and because it is the thing a
 * parent opens the app to do.
 *
 * It occupies a real slot in the bar rather than floating over one. An earlier
 * version put the circle at the centre of the screen and opened a gap between
 * the last two tabs instead, so the circle covered a label while the gap it was
 * meant to sit in stayed empty. With four slots the third one is where the
 * button belongs, and the layout puts it there without any arithmetic.
 */
export default function TabsLayout() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useI18n();

  return (
    <View style={styles.root}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: true,
          tabBarActiveTintColor: theme.colors.primary,
          tabBarInactiveTintColor: theme.colors.mutedForeground,
          tabBarStyle: {
            backgroundColor: theme.colors.card,
            borderTopColor: theme.colors.border,
            height: MIN_TOUCH_TARGET + 16 + insets.bottom,
            paddingTop: 8,
            paddingBottom: insets.bottom,
          },
          tabBarLabelStyle: theme.text.micro,
        }}
      >
        {TABS.map((tab) =>
          tab.name === 'compose' ? (
            <Tabs.Screen
              key={tab.name}
              name={tab.name}
              options={{
                // Spelled out rather than read from the entry above: this
                // branch is only ever the Create slot, and a literal keeps the
                // key inside the reach of the translation-coverage test.
                title: t('tabs.create'),
                // The whole slot is the button. Replacing it rather than
                // decorating it is what keeps the circle inside the bar's own
                // layout: it cannot drift away from its label, and it cannot
                // land on a neighbour.
                tabBarButton: () => (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('tabs.create')}
                    style={styles.createSlot}
                    onPress={() => {
                      router.push('/create');
                    }}
                  >
                    <View
                      style={[
                        styles.circle,
                        { backgroundColor: theme.colors.primary },
                        theme.shadows.cta,
                      ]}
                    >
                      <Icon name="create" size={24} color={theme.colors.primaryForeground} />
                    </View>
                    <Text variant="micro" tone="muted" style={styles.createLabel}>
                      {t('tabs.create')}
                    </Text>
                  </Pressable>
                ),
              }}
            />
          ) : (
            <Tabs.Screen
              key={tab.name}
              name={tab.name}
              options={{
                title: t(tab.labelKey),
                tabBarAccessibilityLabel: t(tab.labelKey),
                tabBarIcon: ({ color }) => <Icon name={tab.icon} size={22} color={color} />,
              }}
            />
          ),
        )}
      </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  createSlot: {
    flex: 1,
    alignItems: 'center',
    // The circle is taller than the slot and is allowed to overflow upward.
    // `justifyContent` cannot express that, so the lift is a negative margin
    // and the label keeps its normal place in the row.
    marginTop: -LIFT,
  },
  circle: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createLabel: { marginTop: 4 },
});
