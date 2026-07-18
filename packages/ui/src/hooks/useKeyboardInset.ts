// Keyboard handling that does NOT trust KeyboardAvoidingView on Android.
// With SDK 54's enforced edge-to-edge, the window never resizes for the
// keyboard and KAV's Android behaviors have proven unreliable on real devices
// (Samsung: input stayed buried). So we listen to the OS keyboard events and
// report the exact overlap for screens to pad themselves with.
//
// The guard against double-offset: if the OS DID resize the window (some
// devices/ROMs still honor adjustResize), the visible window height shrinks by
// roughly the keyboard height — in that case no manual inset is needed.
import { useEffect, useState } from 'react';
import { Dimensions, Keyboard, type KeyboardEvent, Platform } from 'react-native';

export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    // iOS is handled by KeyboardAvoidingView (long-proven there); only Android
    // needs the manual inset.
    if (Platform.OS !== 'android') return;

    const onShow = (e: KeyboardEvent) => {
      const keyboardHeight = e.endCoordinates?.height ?? 0;
      const { height: windowH } = Dimensions.get('window');
      const { height: screenH } = Dimensions.get('screen');
      const windowAlreadyResized = screenH - windowH >= keyboardHeight * 0.6;
      setInset(windowAlreadyResized ? 0 : keyboardHeight);
    };
    const onHide = () => setInset(0);

    const show = Keyboard.addListener('keyboardDidShow', onShow);
    const hide = Keyboard.addListener('keyboardDidHide', onHide);
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return inset;
}
