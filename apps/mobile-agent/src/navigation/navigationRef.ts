import { createNavigationContainerRef } from '@react-navigation/native';
import type { AppStackParamList } from './RootNavigator';

// Allows navigation from components that live outside a screen (e.g. the
// app-wide incoming-session gate). Attached to NavigationContainer in App.tsx.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-empty-interface
    interface RootParamList extends AppStackParamList {}
  }
}

export const navigationRef = createNavigationContainerRef<AppStackParamList>();
