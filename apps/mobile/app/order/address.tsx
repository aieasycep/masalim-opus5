import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Button,
  Card,
  Divider,
  Icon,
  Input,
  LoadingState,
  OptionCard,
  Screen,
  ScreenHeader,
  Text,
  useTheme,
} from '@masalim/ui';
import { addressSchema, type AddressInput } from '@masalim/validation';
import { useAddresses, useCreateAddress } from '../../src/hooks/queries';
import { useOrderDraft } from '../../src/stores/order-draft';
import { useI18n } from '../../src/i18n';

const EMPTY_ADDRESS: AddressInput = {
  fullName: '',
  phone: '',
  line1: '',
  district: '',
  city: '',
  postalCode: '',
  countryCode: 'TR',
  isDefault: false,
};

/**
 * Where the book is posted.
 *
 * A saved address is one tap; the form only unfolds when there is nothing to
 * pick or the parent asks for it. Checkout is the worst moment to make someone
 * retype an address they have already given us.
 *
 * The form validates against the same schema the API validates with, so no field
 * can pass here and fail there — and the messages are error codes translated at
 * render time rather than sentences baked into the schema.
 */
export default function OrderAddressScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { t, errorCopy } = useI18n();

  const { data: addresses = [], isPending } = useAddresses();
  const createAddress = useCreateAddress();
  const draft = useOrderDraft((state) => state.draft);
  const update = useOrderDraft((state) => state.update);

  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<AddressInput>({
    resolver: zodResolver(addressSchema),
    defaultValues: EMPTY_ADDRESS,
    mode: 'onBlur',
  });

  const showForm = adding || (!isPending && addresses.length === 0);
  const selectedId = draft.addressId;

  const fields: Array<{
    name: keyof AddressInput;
    labelKey: string;
    keyboard?: 'phone-pad' | 'numeric';
    autoComplete?: 'name' | 'tel' | 'postal-code';
  }> = [
    { name: 'fullName', labelKey: 'order.addressFullName', autoComplete: 'name' },
    { name: 'phone', labelKey: 'order.addressPhone', keyboard: 'phone-pad', autoComplete: 'tel' },
    { name: 'line1', labelKey: 'order.addressLine1' },
    { name: 'line2', labelKey: 'order.addressLine2' },
    { name: 'district', labelKey: 'order.addressDistrict' },
    { name: 'city', labelKey: 'order.addressCity' },
    {
      name: 'postalCode',
      labelKey: 'order.addressPostalCode',
      keyboard: 'numeric',
      autoComplete: 'postal-code',
    },
  ];

  return (
    <Screen footerHeight={120}>
      <ScreenHeader
        title={t('order.addressTitle')}
        onBack={() => {
          router.back();
        }}
      />

      {isPending ? (
        <LoadingState label={t('common.loading')} />
      ) : (
        <>
          {addresses.map((address) => (
            <OptionCard
              key={address.id}
              title={address.fullName}
              description={`${address.line1}, ${address.district} / ${address.city}`}
              selected={selectedId === address.id}
              style={styles.option}
              onPress={() => {
                update({ addressId: address.id });
              }}
            />
          ))}

          {!showForm ? (
            <Button
              label={t('order.addressAdd')}
              variant="secondary"
              leadingIcon={<Icon name="plus" size={18} color={theme.colors.primary} />}
              style={styles.add}
              onPress={() => {
                setAdding(true);
              }}
            />
          ) : null}
        </>
      )}

      {showForm ? (
        <Card style={styles.form}>
          {addresses.length > 0 ? <Divider spacing={4} /> : null}

          {fields.map((field) => (
            <Controller
              key={field.name}
              control={control}
              name={field.name}
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label={t(field.labelKey)}
                  value={typeof value === 'string' ? value : ''}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  autoCapitalize={field.name === 'fullName' ? 'words' : 'sentences'}
                  autoCorrect={false}
                  {...(field.keyboard ? { keyboardType: field.keyboard } : {})}
                  {...(field.autoComplete ? { autoComplete: field.autoComplete } : {})}
                  error={
                    errors[field.name]?.message
                      ? t(`validation.${String(errors[field.name]?.message)}`)
                      : null
                  }
                />
              )}
            />
          ))}

          {error ? (
            <Text variant="small" tone="destructive" accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}

          <Button
            label={t('order.addressSave')}
            loading={createAddress.isPending}
            onPress={() => {
              void handleSubmit((values) => {
                setError(null);
                createAddress.mutate(values, {
                  onSuccess: (created) => {
                    // Selecting it here is the whole point of having just typed it.
                    update({ addressId: created.id });
                    setAdding(false);
                  },
                  onError: (cause) => {
                    setError(errorCopy(cause).message);
                  },
                });
              })();
            }}
          />
        </Card>
      ) : null}

      <View style={styles.spacer} />

      <Button
        label={t('common.continue')}
        disabled={selectedId === null}
        onPress={() => {
          router.push('/order/review');
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  option: { marginBottom: 10 },
  add: { marginTop: 8 },
  form: { gap: 14, marginTop: 16 },
  spacer: { height: 24 },
});
