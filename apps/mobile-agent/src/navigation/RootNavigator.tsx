import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { colors, fonts } from '@noni/ui';
import { useAuthStore } from '../stores/authStore';
import { IncomingSessionGate } from '../realtime/IncomingSessionGate';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { OtpScreen } from '../screens/auth/OtpScreen';
import { QueueScreen } from '../screens/queue/QueueScreen';
import { SessionScreen } from '../screens/session/SessionScreen';
import { EarningsScreen } from '../screens/earnings/EarningsScreen';
import { ProfileScreen } from '../screens/profile/ProfileScreen';
import { CrisisTrainingScreen } from '../screens/training/CrisisTrainingScreen';
import { PracticeScreen } from '../screens/training/PracticeScreen';
import { ScheduleScreen } from '../screens/queue/ScheduleScreen';

export type AuthStackParamList = {
  Login: undefined;
  Otp: { phone: string };
};

export type AppTabParamList = {
  Queue: undefined;
  Earnings: undefined;
  Profile: undefined;
};

export type AppStackParamList = {
  Tabs: undefined;
  Session: { sessionId: string };
  CrisisTraining: undefined;
  Schedule: undefined;
  Practice: undefined;
};

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const AppStack = createNativeStackNavigator<AppStackParamList>();
const Tabs = createBottomTabNavigator<AppTabParamList>();

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false, animation: 'fade', animationDuration: 250 }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
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
        name="Queue"
        component={QueueScreen}
        options={{
          tabBarIcon: ({ color, size }) => <Feather name="inbox" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="Earnings"
        component={EarningsScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Feather name="trending-up" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarIcon: ({ color, size }) => <Feather name="user" size={size} color={color} />,
        }}
      />
    </Tabs.Navigator>
  );
}

function AppNavigator() {
  return (
    <>
      <AppStack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right', animationDuration: 250 }}>
        <AppStack.Screen name="Tabs" component={AppTabs} />
        <AppStack.Screen
          name="Session"
          component={SessionScreen}
          options={{ headerShown: true, title: 'Session' }}
        />
        <AppStack.Screen name="CrisisTraining" component={CrisisTrainingScreen} />
        <AppStack.Screen
          name="Schedule"
          component={ScheduleScreen}
          options={{ headerShown: true, title: 'Schedule' }}
        />
        <AppStack.Screen
          name="Practice"
          component={PracticeScreen}
          options={{ headerShown: true, title: 'Practice' }}
        />
      </AppStack.Navigator>
      {/* App-wide socket + incoming-request modal (F-029, F-032). Lives with
          the authenticated tree so logout tears the socket down. */}
      <IncomingSessionGate />
    </>
  );
}

export function RootNavigator() {
  const hydrated = useAuthStore((s) => s.hydrated);
  const accessToken = useAuthStore((s) => s.accessToken);
  const hydrate = useAuthStore((s) => s.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  if (!hydrated) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.background,
        }}
      >
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  return accessToken ? <AppNavigator /> : <AuthNavigator />;
}
