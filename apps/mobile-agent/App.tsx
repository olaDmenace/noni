import { NavigationContainer } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Fraunces_400Regular,
  Fraunces_400Regular_Italic,
  Fraunces_600SemiBold,
} from '@expo-google-fonts/fraunces';
import { Geist_400Regular, Geist_500Medium } from '@expo-google-fonts/geist';
import { Splash, ToastProvider, colors } from '@noni/ui';
import * as Font from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { navigationRef } from './src/navigation/navigationRef';
import { RootNavigator } from './src/navigation/RootNavigator';

SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, retry: 1 } },
});

export default function App() {
  const [fontsReady, setFontsReady] = useState(false);
  const [splashDone, setSplashDone] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        await Font.loadAsync({
          Fraunces: Fraunces_400Regular,
          'Fraunces-Italic': Fraunces_400Regular_Italic,
          'Fraunces-SemiBold': Fraunces_600SemiBold,
          Geist: Geist_400Regular,
          'Geist-Medium': Geist_500Medium,
          GeneralSans: require('./assets/fonts/GeneralSans-Regular.ttf'),
          'GeneralSans-Medium': require('./assets/fonts/GeneralSans-Medium.ttf'),
          'GeneralSans-SemiBold': require('./assets/fonts/GeneralSans-Semibold.ttf'),
        });
      } finally {
        setFontsReady(true);
        SplashScreen.hideAsync().catch(() => {});
      }
    })();
  }, []);

  if (!fontsReady) return null;

  return (
    <SafeAreaProvider style={{ backgroundColor: colors.background }}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <NavigationContainer ref={navigationRef}>
            <StatusBar style="light" backgroundColor={colors.background} translucent={false} />
            <RootNavigator />
          </NavigationContainer>
          {!splashDone ? <Splash onFinish={() => setSplashDone(true)} /> : null}
        </ToastProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
