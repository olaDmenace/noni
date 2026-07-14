import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Card, Screen, colors, radius, spacing, typography, useToast } from '@noni/ui';
import { api } from '../../api/client';
import type { AppStackParamList, AppTabParamList } from '../../navigation/RootNavigator';

type Props = CompositeScreenProps<
  BottomTabScreenProps<AppTabParamList, 'Home'>,
  NativeStackScreenProps<AppStackParamList>
>;

export function HomeScreen({ navigation }: Props) {
  const toast = useToast();

  async function startAi() {
    try {
      const { sessionId } = await api.startAiSession();
      navigation.navigate('AiChat', { sessionId });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Try again', 'Could not start session');
    }
  }

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'space-between' }}>
        <View style={{ marginTop: spacing.xl }}>
          <Text style={{ ...typography.label, color: colors.textDim }}>A quiet room</Text>
          <Text
            style={{
              ...typography.display,
              color: colors.text,
              marginTop: spacing.sm,
            }}
          >
            How are you{'\n'}feeling?
          </Text>
          <Text
            style={{
              ...typography.body,
              color: colors.textMuted,
              marginTop: spacing.md,
            }}
          >
            Pick how you&apos;d like to talk today. Start anywhere. Even the smallest thing.
          </Text>
        </View>

        <View style={{ gap: spacing.md }}>
          <Pressable
            onPress={startAi}
            style={({ pressed }) => [
              {
                backgroundColor: colors.primary,
                borderRadius: radius.md,
                paddingVertical: spacing.lg,
                paddingHorizontal: spacing.lg,
                opacity: pressed ? 0.9 : 1,
              },
            ]}
          >
            <Text
              style={{
                ...typography.caption,
                color: colors.primaryInk,
                opacity: 0.7,
                letterSpacing: 1.2,
                textTransform: 'uppercase',
              }}
            >
              Free
            </Text>
            <Text
              style={{
                ...typography.headline,
                color: colors.primaryInk,
                marginTop: 4,
                fontWeight: '600',
              }}
            >
              Talk to Noni AI
            </Text>
            <Text
              style={{
                ...typography.caption,
                color: colors.primaryInk,
                opacity: 0.75,
                marginTop: 2,
              }}
            >
              A warm-up. Gets you to the feeling underneath.
            </Text>
          </Pressable>

          <Pressable onPress={() => navigation.navigate('Agents')}>
            <Card variant="elevated">
              <Text
                style={{
                  ...typography.caption,
                  color: colors.secondary,
                  letterSpacing: 1.2,
                  textTransform: 'uppercase',
                }}
              >
                From ₦100
              </Text>
              <Text
                style={{
                  ...typography.headline,
                  color: colors.text,
                  marginTop: 4,
                  fontWeight: '600',
                }}
              >
                Bring in a listener
              </Text>
              <Text
                style={{
                  ...typography.caption,
                  color: colors.textMuted,
                  marginTop: 2,
                }}
              >
                A real person who&apos;s trained to hold space.
              </Text>
            </Card>
          </Pressable>

          <Text
            style={{
              ...typography.caption,
              color: colors.textDim,
              textAlign: 'center',
              marginTop: spacing.sm,
            }}
          >
            Noni is peer support, not medical treatment.{'\n'}
            For emergencies, call 112 or MANI 0811 190 9090.
          </Text>
        </View>
      </View>
    </Screen>
  );
}
