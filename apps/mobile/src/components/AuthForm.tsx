import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Controller, useForm, type Control, type FieldValues, type Path } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { ZodType } from 'zod';
import { Button, Divider, Icon, Input, Text, useTheme } from '@masalim/ui';
import { useI18n } from '../i18n';

export interface AuthFieldConfig<T extends FieldValues> {
  name: Path<T>;
  label: string;
  placeholder?: string | undefined;
  secure?: boolean | undefined;
  autoComplete?: 'email' | 'password' | 'new-password' | 'name' | undefined;
  keyboardType?: 'email-address' | 'default' | undefined;
}

export interface AuthFormProps<T extends FieldValues> {
  schema: ZodType<T>;
  defaultValues: T;
  fields: Array<AuthFieldConfig<T>>;
  submitLabel: string;
  submitting: boolean;
  /** Already-localised copy for a failure the server returned. */
  errorMessage?: string | null | undefined;
  onSubmit: (values: T) => void;
  footer?: React.ReactNode | undefined;
}

/**
 * The shared shape of sign-in and sign-up.
 *
 * Validation runs against the *same* Zod schemas the API validates with, so the
 * rules a parent is held to on the device are exactly the rules the server
 * enforces — no field that passes here and fails there. Messages are error codes
 * rather than sentences, translated at render time.
 */
export function AuthForm<T extends FieldValues>({
  schema,
  defaultValues,
  fields,
  submitLabel,
  submitting,
  errorMessage,
  onSubmit,
  footer,
}: AuthFormProps<T>) {
  const { t } = useI18n();
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<T>({
    resolver: zodResolver(schema),
    defaultValues: defaultValues as never,
    mode: 'onBlur',
  });

  return (
    <View style={styles.form}>
      {fields.map((field) => (
        <AuthField
          key={String(field.name)}
          field={field}
          control={control}
          errorCode={
            (errors as Record<string, { message?: string } | undefined>)[String(field.name)]
              ?.message
          }
        />
      ))}

      {errorMessage ? (
        <Text variant="small" tone="destructive" accessibilityLiveRegion="polite">
          {errorMessage}
        </Text>
      ) : null}

      <Button
        label={submitLabel}
        loading={submitting}
        onPress={() => {
          void handleSubmit((values) => {
            onSubmit(values);
          })();
        }}
        style={styles.submit}
      />

      {footer ? (
        <>
          <View style={styles.divider}>
            <Divider style={styles.dividerLine} />
            <Text variant="caption" tone="muted">
              {t('auth.dividerOr')}
            </Text>
            <Divider style={styles.dividerLine} />
          </View>
          {footer}
        </>
      ) : null}
    </View>
  );
}

function AuthField<T extends FieldValues>({
  field,
  control,
  errorCode,
}: {
  field: AuthFieldConfig<T>;
  control: Control<T>;
  errorCode: string | undefined;
}) {
  const theme = useTheme();
  const { t } = useI18n();
  const [revealed, setRevealed] = useState(false);

  return (
    <Controller
      control={control}
      name={field.name}
      render={({ field: { onChange, onBlur, value } }) => (
        <Input
          label={field.label}
          {...(field.placeholder ? { placeholder: field.placeholder } : {})}
          value={typeof value === 'string' ? value : ''}
          onChangeText={onChange}
          onBlur={onBlur}
          secureTextEntry={field.secure === true && !revealed}
          autoCapitalize={field.name === 'name' ? 'words' : 'none'}
          autoCorrect={false}
          {...(field.autoComplete ? { autoComplete: field.autoComplete } : {})}
          {...(field.keyboardType ? { keyboardType: field.keyboardType } : {})}
          // Codes come out of the shared schemas; the sentence is chosen here.
          error={errorCode ? t(`validation.${errorCode}`) : null}
          {...(field.secure
            ? {
                trailingIcon: (
                  <Icon
                    name={revealed ? 'eyeOff' : 'eye'}
                    size={18}
                    color={theme.colors.mutedForeground}
                  />
                ),
                onTrailingIconPress: () => {
                  setRevealed((current) => !current);
                },
              }
            : {})}
        />
      )}
    />
  );
}

export function AuthLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="link" onPress={onPress} hitSlop={8} style={styles.link}>
      <Text variant="smallBold" tone="primary">
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  form: { gap: 14 },
  submit: { marginTop: 8 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 4 },
  dividerLine: { flex: 1 },
  link: { alignSelf: 'center', paddingVertical: 8 },
});
