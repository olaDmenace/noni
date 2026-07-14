import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Text, View } from 'react-native';
import { colors, spacing, typography } from '../theme';

export function Splash({ onFinish, minDurationMs = 1200 }: { onFinish?: () => void; minDurationMs?: number }) {
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textTranslate = useRef(new Animated.Value(8)).current;
  const glowScale = useRef(new Animated.Value(0.9)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;
  const rootOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(glowOpacity, {
        toValue: 1,
        duration: 700,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(glowScale, {
        toValue: 1,
        duration: 1200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(250),
        Animated.parallel([
          Animated.timing(textOpacity, {
            toValue: 1,
            duration: 600,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(textTranslate, {
            toValue: 0,
            duration: 600,
            easing: Easing.bezier(0.2, 0, 0, 1),
            useNativeDriver: true,
          }),
        ]),
      ]),
    ]).start();

    const t = setTimeout(() => {
      Animated.timing(rootOpacity, {
        toValue: 0,
        duration: 350,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }).start(() => onFinish?.());
    }, minDurationMs);

    return () => clearTimeout(t);
  }, [glowOpacity, glowScale, textOpacity, textTranslate, rootOpacity, minDurationMs, onFinish]);

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: colors.bg,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: rootOpacity,
        zIndex: 10000,
      }}
    >
      <Animated.View
        style={{
          position: 'absolute',
          width: 360,
          height: 360,
          borderRadius: 180,
          backgroundColor: colors.primaryMuted,
          opacity: glowOpacity,
          transform: [{ scale: glowScale }],
        }}
      />
      <Animated.View
        style={{
          position: 'absolute',
          width: 220,
          height: 220,
          borderRadius: 110,
          backgroundColor: colors.primaryGlow,
          opacity: glowOpacity,
          transform: [{ scale: glowScale }],
        }}
      />
      <Animated.View
        style={{
          alignItems: 'center',
          opacity: textOpacity,
          transform: [{ translateY: textTranslate }],
        }}
      >
        <Text
          style={{
            ...typography.display,
            fontSize: 56,
            lineHeight: 60,
            color: colors.text,
          }}
        >
          Noni
        </Text>
        <View style={{ height: spacing.sm }} />
        <Text
          style={{
            ...typography.caption,
            color: colors.textMuted,
            letterSpacing: 2,
            textTransform: 'uppercase',
          }}
        >
          A quiet room
        </Text>
      </Animated.View>
    </Animated.View>
  );
}
