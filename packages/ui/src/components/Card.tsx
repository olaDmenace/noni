import React, { ReactNode } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { colors, radius, spacing } from '../theme';

export interface CardProps {
  children: ReactNode;
  variant?: 'default' | 'elevated' | 'muted';
  padding?: keyof typeof spacing | 'none';
  style?: ViewStyle | ViewStyle[];
}

export function Card({ children, variant = 'default', padding = 'lg', style }: CardProps) {
  const bg =
    variant === 'elevated'
      ? colors.surfaceElev
      : variant === 'muted'
        ? colors.surfaceMuted
        : colors.surface;
  const pad = padding === 'none' ? 0 : spacing[padding];
  return (
    <View
      style={[
        styles.base,
        {
          backgroundColor: bg,
          padding: pad,
          borderColor: variant === 'elevated' ? colors.borderStrong : colors.border,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    borderWidth: 1,
  },
});
