import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BackHandler,
  ScrollView,
  StyleSheet,
  InteractionManager,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Slider, Spinner, Text, View, XStack, YStack } from 'tamagui';

import { Artwork } from '@/components/ui/artwork';
import { LyricsView } from '@/components/ui/lyrics-view';
import { QueueSheet } from '@/components/ui/queue-sheet';
import { showToast, ToastHost } from '@/components/ui/toast';
import { TrackActionsSheet } from '@/components/ui/track-actions-sheet';
import { libraryActions, useIsLiked } from '@/features/library/store';
import { playerActions, usePlayer, usePlayerProgress } from '@/features/player/store';
import type { PlayMode } from '@/features/player/types';
import { useIsDark, usePalette } from '@/hooks/use-palette';
import { formatClock, sizedImage } from '@/lib/format';
import { shareTrack } from '@/lib/share';

const MODE_ICON: Record<PlayMode, 'repeat' | 'repeat-once' | 'shuffle-variant'> = {
  sequence: 'repeat',
  shuffle: 'shuffle-variant',
  single: 'repeat-once',
};

/** 封面大圆角卡片：暂停时轻微降不透明度，替代旧旋转黑胶。 */
function ArtworkCard({ coverUrl, playing, size }: { coverUrl: string | null; playing: boolean; size: number }) {
  const isDark = useIsDark();

  return (
    <View
      width={size}
      height={size}
      borderRadius={26}
      overflow="hidden"
      opacity={playing ? 1 : 0.82}
      transition="quick"
      shadowColor="#000000"
      shadowOffset={{ width: 0, height: 20 }}
      shadowOpacity={isDark ? 0.55 : 0.22}
      shadowRadius={36}
      style={{ elevation: 18 }}>
      <Artwork uri={coverUrl} size={size} radius={26} />
    </View>
  );
}

function PlaybackProgress() {
  const palette = usePalette();
  const { positionMs, durationMs } = usePlayerProgress();
  const [dragValue, setDragValue] = useState<number | null>(null);
  const dragValueRef = useRef<number | null>(null);
  const shownPosition = dragValue ?? positionMs;

  return (
    <YStack gap={7}>
      <Slider
        size="$2"
        value={[Math.min(shownPosition, Math.max(durationMs, 1))]}
        max={Math.max(durationMs, 1)}
        step={250}
        disabled={!durationMs}
        onValueChange={(values) => {
          const next = values[0] ?? 0;
          dragValueRef.current = next;
          setDragValue(next);
        }}
        onSlideEnd={() => {
          if (dragValueRef.current !== null) {
            playerActions.seekToMs(dragValueRef.current);
          }
          dragValueRef.current = null;
          setTimeout(() => setDragValue(null), 180);
        }}>
        <Slider.Track backgroundColor={palette.cardAlt} height={4} borderRadius={999}>
          <Slider.TrackActive backgroundColor={palette.accent} />
        </Slider.Track>
        <Slider.Thumb
          index={0}
          size={16}
          circular
          backgroundColor={palette.accent}
          borderWidth={2.5}
          borderColor="#FFFFFF"
          pressStyle={{
            scale: 1.2,
            backgroundColor: palette.accentPressed,
            borderColor: '#FFFFFF',
          }}
          hoverStyle={{ backgroundColor: palette.accent, borderColor: '#FFFFFF' }}
          shadowColor="#000000"
          shadowOpacity={0.2}
          shadowRadius={5}
          shadowOffset={{ width: 0, height: 2 }}
        />
      </Slider>
      <XStack justifyContent="space-between">
        <Text color={palette.textTertiary} fontSize={11} fontVariant={['tabular-nums']}>
          {formatClock(shownPosition)}
        </Text>
        <Text color={palette.textTertiary} fontSize={11} fontVariant={['tabular-nums']}>
          {formatClock(durationMs)}
        </Text>
      </XStack>
    </YStack>
  );
}

