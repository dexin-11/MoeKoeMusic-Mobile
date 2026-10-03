import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useEffect, useState } from 'react';
import { Keyboard, Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MiniPlayer } from '@/components/ui/mini-player';
import {
  SidebarWidth,
  TabBarHeight,
  TabBarSideMargin,
  TabletDockMaxWidth,
} from '@/constants/layout';
import { useIsTablet } from '@/hooks/use-is-tablet';
import { useIsDark, usePalette } from '@/hooks/use-palette';

type TabGlyph = 'home' | 'compass' | 'person';

const TAB_ROUTES: { name: string; title: string; glyph: TabGlyph; label: string }[] = [
  { name: 'index', title: '首页', glyph: 'home', label: '首页' },
  { name: 'discover', title: '发现', glyph: 'compass', label: '发现' },
  { name: 'me', title: '我的', glyph: 'person', label: '我的' },
];

export default function TabsLayout() {
  const palette = usePalette();
  const isDark = useIsDark();
  const isTablet = useIsTablet();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSubscription = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hideSubscription = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const barHeight = TabBarHeight + insets.bottom;

  const dockWidth = isTablet
    ? Math.min(width - SidebarWidth - TabBarSideMargin * 2, TabletDockMaxWidth)
    : Math.min(width - TabBarSideMargin * 2, 680);
  const dockLeft = isTablet
    ? SidebarWidth + (width - SidebarWidth - dockWidth) / 2
    : (width - dockWidth) / 2;
  const dockBottom = isTablet ? insets.bottom + 12 : barHeight + 8;

  return (
    <View style={styles.root}>
      <Tabs
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: palette.background },
          tabBarShowLabel: true,
          tabBarActiveTintColor: palette.accent,
          tabBarInactiveTintColor: palette.textTertiary,
          tabBarPosition: isTablet ? 'left' : 'bottom',
          tabBarHideOnKeyboard: true,
          tabBarLabelStyle: {
            fontSize: 10.5,
            fontWeight: '600',
          },
          tabBarStyle: isTablet
            ? {
                width: SidebarWidth,
                backgroundColor: palette.barSurface,
                borderTopWidth: 0,
                borderRightWidth: StyleSheet.hairlineWidth,
                borderRightColor: palette.border,
              }
            : {
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                height: barHeight,
                borderTopWidth: StyleSheet.hairlineWidth,
                borderTopColor: palette.border,
                backgroundColor: palette.barSurface,
                shadowColor: palette.dockShadow,
                shadowOffset: { width: 0, height: 10 },
                shadowOpacity: isDark ? 0.45 : 0.08,
                shadowRadius: 22,
                elevation: 10,
              },
        }}>
        {TAB_ROUTES.map((tab) => (
          <Tabs.Screen
            key={tab.name}
            name={tab.name}
            options={{
              title: tab.title,
              tabBarIcon: ({ focused, color }) => (
                <Ionicons
                  name={focused ? tab.glyph : (`${tab.glyph}-outline` as const)}
                  size={isTablet ? 25 : 23}
                  color={color}
                />
              ),
            }}
          />
        ))}
      </Tabs>

      {keyboardVisible ? null : (
        <View
          pointerEvents="box-none"
          style={[
            styles.dock,
            {
              bottom: dockBottom,
              left: dockLeft,
              width: dockWidth,
            },
          ]}>
          <MiniPlayer />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  dock: {
    position: 'absolute',
  },
});
