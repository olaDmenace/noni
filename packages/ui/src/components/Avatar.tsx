import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors, fonts } from '../theme';

export interface AvatarProps {
  label: string;
  size?: number;
  shape?: 'square' | 'circle';
  showPresence?: boolean;
  presenceColor?: string;
  style?: ViewStyle;
}

export function Avatar({
  label,
  size = 40,
  shape = 'square',
  showPresence = false,
  presenceColor = colors.success,
  style,
}: AvatarProps) {
  const glyph = label.trim().charAt(0).toUpperCase() || '•';
  const radiusVal = shape === 'circle' ? size / 2 : Math.max(8, size / 3);
  const fontSize = Math.round(size * 0.45);
  const presenceSize = Math.max(8, Math.round(size * 0.28));

  return (
    <View style={[{ width: size, height: size }, style]}>
      <View
        style={[
          styles.inner,
          {
            width: size,
            height: size,
            borderRadius: radiusVal,
          },
        ]}
      >
        <Text
          style={{
            fontFamily: fonts.displayItalic,
            fontSize,
            color: colors.emphasis,
          }}
        >
          {glyph}
        </Text>
      </View>
      {showPresence ? (
        <View
          style={[
            styles.presence,
            {
              width: presenceSize,
              height: presenceSize,
              borderRadius: presenceSize / 2,
              backgroundColor: presenceColor,
              borderColor: colors.bg,
            },
          ]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  inner: {
    backgroundColor: colors.surfaceGlow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presence: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    borderWidth: 2,
  },
});
