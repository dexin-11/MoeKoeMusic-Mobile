import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Text, XStack } from 'tamagui';

import { useIsDark, usePalette } from '@/hooks/use-palette';
import { useAnimationsEnabled } from '@/features/settings/store';

type SegmentedControlProps<T extends string> = {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
};

const SPRING_CONFIG = { damping: 26, stiffness: 340, mass: 1 };

/** 胶囊分段切换：滑动指示条跟随选中项，弹簧过渡（可在设置中关闭动画）。 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  const palette = usePalette();
  const isDark = useIsDark();
  const animationsEnabled = useAnimationsEnabled();

  const containerWidth = useSharedValue(0);
  const activeIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value)
  );
  const position = useSharedValue(activeIndex);

  useEffect(() => {
    if (containerWidth.value <= 0) {
      // 首帧：直接就位，避免挂载时从 0 滑入
      position.value = activeIndex;
      return;
    }
    position.value = animationsEnabled
      ? withSpring(activeIndex, SPRING_CONFIG)
      : activeIndex;
  }, [activeIndex, animationsEnabled, containerWidth, position]);

  const pillStyle = useAnimatedStyle(() => {
    const segment = containerWidth.value / options.length;
    return {
      transform: [{ translateX: position.value * segment }],
      opacity: containerWidth.value > 0 ? 1 : 0,
    };
  });

  return (
    <XStack
      padding={3}
      borderRadius={14}
      backgroundColor={palette.cardAlt}
      borderWidth={StyleSheet.hairlineWidth}
      borderColor={palette.border}>
      <XStack
        flex={1}
        position="relative"
        height={38}
        onLayout={(event) => {
          // reanimated shared value 在事件回调中赋值是该库的标准用法
          // eslint-disable-next-line react-hooks/immutability
          containerWidth.value = event.nativeEvent.layout.width;
        }}>
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 0,
              width: `${100 / options.length}%`,
              borderRadius: 11,
              backgroundColor: isDark ? '#5A5A5E' : palette.card,
              shadowColor: palette.dockShadow,
              shadowOffset: { width: 0, height: 3 },
              shadowOpacity: isDark ? 0.4 : 0.1,
              shadowRadius: 8,
              elevation: 3,
            },
            pillStyle,
          ]}
        />
        {options.map((option) => {
          const active = option.value === value;
          return (
            <XStack
              key={option.value}
              flex={1}
              alignItems="center"
              justifyContent="center"
              borderRadius={11}
              transition="quickest"
              pressStyle={{ opacity: 0.6 }}
              onPress={() => onChange(option.value)}>
              <Text
                color={active ? palette.text : palette.textTertiary}
                fontSize={13.5}
                fontWeight={active ? '700' : '500'}>
                {option.label}
              </Text>
            </XStack>
          );
        })}
      </XStack>
    </XStack>
  );
}
