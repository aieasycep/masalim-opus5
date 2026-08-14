import { StyleSheet, View } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, IconButton, MIN_TOUCH_TARGET, Text, useTheme, type IconName } from '@masalim/ui';
import { useI18n } from '../../src/i18n';

const TABS: Array<{ name: string; icon: IconName; labelKey: string }> = [
  { name: 'index', icon: 'home', labelKey: 'tabs.home' },
  { name: 'library', icon: 'library', labelKey: 'tabs.library' },
  { name: 'profile', icon: 'profile', labelKey: 'tabs.profile' },
];

/**
 * The bottom navigation.
 *
 * Three tabs plus a raised Create button in the middle, exactly as the design
 * has it. Create is a floating action rather than a fourth tab because it starts
 * a flow rather than switching between places — and because it is the thing a
 * parent opens the app to do.
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
        {TABS.map((tab, index) => (
          <Tabs.Screen
            key={tab.name}
            name={tab.name}
            options={{
              title: t(tab.labelKey),
              tabBarAccessibilityLabel: t(tab.labelKey),
              tabBarIcon: ({ color }) => <Icon name={tab.icon} size={22} color={color} />,
              // A gap in the middle of the bar for the raised Create button.
              tabBarItemStyle: index === 1 ? styles.itemBeforeGap : undefined,
            }}
          />
        ))}
      </Tabs>

      <View style={[styles.createWell, { bottom: insets.bottom + 14 }]} pointerEvents="box-none">
        <IconButton
          name="create"
          accessibilityLabel={t('tabs.create')}
          variant="primary"
          size={58}
          iconSize={24}
          onPress={() => {
            router.push('/create');
          }}
          style={theme.shadows.cta}
        />
        <Text variant="micro" tone="muted" style={styles.createLabel}>
          {t('tabs.create')}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  itemBeforeGap: { marginRight: 72 },
  createWell: {
    position: 'absolute',
    alignSelf: 'center',
    alignItems: 'center',
  },
  createLabel: { marginTop: 2 },
});
