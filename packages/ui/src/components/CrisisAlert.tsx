// S-002 — Crisis alert overlay. Held, not alarmed.
// Muted red per DESIGN.md crisis palette. Two hotlines tap-to-call.
// Free escalation CTA navigates caller out of current session toward a listener.
import React from 'react';
import { Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme';

export interface CrisisAlertProps {
  visible: boolean;
  onEscalate: () => void;
  onDismiss: () => void;
  message?: string;
}

const MANI = '08111909090';
const SPLN = '08062106493'; // Suicide Prevention Lifeline Nigeria

function dial(number: string) {
  const sanitized = number.replace(/\s+/g, '');
  void Linking.openURL(`tel:${sanitized}`);
}

export function CrisisAlert({ visible, onEscalate, onDismiss, message }: CrisisAlertProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.scrim}>
        <View style={styles.card}>
          <View style={styles.ribbon}>
            <Text style={styles.ribbonText}>You are not alone</Text>
          </View>

          <Text style={styles.heading}>
            I&apos;m <Text style={styles.headingItalic}>here</Text>.
          </Text>

          <Text style={styles.body}>
            {message ??
              "What you're feeling matters. Please reach one of these lines right now, or let me bring in a trained listener."}
          </Text>

          <Pressable onPress={() => dial(MANI)} style={({ pressed }) => [styles.line, pressed && styles.linePressed]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.lineLabel}>MANI Nigeria</Text>
              <Text style={styles.lineNumber}>0811 190 9090</Text>
            </View>
            <Text style={styles.lineAction}>Call</Text>
          </Pressable>

          <Pressable onPress={() => dial(SPLN)} style={({ pressed }) => [styles.line, pressed && styles.linePressed]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.lineLabel}>Suicide Prevention Lifeline</Text>
              <Text style={styles.lineNumber}>0806 210 6493</Text>
            </View>
            <Text style={styles.lineAction}>Call</Text>
          </Pressable>

          <Pressable
            onPress={onEscalate}
            style={({ pressed }) => [styles.primary, pressed && styles.primaryPressed]}
          >
            <Text style={styles.primaryLabel}>Talk to a trained listener now</Text>
            <Text style={styles.primarySub}>Free — no charge for this call</Text>
          </Pressable>

          <Pressable onPress={onDismiss} hitSlop={12}>
            <Text style={styles.secondary}>Stay with Noni AI</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(14, 11, 10, 0.92)',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.crisisSoft,
    padding: spacing.xl,
    gap: spacing.md,
  },
  ribbon: {
    alignSelf: 'flex-start',
    backgroundColor: colors.crisisSoft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  ribbonText: {
    ...typography.label,
    color: colors.crisis,
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
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceElev,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  linePressed: {
    opacity: 0.85,
  },
  lineLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
  lineNumber: {
    ...typography.mono,
    color: colors.text,
    marginTop: 2,
  },
  lineAction: {
    ...typography.body,
    color: colors.crisis,
    fontWeight: '600',
  },
  primary: {
    marginTop: spacing.sm,
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  primaryPressed: {
    opacity: 0.88,
  },
  primaryLabel: {
    ...typography.body,
    color: colors.primaryInk,
    fontWeight: '600',
  },
  primarySub: {
    ...typography.caption,
    color: colors.primaryInk,
    opacity: 0.75,
    marginTop: 2,
  },
  secondary: {
    ...typography.caption,
    color: colors.textDim,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
});
