import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import type { SessionType } from '@noni/types';
import { colors, fonts } from '@noni/ui';
import { api } from '../api/client';
import { useAuthStore } from '../stores/authStore';
import { WelcomeScreen } from '../screens/onboarding/WelcomeScreen';
import { HowItWorksScreen } from '../screens/onboarding/HowItWorksScreen';
import { OtpScreen } from '../screens/onboarding/OtpScreen';
import { PreferencesScreen } from '../screens/onboarding/PreferencesScreen';
import { HomeScreen } from '../screens/home/HomeScreen';
import { AgentListScreen } from '../screens/agents/AgentListScreen';
import { AiChatScreen } from '../screens/session/AiChatScreen';
import { QueueScreen } from '../screens/session/QueueScreen';
import { HumanSessionScreen } from '../screens/session/HumanSessionScreen';
import { ScheduleScreen } from '../screens/session/ScheduleScreen';
import { WalletScreen } from '../screens/payments/WalletScreen';
import { SubscriptionScreen } from '../screens/payments/SubscriptionScreen';
import { SettingsScreen } from '../screens/settings/SettingsScreen';
import { SafeguardingScreen } from '../screens/settings/SafeguardingScreen';
import { LockScreen } from '../screens/settings/LockScreen';
import { PinScreen } from '../screens/settings/PinScreen';

export type AuthStackParamList = {
  Welcome: undefined;
  HowItWorks: { phone: string };
  Otp: { phone: string };
};

export type AppTabParamList = {
  Home: undefined;
  Agents: undefined;
  Wallet: undefined;
  Settings: undefined;
};

export type AppStackParamList = {
  Tabs: undefined;
  AiChat: { sessionId: string };
  Queue: { sessionId: string };
  HumanSession: { sessionId: string; agentAlias: string; sessionType: SessionType };
  Schedule: { agentId: string; agentAlias: string; sessionTypes: SessionType[] };
  Subscription: undefined;
  SetPin: undefined;
  Safeguarding: undefined;
};

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const AppStack = createNativeStackNavigator<AppStackParamList>();
const Tabs = createBottomTabNavigator<AppTabParamList>();

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false, animation: 'fade', animationDuration: 250 }}>
      <AuthStack.Screen name="Welcome" component={WelcomeScreen} />
      <AuthStack.Screen name="HowItWorks" component={HowItWorksScreen} />
      <AuthStack.Screen name="Otp" component={OtpScreen} />
    </AuthStack.Navigator>
  );
}

function AppTabs() {
  return (
    <Tabs.Navigator
      screenOptions={{
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 64,
          paddingTop: 6,
          paddingBottom: 8,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: {
          fontFamily: fonts.bodyMedium,
          fontSize: 11,
          letterSpacing: 0.3,
          marginTop: 2,
        },
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerTitleStyle: { fontFamily: fonts.display, fontSize: 20 },
      }}
    >
      <Tabs.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarIcon: ({ color, size }) => <Feather name="home" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="Agents"
        component={AgentListScreen}
        options={{
          tabBarIcon: ({ color, size }) => <Feather name="users" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="Wallet"
        component={WalletScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Feather name="credit-card" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarIcon: ({ color, size }) => <Feather name="settings" size={size} color={color} />,
        }}
      />
    </Tabs.Navigator>
  );
}

function AppNavigator() {
  return (
    <AppStack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right', animationDuration: 250 }}>
      <AppStack.Screen name="Tabs" component={AppTabs} />
      <AppStack.Screen name="AiChat" component={AiChatScreen} />
      <AppStack.Screen name="Queue" component={QueueScreen} options={{ headerShown: true, title: 'Finding a listener' }} />
      <AppStack.Screen name="HumanSession" component={HumanSessionScreen} />
      <AppStack.Screen
        name="Schedule"
        component={ScheduleScreen}
        options={{
          headerShown: true,
          title: 'Book ahead',
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerTitleStyle: { fontFamily: fonts.display, fontSize: 20 },
        }}
      />
      <AppStack.Screen
        name="Subscription"
        component={SubscriptionScreen}
        options={{
          headerShown: true,
          title: 'Monthly plans',
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerTitleStyle: { fontFamily: fonts.display, fontSize: 20 },
        }}
      />
      <AppStack.Screen
        name="SetPin"
        component={PinScreen}
        options={{
          headerShown: true,
          title: 'App lock',
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerTitleStyle: { fontFamily: fonts.display, fontSize: 20 },
        }}
      />
      <AppStack.Screen name="Safeguarding" component={SafeguardingScreen} />
    </AppStack.Navigator>
  );
}

function Loading() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

// Post-login gate: PIN lock once per launch (if set), then the first-login
// tier-preference pick (F-003), then the app proper.
function AppGate() {
  const [unlocked, setUnlocked] = useState(false);
  const storeUser = useAuthStore((s) => s.user);
  const meQuery = useQuery({ queryKey: ['me'], queryFn: () => api.me() });

  if (meQuery.isLoading) return <Loading />;

  const me = meQuery.data;
  if (me?.hasPin && !unlocked) {
    return <LockScreen onUnlocked={() => setUnlocked(true)} />;
  }

  const tierPreference = storeUser?.tierPreference ?? me?.tierPreference ?? null;
  if (me && tierPreference === null) {
    return <PreferencesScreen />;
  }

  return <AppNavigator />;
}

export function RootNavigator() {
  const hydrated = useAuthStore((s) => s.hydrated);
  const accessToken = useAuthStore((s) => s.accessToken);
  const hydrate = useAuthStore((s) => s.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  if (!hydrated) return <Loading />;

  return accessToken ? <AppGate /> : <AuthNavigator />;
}
