import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Screen, ScreenHeader, StepIndicator, Text } from '@masalim/ui';
import { useI18n } from '../i18n';

export const WIZARD_STEPS = 6;

export interface WizardStepProps {
  step: number;
  title: string;
  subtitle?: string | undefined;
  children: ReactNode;
  /** Disabled until the step's own requirement is met. */
  canContinue: boolean;
  continueLabel?: string | undefined;
  onContinue: () => void;
  submitting?: boolean | undefined;
  /** Extra content between the body and the footer, e.g. a safety note. */
  footerNote?: string | undefined;
}

/**
 * The frame every wizard step shares.
 *
 * The footer is fixed rather than scrolling with the content: on step 3 the
 * theme grid is long, and a parent who has made their choice should not have to
 * scroll to the bottom to find "İleri".
 */
export function WizardStep({
  step,
  title,
  subtitle,
  children,
  canContinue,
  continueLabel,
  onContinue,
  submitting = false,
  footerNote,
}: WizardStepProps) {
  const router = useRouter();
  const { t } = useI18n();

  return (
    <Screen footerHeight={120}>
      <ScreenHeader
        onBack={() => {
          router.back();
        }}
        backLabel={t('common.back')}
      />

      <StepIndicator current={step} total={WIZARD_STEPS} style={styles.steps} />

      <Text variant="eyebrow" tone="primary" style={styles.eyebrow}>
        {t('storyCreate.eyebrow')}
      </Text>
      <Text variant="h2">{title}</Text>
      {subtitle ? (
        <Text variant="body" tone="muted" style={styles.subtitle}>
          {subtitle}
        </Text>
      ) : null}

      <View style={styles.body}>{children}</View>

      {footerNote ? (
        <Text variant="caption" tone="muted" align="center" style={styles.note}>
          {footerNote}
        </Text>
      ) : null}

      <Button
        label={continueLabel ?? t('common.continue')}
        disabled={!canContinue}
        loading={submitting}
        onPress={onContinue}
        style={styles.cta}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  steps: { marginBottom: 20 },
  eyebrow: { marginBottom: 6 },
  subtitle: { marginTop: 8 },
  body: { marginTop: 24, gap: 12 },
  note: { marginTop: 20 },
  cta: { marginTop: 24 },
});
