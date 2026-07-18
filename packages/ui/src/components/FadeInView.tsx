// Mount animation for list items and content blocks: a quiet fade with a
// small rise. DESIGN.md motion — 250ms, material ease-out, never a spring.
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, type ViewStyle } from 'react-native';
import { motion } from '../theme';

export interface FadeInViewProps {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  /** Vertical travel in px (kept small — the app breathes, it doesn't fly). */
  rise?: number;
  duration?: number;
}

export function FadeInView({
  children,
  style,
  rise = 6,
  duration = motion.duration.short,
}: FadeInViewProps) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration,
      easing: Easing.bezier(...motion.bezier.enter),
      useNativeDriver: true,
    }).start();
  }, [progress, duration]);

  return (
    <Animated.View
      style={[
        ...(Array.isArray(style) ? style : style ? [style] : []),
        {
          opacity: progress,
          transform: [
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [rise, 0] }) },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
