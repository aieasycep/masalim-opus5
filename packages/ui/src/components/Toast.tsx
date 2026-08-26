import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export type ToastTone = 'success' | 'error' | 'info';

export interface ToastOptions {
  message: string;
  tone?: ToastTone | undefined;
  /** Milliseconds on screen. Errors linger longer because they carry more to read. */
  durationMs?: number | undefined;
}

interface ToastContextValue {
  show: (options: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const ICONS: Record<ToastTone, IconName> = {
  success: 'check',
  error: 'alert',
  info: 'info',
};

const DEFAULT_DURATION: Record<ToastTone, number> = {
  success: 2400,
  error: 4000,
  info: 3000,
};

/**
 * Transient confirmations.
 *
 * Deliberately not used for anything a parent must act on: a message that
 * disappears after three seconds is fine for "Kaydedildi" and useless for a
 * failure they need to retry, which is what the inline error states are for.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  // A resolved shape rather than `Required<ToastOptions>`: `Required` only drops
  // the `?`, and every optional prop here explicitly admits `undefined`.
  const [toast, setToast] = useState<{
    message: string;
    tone: ToastTone;
    durationMs: number;
  } | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const translate = useRef(new Animated.Value(-12)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = useCallback(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(translate, { toValue: -12, duration: 180, useNativeDriver: true }),
    ]).start(() => {
      setToast(null);
    });
  }, [opacity, translate]);

  const show = useCallback(
    (options: ToastOptions) => {
      const tone = options.tone ?? 'info';
      if (timer.current) clearTimeout(timer.current);

      setToast({
        message: options.message,
        tone,
        durationMs: options.durationMs ?? DEFAULT_DURATION[tone],
      });

      opacity.setValue(0);
      translate.setValue(-12);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(translate, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();

      timer.current = setTimeout(hide, options.durationMs ?? DEFAULT_DURATION[tone]);
    },
    [hide, opacity, translate],
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const value = useMemo(() => ({ show }), [show]);

  const tint: Record<ToastTone, string> = {
    success: theme.colors.success,
    error: theme.colors.destructive,
    info: theme.colors.primary,
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <Animated.View
          pointerEvents="none"
          accessibilityLiveRegion="polite"
          style={[
            styles.container,
            {
              top: insets.top + 8,
              opacity,
              transform: [{ translateY: translate }],
            },
          ]}
        >
          <View
            style={[
              styles.toast,
              {
                backgroundColor: theme.colors.card,
                borderRadius: theme.radius.md,
                borderLeftColor: tint[toast.tone],
              },
              theme.shadows.raised,
            ]}
          >
            <Icon name={ICONS[toast.tone]} size={18} color={tint[toast.tone]} />
            <Text variant="small" style={styles.message}>
              {toast.message}
            </Text>
          </View>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used inside a ToastProvider');
  }
  return context;
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 100,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderLeftWidth: 3,
  },
  message: { flex: 1 },
});
