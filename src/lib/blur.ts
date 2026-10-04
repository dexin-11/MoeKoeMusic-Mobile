/**
 * expo-blur 的运行时保护引用。
 *
 * expo-blur 是原生模块：当前已安装的 APK 里没有它，模块加载即崩溃，
 * 所以用 require + try/catch 兜底——老包返回 null（调用方降级为渐隐），
 * 重新打包后自动启用毛玻璃；Web 端是纯 CSS 实现，始终可用。
 */

type BlurModule = {
  BlurView: React.ComponentType<{
    intensity?: number;
    tint?: 'light' | 'dark' | 'default' | 'extraLight' | 'regular' | 'prominent';
    experimentalBlurMethod?: 'none' | 'dimezis';
    style?: object;
    pointerEvents?: 'auto' | 'none' | 'box-none' | 'box-only';
    children?: React.ReactNode;
  }>;
} | null;

let mod: BlurModule = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  mod = require('expo-blur') as BlurModule;
} catch {
  mod = null;
}

export const BlurViewModule = mod;
