// S-005 — Block + report bottom sheet.
// Opened from a matched user-agent session. Quiet copy. Non-punitive framing.
// The parent owns the API calls; this component only gathers intent and reason.
import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme';

export type ReportReason = 'MISCONDUCT' | 'INAPPROPRIATE' | 'UNSAFE' | 'OTHER';

const REASONS: Array<{ value: ReportReason; label: string; hint: string }> = [
  { value: 'UNSAFE', label: 'I feel unsafe', hint: 'They said or did something that scared me.' },
  {
    value: 'INAPPROPRIATE',
    label: 'Inappropriate behaviour',
    hint: 'Flirting, boundary-crossing, or off-topic.',
  },
  {
    value: 'MISCONDUCT',
    label: 'Breaking platform rules',
    hint: "Pretending to be a clinician, sharing contact info, etc.",
  },
  { value: 'OTHER', label: 'Something else', hint: 'Tell us in your own words.' },
];

export interface BlockReportSheetProps {
  visible: boolean;
  onClose: () => void;
  onBlock: () => void | Promise<void>;
  onReport: (
    reason: ReportReason,
    details: string | undefined,
    includeEvidence: boolean,
  ) => void | Promise<void>;
  // Number of chat messages available to attach as consented evidence (S-005).
  // 0 / undefined hides the opt-in entirely. Nothing leaves the device unless
  // the reporter switches it on — it defaults to off.
  evidenceMessageCount?: number;
}

type View_ = 'root' | 'report';

export function BlockReportSheet({
  visible,
  onClose,
  onBlock,
  onReport,
  evidenceMessageCount = 0,
}: BlockReportSheetProps) {
  const [view, setView] = useState<View_>('root');
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [includeEvidence, setIncludeEvidence] = useState(false);
  const [busy, setBusy] = useState(false);

  function reset() {
    setView('root');
    setReason(null);
    setDetails('');
    setIncludeEvidence(false);
    setBusy(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleBlock() {
    setBusy(true);
    try {
      await onBlock();
      handleClose();
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmitReport() {
    if (!reason) return;
    setBusy(true);
    try {
      await onReport(reason, details.trim() || undefined, includeEvidence);
      handleClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.scrim}>
        <View style={styles.sheet}>
          <View style={styles.handle} />

          {view === 'root' ? (
            <>
              <Text style={styles.heading}>Need to step away?</Text>
              <Text style={styles.body}>
                You can end this session immediately, and we won&apos;t charge you. If the listener
                crossed a line, tell us and we&apos;ll review within 24 hours.
              </Text>

              <Pressable
                onPress={handleBlock}
                disabled={busy}
                style={({ pressed }) => [styles.primary, pressed && styles.primaryPressed]}
              >
                <Text style={styles.primaryLabel}>
                  {busy ? 'Ending…' : 'End session and block this listener'}
                </Text>
                <Text style={styles.primarySub}>You won&apos;t be matched with them again.</Text>
              </Pressable>

              <Pressable
                onPress={() => setView('report')}
                style={({ pressed }) => [styles.secondary, pressed && { opacity: 0.85 }]}
              >
                <Text style={styles.secondaryLabel}>Report a concern</Text>
              </Pressable>

              <Pressable onPress={handleClose} hitSlop={12}>
                <Text style={styles.cancel}>Go back</Text>
              </Pressable>
            </>
          ) : (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ gap: spacing.md }}
            >
              <Text style={styles.heading}>What happened?</Text>
              <Text style={styles.body}>
                Pick what fits closest. A human reviewer reads every report.
              </Text>

              {REASONS.map((r) => {
                const selected = reason === r.value;
                return (
                  <Pressable
                    key={r.value}
                    onPress={() => setReason(r.value)}
                    style={[styles.reasonCard, selected && styles.reasonCardSelected]}
                  >
                    <Text style={[styles.reasonLabel, selected && styles.reasonLabelSelected]}>
                      {r.label}
                    </Text>
                    <Text style={styles.reasonHint}>{r.hint}</Text>
                  </Pressable>
                );
              })}

              <TextInput
                value={details}
                onChangeText={setDetails}
                placeholder="Anything else you want us to know (optional)"
                placeholderTextColor={colors.textDim}
                multiline
                style={styles.textarea}
              />

              {evidenceMessageCount > 0 && (
                <Pressable
                  onPress={() => setIncludeEvidence((v) => !v)}
                  style={[styles.reasonCard, includeEvidence && styles.reasonCardSelected]}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                    <View style={[styles.checkbox, includeEvidence && styles.checkboxOn]}>
                      {includeEvidence && <Text style={styles.checkboxTick}>✓</Text>}
                    </View>
                    <Text style={[styles.reasonLabel, { flex: 1 }]}>
                      Include this chat as evidence
                    </Text>
                  </View>
                  <Text style={styles.reasonHint}>
                    Shares the last {Math.min(evidenceMessageCount, 50)} messages with the
                    reviewer, encrypted. Deleted when the review closes. Nothing is shared
                    unless you turn this on — we never keep chats otherwise.
                  </Text>
                </Pressable>
              )}

              <Pressable
                onPress={handleSubmitReport}
                disabled={!reason || busy}
                style={({ pressed }) => [
                  styles.primary,
                  (!reason || busy) && { opacity: 0.5 },
                  pressed && styles.primaryPressed,
                ]}
              >
                <Text style={styles.primaryLabel}>{busy ? 'Sending…' : 'Send report'}</Text>
                <Text style={styles.primarySub}>Reviewed within 24 hours.</Text>
              </Pressable>

              <Pressable onPress={() => setView('root')} hitSlop={12}>
                <Text style={styles.cancel}>Back</Text>
              </Pressable>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(14, 11, 10, 0.85)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    maxHeight: '85%',
    gap: spacing.md,
  },
  handle: {
    width: 44,
    height: 4,
    backgroundColor: colors.borderStrong,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: spacing.sm,
  },
  heading: {
    ...typography.title,
    color: colors.text,
  },
  body: {
    ...typography.body,
    color: colors.textMuted,
  },
  primary: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    alignItems: 'center',
    marginTop: spacing.sm,
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
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  secondaryLabel: {
    ...typography.body,
    color: colors.text,
  },
  cancel: {
    ...typography.caption,
    color: colors.textDim,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  reasonCard: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElev,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 4,
  },
  reasonCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryMuted,
  },
  reasonLabel: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  reasonLabelSelected: {
    color: colors.text,
  },
  reasonHint: {
    ...typography.caption,
    color: colors.textMuted,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkboxTick: {
    color: colors.primaryInk,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 15,
  },
  textarea: {
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.surfaceElev,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 80,
  },
});
