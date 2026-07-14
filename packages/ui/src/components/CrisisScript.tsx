// S-003 — Crisis response script shown to the agent after flagging.
// Agents are trained but under stress they need a concrete script to follow.
// Content co-authored with MANI Nigeria; review quarterly.
import React from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme';

export interface CrisisScriptProps {
  visible: boolean;
  onClose: () => void;
}

const MANI = '08111909090';

function dialMani() {
  void Linking.openURL(`tel:${MANI}`);
}

const SCRIPT_STEPS: Array<{ title: string; body: string }> = [
  {
    title: '1 · Stay',
    body:
      "Do not end the session. Your presence matters more than your words. Breathe. You are not alone — a supervisor has been alerted.",
  },
  {
    title: '2 · Validate',
    body:
      'Say: "I hear you. What you\'re feeling is real. I\'m glad you told me." Do not minimize, argue, or try to solve.',
  },
  {
    title: '3 · Ask if they are safe right now',
    body:
      'Say: "Are you safe right now? Is there anyone near you?" Listen. If they are in immediate danger, move to step 4.',
  },
  {
    title: '4 · Share the emergency numbers',
    body:
      'Say: "I want to give you a number. MANI Nigeria has trained crisis responders available 24/7. Would it be okay if I shared it?"',
  },
  {
    title: '5 · Stay present until a supervisor joins',
    body:
      'Keep the session open. Let silences be. If they want to stop talking, that is okay — but do not disconnect first.',
  },
];

export function CrisisScript({ visible, onClose }: CrisisScriptProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.scrim}>
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.ribbon}>
              <Text style={styles.ribbonText}>Crisis script</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={styles.close}>Close</Text>
            </Pressable>
          </View>

          <Text style={styles.heading}>
            Stay with <Text style={styles.headingItalic}>them</Text>.
          </Text>
          <Text style={styles.subheading}>
            A supervisor has been alerted. Follow these steps. You don&apos;t have to do this alone.
          </Text>

          <ScrollView style={styles.scroll} contentContainerStyle={{ gap: spacing.md }}>
            {SCRIPT_STEPS.map((step) => (
              <View key={step.title} style={styles.step}>
                <Text style={styles.stepTitle}>{step.title}</Text>
                <Text style={styles.stepBody}>{step.body}</Text>
              </View>
            ))}

            <Pressable onPress={dialMani} style={({ pressed }) => [styles.mani, pressed && styles.maniPressed]}>
              <Text style={styles.maniLabel}>MANI Nigeria — call supervisor line</Text>
              <Text style={styles.maniNumber}>0811 190 9090</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(14, 11, 10, 0.92)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.crisisSoft,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    maxHeight: '90%',
    gap: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ribbon: {
    backgroundColor: colors.crisisSoft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  ribbonText: {
    ...typography.label,
    color: colors.crisis,
  },
  close: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '600',
  },
  heading: {
    ...typography.display,
    color: colors.text,
    fontSize: 28,
    lineHeight: 32,
    marginTop: spacing.sm,
  },
  headingItalic: {
    fontFamily: 'Fraunces-Italic',
    color: colors.emphasis,
  },
  subheading: {
    ...typography.body,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  scroll: {
    flexGrow: 0,
  },
  step: {
    backgroundColor: colors.surfaceElev,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  stepTitle: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  stepBody: {
    ...typography.body,
    color: colors.textMuted,
    lineHeight: 22,
  },
  mani: {
    backgroundColor: colors.crisisSoft,
    borderColor: colors.crisis,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  maniPressed: {
    opacity: 0.85,
  },
  maniLabel: {
    ...typography.caption,
    color: colors.crisis,
    fontWeight: '600',
  },
  maniNumber: {
    ...typography.mono,
    color: colors.text,
    fontSize: 20,
    marginTop: 4,
  },
});
