import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MINI_PLAYER_HEIGHT } from '@/components/ui/mini-player';
import { TabBarHeight } from '@/constants/layout';
import { useHasTrack } from '@/features/player/store';
import { useIsTablet } from '@/hooks/use-is-tablet';

/** Tab 页滚动内容需要预留的底部空间（悬浮 TabBar + MiniPlayer）。 */
export function useDockContentInset(): number {
  const insets = useSafeAreaInsets();
  const hasTrack = useHasTrack();
  const isTablet = useIsTablet();
  const miniPlayerInset = hasTrack ? MINI_PLAYER_HEIGHT + 12 : 0;

  if (isTablet) {
    // 平板走侧边栏布局，底部没有 TabBar，只预留 MiniPlayer
    return insets.bottom + miniPlayerInset + 20;
  }

  return insets.bottom + TabBarHeight + miniPlayerInset + 20;
}
