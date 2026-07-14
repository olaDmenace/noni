import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, Text, View } from 'react-native';
import type { WsAgentJoinedEvent, WsQueueUpdateEvent, WsSessionEndEvent } from '@noni/types';
import { Screen, colors, radius, spacing, typography, useToast } from '@noni/ui';
import { api } from '../../api/client';
import { getSocket } from '../../realtime/socket';
import { formatDuration } from '../../utils/formatters';
import type { AppStackParamList } from '../../navigation/RootNavigator';

type Props = NativeStackScreenProps<AppStackParamList, 'Queue'>;

export function QueueScreen({ route, navigation }: Props) {
  const { sessionId } = route.params;
  const toast = useToast();
  const outer = useRef(new Animated.Value(0.8)).current;
  const inner = useRef(new Animated.Value(0)).current;
  const [position, setPosition] = useState<number | null>(null);
  const [waitSecs, setWaitSecs] = useState<number | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const leavingRef = useRef(false);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(outer, {
            toValue: 1.15,
            duration: 2400,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(outer, {
            toValue: 0.8,
            duration: 2400,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(inner, {
            toValue: 1,
            duration: 1200,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(inner, {
            toValue: 0,
            duration: 3600,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [outer, inner]);

  // Live queue updates over the socket.
  useEffect(() => {
    const socket = getSocket();

    const onQueueUpdate = (e: WsQueueUpdateEvent) => {
      setPosition(e.position);
      setWaitSecs(e.estimatedWaitSecs);
    };
    const onAgentJoined = (e: WsAgentJoinedEvent) => {
      if (leavingRef.current) return;
      leavingRef.current = true;
      navigation.replace('HumanSession', {
        sessionId,
        agentAlias: e.agentAlias,
        sessionType: e.sessionType,
      });
    };
    const onSessionEnd = (_e: WsSessionEndEvent) => {
      if (leavingRef.current) return;
      leavingRef.current = true;
      toast.info('No listener could join this time. Your wallet was refunded.', 'Session ended');
      navigation.navigate('Tabs');
    };
    const onErrorEvent = (e: { code: string }) => {
      toast.error(e.code, 'Something went wrong');
    };

    socket.emit('subscribe_queue', { sessionId });
    socket.on('queue_update', onQueueUpdate);
    socket.on('agent_joined', onAgentJoined);
    socket.on('session_end', onSessionEnd);
    socket.on('error_event', onErrorEvent);

    return () => {
      socket.emit('unsubscribe_queue', { sessionId });
      socket.off('queue_update', onQueueUpdate);
      socket.off('agent_joined', onAgentJoined);
      socket.off('session_end', onSessionEnd);
      socket.off('error_event', onErrorEvent);
    };
  }, [sessionId, navigation, toast]);

  // Tick the estimated wait down between server updates.
  useEffect(() => {
    if (waitSecs === null || waitSecs <= 0) return;
    const t = setInterval(() => {
      setWaitSecs((s) => (s === null || s <= 0 ? s : s - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [waitSecs]);

  async function onCancel() {
    if (cancelling || leavingRef.current) return;
    setCancelling(true);
    try {
      await api.endSession(sessionId);
      leavingRef.current = true;
      toast.info('No charge — your wallet was refunded.', 'Session cancelled');
      navigation.navigate('Tabs');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Try again', 'Could not cancel');
    } finally {
      setCancelling(false);
    }
  }

  return (
    <Screen>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 200, height: 200, alignItems: 'center', justifyContent: 'center' }}>
          <Animated.View
            style={{
              position: 'absolute',
              width: 200,
              height: 200,
              borderRadius: 100,
              backgroundColor: colors.primaryMuted,
              transform: [{ scale: outer }],
            }}
          />
          <Animated.View
            style={{
              position: 'absolute',
              width: 120,
              height: 120,
              borderRadius: 60,
              backgroundColor: colors.primaryGlow,
              opacity: inner.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0.9] }),
              transform: [
                {
                  scale: inner.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.05] }),
                },
              ],
            }}
          />
          <View
            style={{
              width: 16,
              height: 16,
              borderRadius: 8,
              backgroundColor: colors.primary,
            }}
          />
        </View>

        <Text
          style={{
            ...typography.title,
            color: colors.text,
            marginTop: spacing.xxl,
            textAlign: 'center',
          }}
        >
          Finding a listener
        </Text>
        <Text
          style={{
            ...typography.body,
            color: colors.textMuted,
            marginTop: spacing.sm,
            textAlign: 'center',
            maxWidth: 280,
          }}
        >
          Someone is about to join. Take a breath. It won&apos;t be long.
        </Text>

        <View
          style={{
            marginTop: spacing.xxl,
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.md,
            backgroundColor: colors.surfaceElev,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: 'center',
            minWidth: 220,
          }}
        >
          {position === null ? (
            <Text style={{ ...typography.caption, color: colors.textMuted }}>
              Joining the queue…
            </Text>
          ) : (
            <>
              <Text style={{ ...typography.label, color: colors.textDim }}>
                {position <= 1 ? 'You are next' : `Position ${position} in queue`}
              </Text>
              <Text
                style={{
                  ...typography.mono,
                  fontSize: 28,
                  lineHeight: 34,
                  color: colors.text,
                  marginTop: spacing.sm,
                }}
              >
                {formatDuration(Math.max(0, waitSecs ?? 0))}
              </Text>
              <Text style={{ ...typography.caption, color: colors.textMuted, marginTop: 2 }}>
                estimated wait
              </Text>
            </>
          )}
        </View>

        <Pressable
          onPress={onCancel}
          disabled={cancelling}
          style={({ pressed }) => ({
            marginTop: spacing.xxl,
            paddingVertical: spacing.md,
            paddingHorizontal: spacing.xl,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: colors.border,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text style={{ ...typography.body, color: colors.textMuted }}>
            {cancelling ? 'Cancelling…' : 'Cancel — full refund'}
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}
