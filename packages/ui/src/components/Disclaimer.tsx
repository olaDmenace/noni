// S-004 — Mandatory disclaimer shown on every session open.
// One-tap dismiss. Cannot be permanently silenced.
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme';

export interface DisclaimerProps {
  visible: boolean;
  onDismiss: () => void;
}

export function Disclaimer({ visible, onDismiss }: DisclaimerProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.scrim}>
        <View style={styles.card}>
          <Text style={styles.eyebrow}>Before we begin</Text>
          <Text style={styles.heading}>
            A quick <Text style={styles.headingItalic}>note</Text>.
          </Text>
          <Text style={styles.body}>
            Noni is peer support, not medical treatment. We&apos;re here to listen.
          </Text>
          <Text style={styles.bodyStrong}>
            For emergencies, call <Text style={styles.mono}>112</Text> or MANI on{' '}
            <Text style={styles.mono}>0811 190 9090</Text>.
          </Text>
          <Pressable onPress={onDismiss} style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}>
            <Text style={styles.ctaLabel}>I understand</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(14, 11, 10, 0.85)',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    gap: spacing.md,
  },
  eyebrow: {
    ...typography.label,
    color: colors.textDim,
  },
  heading: {
    ...typography.display,
    color: colors.text,
    fontSize: 28,
    lineHeight: 32,
  },
  headingItalic: {
    fontFamily: 'Fraunces-Italic',
    color: colors.emphasis,
  },
  body: {
    ...typography.body,
    color: colors.textMuted,
  },
  bodyStrong: {
    ...typography.body,
    color: colors.text,
  },
  mono: {
    ...typography.mono,
    color: colors.text,
  },
  cta: {
    marginTop: spacing.md,
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  ctaPressed: {
    opacity: 0.88,
  },
  ctaLabel: {
    ...typography.body,
    color: colors.primaryInk,
    fontWeight: '600',
  },
});
