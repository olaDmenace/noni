// F-032 — app-wide incoming session requests.
//
// Mounted once inside the authenticated tree. Owns the socket lifetime
// (connect on login, disconnect on logout) and listens on the agent's
// personal room for `session_assigned`. Shows a full-screen offer with a
// live countdown; expiry auto-dismisses (the server reassigns). Missed
// offers are still reachable from the dashboard queue list.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { WsSessionAssignedEvent } from '@noni/types';
import { colors, radius, spacing, typography, useToast } from '@noni/ui';
import { api } from '../api/client';
import { navigationRef } from '../navigation/navigationRef';
import { SESSION_TYPE_LABEL, TIER_LABEL } from '../utils/labels';
import { connectSocket, disconnectSocket } from './socket';

interface Offer extends WsSessionAssignedEvent {
  receivedAt: number;
}

export function IncomingSessionGate() {
  const qc = useQueryClient();
  const toast = useToast();
  const [offer, setOffer] = useState<Offer | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Socket lives for the whole authenticated session (F-029).
  useEffect(() => {
    const socket = connectSocket();
    if (!socket) return;
    const onAssigned = (event: WsSessionAssignedEvent) => {
      setOffer({ ...event, receivedAt: Date.now() });
      setNow(Date.now());
      void qc.invalidateQueries({ queryKey: ['agentQueue'] });
    };
    socket.on('session_assigned', onAssigned);
    return () => {
      socket.off('session_assigned', onAssigned);
      disconnectSocket();
    };
  }, [qc]);

  // Countdown tick while an offer is showing.
  useEffect(() => {
    if (!offer) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [offer]);

  const remaining = offer
    ? Math.max(0, offer.acceptWindowSecs - Math.floor((now - offer.receivedAt) / 1000))
    : 0;

  // Window expired — the server reassigns; quietly drop the offer.
  useEffect(() => {
    if (offer && remaining <= 0) {
      setOffer(null);
      void qc.invalidateQueries({ queryKey: ['agentQueue'] });
    }
  }, [offer, remaining, qc]);

  const accept = useMutation({
    mutationFn: (sessionId: string) => api.acceptSession(sessionId),
    onSuccess: (session) => {
      setOffer(null);
      void qc.invalidateQueries({ queryKey: ['agentQueue'] });
      if (navigationRef.isReady()) {
        navigationRef.navigate('Session', { sessionId: session.id });
      }
    },
    onError: (err) => {
      setOffer(null);
      void qc.invalidateQueries({ queryKey: ['agentQueue'] });
      toast.error(err instanceof Error ? err.message : 'It may have been reassigned', 'Could not accept');
    },
  });

  const pass = useMutation({
    mutationFn: (sessionId: string) => api.passSession(sessionId),
    onSettled: () => {
      setOffer(null);
      void qc.invalidateQueries({ queryKey: ['agentQueue'] });
    },
  });

  const busy = accept.isPending || pass.isPending;

  return (
    <Modal
      visible={offer !== null}
      transparent
      animationType="fade"
      onRequestClose={() => undefined}
    >
      {offer ? (
        <View style={styles.scrim}>
          <View style={styles.card}>
            <Text style={styles.label}>Incoming session</Text>
            <Text style={styles.heading}>
              Someone is <Text style={styles.headingItalic}>waiting</Text>.
            </Text>

            <View style={styles.chipRow}>
              <View style={[styles.chip, styles.chipPrimary]}>
                <Text style={styles.chipPrimaryText}>{TIER_LABEL[offer.tier]}</Text>
              </View>
              <View style={styles.chip}>
                <Text style={styles.chipText}>{SESSION_TYPE_LABEL[offer.sessionType]}</Text>
              </View>
              {offer.isPriority ? (
                <View style={[styles.chip, styles.chipPriority]}>
                  <Text style={styles.chipPriorityText}>Priority</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.countdownBlock}>
              <Text style={styles.countdown}>{remaining}</Text>
              <Text style={styles.countdownHint}>
                seconds to respond — after that it moves on
              </Text>
            </View>

            <Pressable
              onPress={() => accept.mutate(offer.sessionId)}
              disabled={busy}
              style={({ pressed }) => [
                styles.accept,
                (pressed || busy) && styles.pressed,
              ]}
            >
              <Text style={styles.acceptText}>
                {accept.isPending ? 'Accepting…' : 'Accept session'}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => pass.mutate(offer.sessionId)}
              disabled={busy}
              style={({ pressed }) => [styles.pass, (pressed || busy) && styles.pressed]}
            >
              <Text style={styles.passText}>{pass.isPending ? 'Passing…' : 'Pass'}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(14, 11, 10, 0.94)',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  card: {
    backgroundColor: colors.surfaceElev,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: spacing.xl,
    gap: spacing.md,
  },
  label: { ...typography.label, color: colors.textDim },
  heading: { ...typography.display, color: colors.text, fontSize: 28, lineHeight: 34 },
  headingItalic: { fontFamily: 'Fraunces-Italic', color: colors.emphasis },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipText: { ...typography.caption, color: colors.textMuted },
  chipPrimary: { backgroundColor: colors.primaryMuted, borderColor: colors.primaryGlow },
  chipPrimaryText: { ...typography.caption, color: colors.primary, fontWeight: '600' },
  chipPriority: { backgroundColor: colors.emphasisMuted, borderColor: 'transparent' },
  chipPriorityText: { ...typography.caption, color: colors.emphasis, fontWeight: '600' },
  countdownBlock: { alignItems: 'center', marginVertical: spacing.sm },
  countdown: {
    fontFamily: 'Geist-Medium',
    fontSize: 56,
    lineHeight: 62,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  countdownHint: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs },
  accept: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  acceptText: { ...typography.bodyStrong, color: colors.primaryInk },
  pass: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  passText: { ...typography.body, color: colors.textMuted },
  pressed: { opacity: 0.85 },
});
