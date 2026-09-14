import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Avatar,
  Badge,
  Card,
  ConfirmDialog,
  Divider,
  ListItem,
  Screen,
  ScreenHeader,
  Text,
} from '@masalim/ui';
import { useChildren, useEntitlements, useOrders, useVoices } from '../../src/hooks/queries';
import { useSession } from '../../src/stores/session';
import { useI18n } from '../../src/i18n';

/**
 * Profile and family.
 *
 * The hub for everything that is not a story: the children, the voices, the
 * orders, the subscription and the settings. Counts are shown next to each row
 * so a parent can tell at a glance whether there is anything there before
 * tapping in.
 */
export default function ProfileScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const user = useSession((state) => state.user);
  const signOut = useSession((state) => state.signOut);

  const { data: children = [] } = useChildren();
  const { data: voices = [] } = useVoices();
  const { data: orders } = useOrders();
  const { data: entitlements } = useEntitlements();

  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const isPremium = entitlements?.tier === 'PREMIUM';

  return (
    <Screen footerHeight={90}>
      <ScreenHeader title={t('profile.title')} />

      <Card style={styles.identity}>
        <Avatar name={user?.name ?? undefined} kind="user" size={56} />
        <View style={styles.identityBody}>
          <Text variant="h6" numberOfLines={1}>
            {user?.name ?? t('profile.account')}
          </Text>
          <Text variant="small" tone="muted" numberOfLines={1}>
            {user?.email ?? ''}
          </Text>
        </View>
        {isPremium ? <Badge label={t('subscription.memberBadge')} tone="premium" /> : null}
      </Card>

      <View style={styles.section}>
        <Text variant="h6" style={styles.sectionTitle}>
          {t('profile.myChildren')}
        </Text>
        <Card variant="flat" padding={12}>
          {children.map((child, index) => (
            <View key={child.id}>
              {index > 0 ? <Divider /> : null}
              <ListItem
                title={child.name}
                subtitle={t('common.storyCount', { count: child.storyCount })}
                leading={<Avatar name={child.name} imageUrl={child.avatarUrl} size={36} />}
                onPress={() => {
                  router.push({ pathname: '/child/[id]', params: { id: child.id } });
                }}
              />
            </View>
          ))}
          {children.length > 0 ? <Divider /> : null}
          <ListItem
            title={t('child.addChild')}
            icon="plus"
            onPress={() => {
              router.push('/child/new');
            }}
          />
        </Card>
      </View>

      <View style={styles.section}>
        <Card variant="flat" padding={12}>
          <ListItem
            title={t('profile.voices')}
            subtitle={t('profile.voicesSub', { count: voices.length })}
            icon="microphone"
            onPress={() => {
              router.push('/voice');
            }}
          />
          <Divider />
          <ListItem
            title={t('profile.orders')}
            subtitle={t('profile.ordersSub', { count: orders?.items.length ?? 0 })}
            icon="truck"
            onPress={() => {
              router.push('/order');
            }}
          />
          <Divider />
          <ListItem
            title={t('profile.subscription')}
            value={isPremium ? t('subscription.premiumTier') : t('subscription.freeTier')}
            icon="star"
            onPress={() => {
              router.push('/subscription');
            }}
          />
          <Divider />
          <ListItem
            title={t('profile.notifications')}
            icon="bell"
            onPress={() => {
              router.push('/notifications');
            }}
          />
          <Divider />
          <ListItem
            title={t('profile.settings')}
            subtitle={t('profile.settingsSub')}
            icon="settings"
            onPress={() => {
              router.push('/settings');
            }}
          />
        </Card>
      </View>

      <ListItem
        title={t('auth.signOut')}
        icon="logOut"
        tone="destructive"
        showChevron={false}
        onPress={() => {
          setConfirmSignOut(true);
        }}
        style={styles.signOut}
      />

      <ConfirmDialog
        visible={confirmSignOut}
        title={t('auth.signOut')}
        confirmLabel={t('auth.signOut')}
        cancelLabel={t('common.cancel')}
        tone="destructive"
        onConfirm={() => {
          setConfirmSignOut(false);
          void signOut();
        }}
        onCancel={() => {
          setConfirmSignOut(false);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  identity: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 8 },
  identityBody: { flex: 1, gap: 2 },
  section: { marginTop: 24 },
  sectionTitle: { marginBottom: 10 },
  signOut: { marginTop: 24 },
});
