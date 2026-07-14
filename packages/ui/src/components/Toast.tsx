import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Animated, Easing, Platform, Pressable, StatusBar, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme';

export type ToastVariant = 'info' | 'success' | 'warning' | 'error' | 'crisis';

export type ToastOptions = {
  title?: string;
  message: string;
  variant?: ToastVariant;
  duration?: number;
};

type ToastContextValue = {
  show: (opts: ToastOptions) => void;
  hide: () => void;
  info: (message: string, title?: string) => void;
  success: (message: string, title?: string) => void;
  warning: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
  crisis: (message: string, title?: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const VARIANT: Record<
  ToastVariant,
  { accent: string; glow: string; symbol: string }
> = {
  info: { accent: colors.primary, glow: colors.primaryMuted, symbol: '·' },
  success: { accent: colors.success, glow: 'rgba(111, 168, 139, 0.14)', symbol: '✓' },
  warning: { accent: colors.warning, glow: 'rgba(212, 162, 76, 0.14)', symbol: '!' },
  error: { accent: colors.crisis, glow: colors.crisisSoft, symbol: '!' },
  crisis: { accent: colors.crisis, glow: colors.crisisSoft, symbol: '♥' },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastOptions | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const translateY = useRef(new Animated.Value(-120)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const hide = useCallback(() => {
    clearTimer();
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -120,
        duration: 250,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => setToast(null));
  }, [opacity, translateY]);

  const show = useCallback(
    (opts: ToastOptions) => {
      clearTimer();
      setToast(opts);
      translateY.setValue(-120);
      opacity.setValue(0);
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 0,
          duration: 400,
          easing: Easing.bezier(0.2, 0, 0, 1),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
      const duration = opts.duration ?? (opts.variant === 'crisis' ? 6000 : 4000);
      timerRef.current = setTimeout(hide, duration);
    },
    [hide, opacity, translateY]
  );

  useEffect(() => () => clearTimer(), []);

  const value = useMemo<ToastContextValue>(
    () => ({
      show,
      hide,
      info: (message, title) => show({ variant: 'info', message, title }),
      success: (message, title) => show({ variant: 'success', message, title }),
      warning: (message, title) => show({ variant: 'warning', message, title }),
      error: (message, title) => show({ variant: 'error', message, title }),
      crisis: (message, title) => show({ variant: 'crisis', message, title }),
    }),
    [show, hide]
  );

  const v = VARIANT[toast?.variant ?? 'info'];
  const topInset = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) + 8 : 56;

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <Animated.View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            top: topInset,
            left: spacing.lg,
            right: spacing.lg,
            transform: [{ translateY }],
            opacity,
            zIndex: 9999,
            elevation: 24,
          }}
        >
          <Pressable
            onPress={hide}
            accessibilityRole="alert"
            accessibilityLabel={toast.title ? `${toast.title}. ${toast.message}` : toast.message}
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: spacing.md,
              backgroundColor: colors.surfaceElev,
              borderRadius: radius.md,
              borderLeftWidth: 3,
              borderLeftColor: v.accent,
              borderWidth: 1,
              borderColor: colors.border,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.md,
              shadowColor: '#000',
              shadowOpacity: 0.35,
              shadowRadius: 20,
              shadowOffset: { width: 0, height: 10 },
            }}
          >
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                backgroundColor: v.glow,
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: 2,
              }}
            >
              <Text style={{ ...typography.bodyStrong, color: v.accent }}>{v.symbol}</Text>
            </View>
            <View style={{ flex: 1 }}>
              {toast.title ? (
                <Text style={{ ...typography.bodyStrong, color: colors.text }}>{toast.title}</Text>
              ) : null}
              <Text
                style={{
                  ...typography.body,
                  color: toast.title ? colors.textMuted : colors.text,
                  marginTop: toast.title ? 2 : 0,
                }}
              >
                {toast.message}
              </Text>
            </View>
          </Pressable>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
