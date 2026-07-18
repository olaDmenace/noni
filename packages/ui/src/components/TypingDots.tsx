// "…typing" indicator — three dots breathing in sequence.
// Motion per DESIGN.md: deep-breath pace, no springs. Each dot fades on a
// staggered loop; nothing bounces, nothing travels.
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Text, View } from 'react-native';
import { colors, motion, spacing, typography } from '../theme';

const DOT_COUNT = 3;
const DOT_STAGGER_MS = 180;

export interface TypingDotsProps {
  /** Optional quiet label, e.g. "Noni is typing". */
  label?: string;
  color?: string;
  /** Render the dots before the label ("…listening") instead of after. */
  dotsFirst?: boolean;
}

export function TypingDots({ label, color = colors.textMuted, dotsFirst = false }: TypingDotsProps) {
  const dots = useRef(
    Array.from({ length: DOT_COUNT }, () => new Animated.Value(0.25)),
  ).current;

  useEffect(() => {
    const loops = dots.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * DOT_STAGGER_MS),
          Animated.timing(v, {
            toValue: 1,
            duration: motion.duration.medium,
            easing: Easing.bezier(...motion.bezier.enter),
            useNativeDriver: true,
          }),
          Animated.timing(v, {
            toValue: 0.25,
            duration: motion.duration.medium,
            easing: Easing.bezier(...motion.bezier.exit),
            useNativeDriver: true,
          }),
          Animated.delay((DOT_COUNT - 1 - i) * DOT_STAGGER_MS),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [dots]);

  const labelNode = label ? <Text style={{ ...typography.caption, color }}>{label}</Text> : null;
  const dotsNode = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      {dots.map((v, i) => (
        <Animated.View
          key={i}
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: color,
            opacity: v,
          }}
        />
      ))}
    </View>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      {dotsFirst ? dotsNode : labelNode}
      {dotsFirst ? labelNode : dotsNode}
    </View>
  );
}
