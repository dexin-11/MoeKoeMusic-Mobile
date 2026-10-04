import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useCallback, useEffect, useRef, useState, type ComponentProps } from 'react';
import { ScrollView, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Spinner, Text, YStack } from 'tamagui';

import { findActiveLyricIndex } from '@/features/player/lyrics';
import { usePlayerProgress, usePlayerProgressSelector } from '@/features/player/store';
import type { LyricLine, LyricsStatus } from '@/features/player/types';
import {
  useLyricAlign,
  useLyricFontSize,
  useLyricTranslationFontSize,
  useShowLyricTranslation,
  type LyricAlign,
} from '@/features/settings/store';
import { usePalette } from '@/hooks/use-palette';

type LyricsViewProps = {
  lines: LyricLine[];
  status: LyricsStatus;
  onSeekLine?: (line: LyricLine) => void;
};

const RESUME_AUTO_SCROLL_MS = 3500;
/** tick 之间按播放速率外推的上限，防止后台挂起时间戳造成大幅跳变。 */
const MAX_EXTRAPOLATE_MS = 250;

type LyricRowProps = {
  line: LyricLine;
  index: number;
  active: boolean;
  align: LyricAlign;
  fontSize: number;
  showTranslation: boolean;
  activeColor: ComponentProps<typeof Text>['color'];
  inactiveColor: ComponentProps<typeof Text>['color'];
  translationColor: ComponentProps<typeof Text>['color'];
  onLayoutLine: (index: number, offset: number) => void;
  onSeekLine?: (line: LyricLine) => void;
};

/** 翻译行样式与主歌词行完全一致（含 includeFontPadding），只改字号字重与颜色。 */
function TranslationText({
  line,
  align,
  fontSize,
  color,
}: {
  line: LyricLine;
  align: LyricAlign;
  fontSize: number;
  color: ComponentProps<typeof Text>['color'];
}) {
  if (!line.translation) {
    return null;
  }

  return (
    <Text
      suppressHighlighting
      textAlign={align === 'center' ? 'center' : 'left'}
      color={color}
      opacity={0.85}
      fontSize={fontSize}
      lineHeight={Math.round(fontSize * 1.3)}
      fontWeight="600"
      style={styles.translationText}>
      {line.translation}
    </Text>
  );
}

const LyricRow = memo(function LyricRow({
  line,
  index,
  active,
  align,
  fontSize,
  showTranslation,
  activeColor,
  inactiveColor,
  translationColor,
  onLayoutLine,
  onSeekLine,
}: LyricRowProps) {
  const translationFontSize = useLyricTranslationFontSize();
  return (
    <View
      onLayout={(event) => onLayoutLine(index, event.nativeEvent.layout.y)}
      style={styles.row}>
      <Text
        onPress={onSeekLine ? () => onSeekLine(line) : undefined}
        suppressHighlighting
        textAlign={align === 'center' ? 'center' : 'left'}
        color={active ? activeColor : inactiveColor}
        opacity={active ? 1 : 0.45}
        fontSize={fontSize}
        lineHeight={Math.round(fontSize * 1.36)}
        fontWeight="700"
        style={styles.lineText}>
        {line.text}
      </Text>
      {showTranslation ? (
        <TranslationText
          line={line}
          align={align}
          fontSize={translationFontSize}
          color={translationColor}
        />
      ) : null}
    </View>
  );
});

/**
 * 逐字卡拉OK行：底层暗色整行文字，上层高亮色同款文字用 MaskedView 按已唱宽度裁切。
 * 填充宽度由 progress tick 驱动（tick 间线性外推），动画交给 reanimated 在 UI 线程补帧。
 */