export default function PlayerScreen() {
  const palette = usePalette();
  const isDark = useIsDark();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const player = usePlayer();

  const [pageIndex, setPageIndex] = useState(0);
  const [queueOpen, setQueueOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
  const [lyricsMounted, setLyricsMounted] = useState(false);
  const pagerRef = useRef<ScrollView>(null);

  const { track, playing, loading, buffering, mode, error, lyrics, lyricsStatus } = player;
  const liked = useIsLiked(track?.hash);

  useEffect(() => {
    // 提前加载歌单库,让心形按钮反映真实喜欢状态
    void libraryActions.ensure().catch(() => undefined);
  }, []);

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => setLyricsMounted(true));
    return () => task.cancel();
  }, []);

  useEffect(() => {
    if (pageIndex === 1) {
      void playerActions.loadLyrics();
    }
  }, [pageIndex, track?.hash]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      router.dismiss();
      return true;
    });
    return () => subscription.remove();
  }, [router]);

  function handleToggleLike() {
    if (!track || likeBusy) {
      return;
    }
    setLikeBusy(true);
    libraryActions
      .toggleLike(track)
      .then((result) => {
        showToast(result === 'liked' ? '已加入「我喜欢」' : '已移出「我喜欢」');
      })
      .catch((cause) => {
        showToast(cause instanceof Error ? cause.message : '操作失败');
      })
      .finally(() => setLikeBusy(false));
  }

  const compact = height < 700;
  const artworkSize = Math.min(width - 72, compact ? 250 : 320);
  const busy = loading || buffering;

  function handlePagerScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / width);
    if (nextIndex !== pageIndex) {
      setPageIndex(nextIndex);
    }
  }

  const handleSeekLine = useCallback((line: { timeMs: number }) => {
    playerActions.seekToMs(line.timeMs);
  }, []);

  if (!track) {
    return (
      <YStack
        flex={1}
        alignItems="center"
        justifyContent="center"
        gap={16}
        backgroundColor={palette.background}
        paddingTop={insets.top}>
        <Ionicons name="musical-notes-outline" size={44} color={palette.textTertiary} />
        <Text color={palette.textTertiary} fontSize={14}>
          还没有正在播放的歌曲
        </Text>
        <XStack
          paddingHorizontal={24}
          height={42}
          alignItems="center"
          borderRadius={999}
          backgroundColor={palette.accentSoft}
          pressStyle={{ opacity: 0.7 }}
          onPress={() => router.back()}>
          <Text color={palette.accent} fontSize={14} fontWeight="600">
            返回
          </Text>
        </XStack>
      </YStack>
    );
  }

  return (
    <View flex={1} backgroundColor={palette.playerBottom}>
      {/* Apple Music 式背景：封面大图高斯模糊 + 顶部浅色到主题底的渐变遮罩 */}
      {track.coverUrl ? (
        <Image
          source={{ uri: sizedImage(track.coverUrl, 480) ?? track.coverUrl }}
          style={StyleSheet.absoluteFill}
          blurRadius={50}
          contentFit="cover"
          transition={400}
        />
      ) : null}
      <LinearGradient
        colors={[isDark ? 'rgba(14, 15, 22, 0.82)' : 'rgba(255, 255, 255, 0.86)', palette.playerBottom + 'F2']}
        locations={[0, 0.55]}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={['transparent', palette.playerBottom]}
        locations={[0, 1]}
        style={[StyleSheet.absoluteFill, { height: '100%' }]}
      />

      <YStack flex={1} paddingTop={insets.top + 6} paddingBottom={Math.max(insets.bottom, 14) + 20}>
        {/* 顶栏 */}
        <XStack zIndex={1} alignItems="center" justifyContent="space-between" paddingHorizontal={18}>
          <XStack
            width={40}
            height={40}
            borderRadius={20}
            alignItems="center"
            justifyContent="center"
            transition="quickest"
            pressStyle={{ opacity: 0.6, scale: 0.92 }}
            onPress={() => router.dismiss()}>
            <Ionicons name="chevron-down" size={24} color={palette.textSecondary} />
          </XStack>
          <YStack alignItems="center" gap={2}>
            <Text color={palette.textTertiary} fontSize={11} letterSpacing={1.2}>
              正在播放
            </Text>
            <XStack gap={5} alignItems="center">
              {[0, 1].map((dot) => (
                <View
                  key={dot}
                  width={dot === pageIndex ? 14 : 5}
                  height={5}
                  borderRadius={999}
                  backgroundColor={dot === pageIndex ? palette.accent : palette.textTertiary}
                  opacity={dot === pageIndex ? 1 : 0.4}
                  transition="quick"
                />
              ))}
            </XStack>
          </YStack>
          <View width={40} height={40} />
        </XStack>

        {/* 封面 / 歌词 双页 */}
        <ScrollView
          ref={pagerRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handlePagerScroll}
          style={{ flex: 1 }}>
          <YStack width={width} alignItems="center" justifyContent="center" gap={compact ? 22 : 34}>
            <ArtworkCard coverUrl={track.coverUrl} playing={playing} size={artworkSize} />

            <YStack alignItems="center" gap={7} paddingHorizontal={40} maxWidth={560}>
              <Text
                color={palette.text}
                fontSize={compact ? 20 : 23}
                fontWeight="800"
                textAlign="center"
                numberOfLines={1}>
                {track.title}
              </Text>
              <Text color={palette.textSecondary} fontSize={15} numberOfLines={1}>
                {track.artist || '未知歌手'}
              </Text>
              {error ? (
                <XStack
                  alignItems="center"
                  gap={6}
                  marginTop={4}
                  paddingHorizontal={13}
                  paddingVertical={7}
                  borderRadius={999}
                  backgroundColor={palette.dangerSoft}>
                  <Ionicons name="alert-circle" size={13} color={palette.danger} />
                  <Text color={palette.danger} fontSize={12}>
                    {error}
                  </Text>
                </XStack>
              ) : null}
            </YStack>
          </YStack>

          <YStack width={width} paddingTop={8}>
            {lyricsMounted ? (
              <LyricsView
                lines={lyrics}
                status={lyricsStatus}
                onSeekLine={handleSeekLine}
              />
            ) : null}
          </YStack>
        </ScrollView>

        {/* 进度与控制 */}
        <YStack paddingHorizontal={28} gap={compact ? 14 : 20} maxWidth={620} width="100%" alignSelf="center">
          <XStack alignItems="center" justifyContent="center" gap={46}>
            <XStack
              width={40}
              height={40}
              alignItems="center"
              justifyContent="center"
              opacity={likeBusy ? 0.5 : 1}
              transition="quickest"
              pressStyle={{ opacity: 0.55, scale: 0.88 }}
              onPress={handleToggleLike}>
              <Ionicons
                name={liked ? 'heart' : 'heart-outline'}
                size={24}
                color={liked ? palette.accent : palette.textSecondary}
              />
            </XStack>
            <XStack
              width={40}
              height={40}
              alignItems="center"
              justifyContent="center"
              transition="quickest"
              pressStyle={{ opacity: 0.55, scale: 0.88 }}
              onPress={() => setActionsOpen(true)}>
              <MaterialCommunityIcons name="playlist-plus" size={24} color={palette.textSecondary} />
            </XStack>
            <XStack
              width={40}
              height={40}
              alignItems="center"
              justifyContent="center"
              transition="quickest"
              pressStyle={{ opacity: 0.55, scale: 0.88 }}
              onPress={() => {
                if (track) {
                  void shareTrack(track);
                }
              }}>
              <Ionicons name="share-social-outline" size={22} color={palette.textSecondary} />
            </XStack>
          </XStack>

          <PlaybackProgress />

          <XStack alignItems="center" justifyContent="space-between" paddingHorizontal={8}>
            <XStack
              width={44}
              height={44}
              alignItems="center"
              justifyContent="center"
              transition="quickest"
              pressStyle={{ opacity: 0.55, scale: 0.9 }}
              onPress={() => playerActions.cycleMode()}>
              <MaterialCommunityIcons name={MODE_ICON[mode]} size={22} color={palette.textSecondary} />
            </XStack>

            <XStack
              width={56}
              height={56}
              alignItems="center"
              justifyContent="center"
              transition="quickest"
              pressStyle={{ opacity: 0.55, scale: 0.88 }}
              onPress={() => playerActions.previous()}>
              <Ionicons name="play-skip-back" size={32} color={palette.text} />
            </XStack>

            <XStack
              width={72}
              height={72}
              alignItems="center"
              justifyContent="center"
              transition="quickest"
              pressStyle={{ scale: 0.9, opacity: 0.75 }}
              onPress={() => playerActions.toggle()}>
              {busy ? (
                <Spinner size="large" color={palette.text} />
              ) : (
                <Ionicons
                  name={playing ? 'pause' : 'play'}
                  size={40}
                  color={palette.text}
                  style={playing ? undefined : { marginLeft: 4 }}
                />
              )}
            </XStack>

            <XStack
              width={56}
              height={56}
              alignItems="center"
              justifyContent="center"
              transition="quickest"
              pressStyle={{ opacity: 0.55, scale: 0.88 }}
              onPress={() => playerActions.next()}>
              <Ionicons name="play-skip-forward" size={32} color={palette.text} />
            </XStack>

            <XStack
              width={44}
              height={44}
              alignItems="center"
              justifyContent="center"
              transition="quickest"
              pressStyle={{ opacity: 0.55, scale: 0.9 }}
              onPress={() => setQueueOpen(true)}>
              <MaterialCommunityIcons name="playlist-music" size={22} color={palette.textSecondary} />
            </XStack>
          </XStack>
        </YStack>
      </YStack>

      <QueueSheet open={queueOpen} onOpenChange={setQueueOpen} />
      <TrackActionsSheet
        open={actionsOpen}
        onOpenChange={setActionsOpen}
        track={track}
        initialView="pick"
      />
      <ToastHost />
    </View>
  );
}
