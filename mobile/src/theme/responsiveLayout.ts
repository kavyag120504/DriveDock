/** Layout space, not physical pixels. Font scaling can make a wide phone effectively narrow. */
export function getResponsiveLayout({
  width,
  height,
  fontScale = 1,
}: {
  width: number;
  height: number;
  fontScale?: number;
}) {
  const textScale = Math.max(1, fontScale);
  const textWidth = width / textScale;
  const frameSize = Math.min(210, Math.max(140, width - 64));
  return {
    compact: width < 380 || height < 700 || fontScale > 1.15,
    stack: textWidth < 380,
    stackFields: textWidth < 380,
    choiceMinWidth: Math.min(80 * textScale, Math.max(44, width - 48)),
    pagePadding: width <= 360 ? 12 : width < 480 ? 16 : 20,
    cameraHeight: Math.max(frameSize + 40 + 18 * textScale, 240, Math.min(340, height * 0.42)),
    scanFrameSize: frameSize,
    tabHeight: Math.max(64, 44 + 16 * textScale),
  };
}