function KaraokeLine({
  line,
  index,
  align,
  fontSize,
  showTranslation,
  activeColor,
  inactiveColor,
  translationColor,
  onLayoutLine,
  onSeekLine,
}: {
  line: LyricLine;
  index: number;
  align: LyricAlign;
  fontSize: number;
  showTranslation: boolean;
  activeColor: ComponentProps<typeof Text>['color'];
  inactiveColor: ComponentProps<typeof Text>['color'];
  translationColor: ComponentProps<typeof Text>['color'];
  onLayoutLine: (index: number, offset: number) => void;
  onSeekLine?: (line: LyricLine) => void;
}) {
  const { positionMs, playing, positionUpdatedAt } = usePlayerProgress();
  const translationFontSize = useLyricTranslationFontSize();
  const [lineWidth, setLineWidth] = useState(0);
  const fill = useSharedValue(0);

  const words = line.words ?? [];
  const totalChars = words.reduce((sum, word) => sum + word.text.length, 0) || 1;

  const sungFractionAt = useCallback(
    (position: number): number => {
      let sung = 0;
      for (const word of words) {
        const wordEnd = word.timeMs + word.durationMs;
        if (position >= wordEnd) {
          sung += word.text.length;
        } else if (position > word.timeMs) {
          sung += (word.text.length * (position - word.timeMs)) / Math.max(word.durationMs, 1);
          break;
        } else {
          break;
        }
      }
      return Math.min(1, sung / totalChars);
    },
    [words, totalChars]
  );

  useEffect(() => {
    if (!words.length || !lineWidth) {
      return;
    }

    const extrapolated =
      playing && positionUpdatedAt > 0
        ? positionMs + Math.min(Date.now() - positionUpdatedAt, MAX_EXTRAPOLATE_MS)
        : positionMs;

    // 找到下一个字的开始时间，作为本段补间动画的时长，让填充速度贴合真实节奏。
    const nextWordStart = words.find((word) => word.timeMs > extrapolated)?.timeMs;
    const nextBoundary =
      nextWordStart ??
      (line.timeMs + (line.durationMs ?? 0) > extrapolated ? line.timeMs + (line.durationMs ?? 0) : null);
    const duration = Math.max(16, Math.min((nextBoundary ?? extrapolated + 300) - extrapolated, 400));

    cancelAnimation(fill);
    fill.set(withTiming(sungFractionAt(extrapolated), { duration }));

    return () => cancelAnimation(fill);
    // durationMs 只在切歌时变化，无需进入依赖。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positionMs, positionUpdatedAt, playing, lineWidth, sungFractionAt, fill]);

  // 遮罩是无子元素的绝对矩形（技能豁免情形）：动画 width 不触发任何文字重排。
  const fillStyle = useAnimatedStyle(() => ({
    width: fill.get() * lineWidth,
  }));

  return (
    <View
      onLayout={(event) => {
        onLayoutLine(index, event.nativeEvent.layout.y);
        setLineWidth(event.nativeEvent.layout.width);
      }}
      style={styles.row}>
      {/* 底层：未唱部分。三个文字必须样式完全一致，否则 Android 字形基线错位劈开 */}
      <Text
        color={inactiveColor}
        fontSize={fontSize}
        lineHeight={Math.round(fontSize * 1.36)}
        fontWeight="700"
        textAlign={align === 'center' ? 'center' : 'left'}
        style={styles.lineText}>
        {line.text}
      </Text>
      {/* 上层：已唱部分，矩形遮罩从左向右揭示。
          必须用默认的 software 渲染模式：hardware 模式在 Android 上把遮罩
          光栅化一次后不再响应 reanimated 的宽度更新，彩色层会整句不显示 */}
      {lineWidth ? (
        <MaskedView
          style={StyleSheet.absoluteFill}
          maskElement={<Animated.View style={[styles.maskFill, fillStyle]} />}>
          <Text
            color={activeColor}
            fontSize={fontSize}
            lineHeight={Math.round(fontSize * 1.36)}
            fontWeight="700"
            textAlign={align === 'center' ? 'center' : 'left'}
            style={styles.lineText}>
            {line.text}
          </Text>
        </MaskedView>
      ) : null}
      {showTranslation ? (
        <TranslationText
          line={line}
          align={align}
          fontSize={translationFontSize}
          color={translationColor}
        />
      ) : null}
    </View>
  );
}

export function LyricsView({ lines, status, onSeekLine }: LyricsViewProps) {
  const palette = usePalette();
  const lyricAlign = useLyricAlign();
  const lyricFontSize = useLyricFontSize();
  const showTranslation = useShowLyricTranslation();
  const scrollRef = useRef<ScrollView>(null);
  const lineOffsets = useRef<number[]>([]);
  const userScrollUntil = useRef(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const activeIndex = usePlayerProgressSelector(({ positionMs }) =>
    findActiveLyricIndex(lines, positionMs + 240)
  );

  const handleLayoutLine = useCallback((index: number, offset: number) => {
    lineOffsets.current[index] = offset;
  }, []);

  useEffect(() => {
    lineOffsets.current = [];
  }, [lines]);

  useEffect(() => {
    if (activeIndex < 0 || !viewportHeight || Date.now() < userScrollUntil.current) {
      return;
    }

    const offset = lineOffsets.current[activeIndex];
    if (typeof offset !== 'number') {
      return;
    }

    scrollRef.current?.scrollTo({
      y: Math.max(0, offset - viewportHeight * 0.42),
      animated: true,
    });
  }, [activeIndex, viewportHeight]);

  if (status === 'loading' || status === 'idle') {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center" gap={12}>
        <Spinner size="large" color={palette.accent} />
        <Text color={palette.textTertiary} fontSize={13}>
          歌词加载中
        </Text>
      </YStack>
    );
  }

  if (!lines.length) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center" gap={6}>
        <Text color={palette.textSecondary} fontSize={16} fontWeight="600">
          暂无歌词
        </Text>
        <Text color={palette.textTertiary} fontSize={12.5}>
          纯音乐，请欣赏
        </Text>
      </YStack>
    );
  }

  return (
    <MaskedView
      style={{ flex: 1 }}
      androidRenderingMode="hardware"
      maskElement={
        <LinearGradient
          colors={['transparent', 'black', 'black', 'transparent']}
          locations={[0, 0.14, 0.84, 1]}
          style={{ flex: 1 }}
        />
      }>
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        onLayout={(event: LayoutChangeEvent) => setViewportHeight(event.nativeEvent.layout.height)}
        onScrollBeginDrag={() => {
          userScrollUntil.current = Date.now() + RESUME_AUTO_SCROLL_MS;
        }}
        contentContainerStyle={{
          paddingVertical: viewportHeight ? viewportHeight * 0.42 : 200,
          paddingHorizontal: 28,
        }}>
        {lines.map((line, index) =>
          index === activeIndex && line.words?.length ? (
            <KaraokeLine
              key={`${line.timeMs}-${index}`}
              line={line}
              index={index}
              align={lyricAlign}
              fontSize={lyricFontSize}
              showTranslation={showTranslation}
              activeColor={palette.accent}
              inactiveColor={palette.textSecondary}
              translationColor={palette.text}
              onLayoutLine={handleLayoutLine}
              onSeekLine={onSeekLine}
            />
          ) : (
            <LyricRow
              key={`${line.timeMs}-${index}`}
              line={line}
              index={index}
              active={index === activeIndex}
              align={lyricAlign}
              fontSize={lyricFontSize}
              showTranslation={showTranslation}
              activeColor={palette.text}
              inactiveColor={palette.textSecondary}
              translationColor={palette.textSecondary}
              onLayoutLine={handleLayoutLine}
              onSeekLine={onSeekLine}
            />
          )
        )}
      </ScrollView>
    </MaskedView>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: 13,
  },
  baseText: {
    fontSize: 22,
    lineHeight: 30,
    fontWeight: '700',
  },
  lineText: {
    includeFontPadding: false,
  },
  translationText: {
    includeFontPadding: false,
    marginTop: 5,
  },
  maskFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#000',
  },
});
