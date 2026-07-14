import React, { forwardRef, useState } from 'react';
import { StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle } from 'react-native';
import { colors, radius, spacing, typography } from '../theme';

export interface InputProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  hint?: string;
  error?: string;
  mono?: boolean;
  containerStyle?: ViewStyle;
  style?: TextInputProps['style'];
}

export const Input = forwardRef<TextInput, InputProps>(function Input(
  { label, hint, error, mono, containerStyle, style, onFocus, onBlur, ...rest },
  ref
) {
  const [focused, setFocused] = useState(false);
  const borderColor = error
    ? colors.danger
    : focused
      ? colors.primary
      : colors.borderStrong;

  return (
    <View style={containerStyle}>
      {label ? (
        <Text style={[typography.label, styles.label]}>{label}</Text>
      ) : null}
      <TextInput
        ref={ref}
        placeholderTextColor={colors.textDim}
        {...rest}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          styles.input,
          mono ? typography.mono : typography.body,
          { color: colors.text, borderColor },
          style,
        ]}
      />
      {error ? (
        <Text style={[typography.caption, styles.error]}>{error}</Text>
      ) : hint ? (
        <Text style={[typography.caption, styles.hint]}>{hint}</Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  label: { color: colors.textDim, marginBottom: spacing.sm },
  input: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  hint: { color: colors.textDim, marginTop: spacing.sm },
  error: { color: colors.danger, marginTop: spacing.sm },
});
