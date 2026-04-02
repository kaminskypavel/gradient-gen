import { useCallback, useEffect, useRef } from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Easing,
} from "remotion";
import { generate, type ShapeTemplate } from "../src/generator";

const SCENES: {
  template: ShapeTemplate;
  color1: string;
  color2: string;
  sharpness: number;
  seed: number;
  label: string;
}[] = [
  { template: "waves", color1: "#059669", color2: "#34d399", sharpness: 70, seed: 100, label: "Waves" },
  { template: "orbs", color1: "#7c3aed", color2: "#c084fc", sharpness: 60, seed: 200, label: "Orbs" },
  { template: "aurora", color1: "#0ea5e9", color2: "#38bdf8", sharpness: 50, seed: 300, label: "Aurora" },
  { template: "ribbons", color1: "#e11d48", color2: "#fb7185", sharpness: 80, seed: 400, label: "Ribbons" },
  { template: "crystals", color1: "#f59e0b", color2: "#fcd34d", sharpness: 65, seed: 500, label: "Crystals" },
  { template: "mesh", color1: "#14b8a6", color2: "#5eead4", sharpness: 45, seed: 600, label: "Mesh" },
];

const FRAMES_PER_SCENE = 50; // ~1.67s each

function GradientCanvas({
  template,
  color1,
  color2,
  sharpness,
  seed,
}: {
  template: ShapeTemplate;
  color1: string;
  color2: string;
  sharpness: number;
  seed: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const renderGradient = useCallback(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const result = generate(1920, 1080, color1, color2, seed, template, sharpness);
    ctx.putImageData(result.imageData, 0, 0);
  }, [template, color1, color2, sharpness, seed]);

  useEffect(() => {
    renderGradient();
  }, [renderGradient]);

  return (
    <canvas
      ref={canvasRef}
      width={1920}
      height={1080}
      style={{ width: "100%", height: "100%" }}
    />
  );
}

export const Demo = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Determine current and next scene
  const sceneIndex = Math.min(
    Math.floor(frame / FRAMES_PER_SCENE),
    SCENES.length - 1,
  );
  const frameInScene = frame - sceneIndex * FRAMES_PER_SCENE;
  const scene = SCENES[sceneIndex];

  // Scene entrance: scale + opacity
  const entrance = spring({
    frame: frameInScene,
    fps,
    config: { damping: 200 },
    durationInFrames: 15,
  });

  const opacity = interpolate(entrance, [0, 1], [0, 1]);
  const scale = interpolate(entrance, [0, 1], [1.05, 1]);

  // Scene exit (last 8 frames of scene)
  const exitFrame = frameInScene - (FRAMES_PER_SCENE - 8);
  const exitProgress =
    exitFrame > 0
      ? interpolate(exitFrame, [0, 8], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.inOut(Easing.quad),
        })
      : 0;
  const exitOpacity = 1 - exitProgress;

  // Label animation
  const labelEntrance = spring({
    frame: frameInScene - 5,
    fps,
    config: { damping: 100, stiffness: 200 },
    durationInFrames: 20,
  });
  const labelY = interpolate(labelEntrance, [0, 1], [20, 0]);
  const labelOpacity = interpolate(labelEntrance, [0, 1], [0, 1]);

  // Title card for first 30 frames
  const isTitleCard = frame < 30;
  const titleEntrance = spring({
    frame,
    fps,
    config: { damping: 200 },
    durationInFrames: 20,
  });
  const titleExit = interpolate(frame, [20, 30], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.quad),
  });

  // Outro (last 30 frames)
  const isOutro = frame > durationInFrames - 30;
  const outroEntrance = interpolate(
    frame,
    [durationInFrames - 30, durationInFrames - 15],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Adjusted scene frame (skip first 30 frames for title)
  const adjustedFrame = frame - 30;
  const adjSceneIndex = Math.min(
    Math.max(0, Math.floor(adjustedFrame / FRAMES_PER_SCENE)),
    SCENES.length - 1,
  );
  const adjFrameInScene = adjustedFrame - adjSceneIndex * FRAMES_PER_SCENE;
  const adjScene = SCENES[adjSceneIndex];

  const adjEntrance = spring({
    frame: adjFrameInScene,
    fps,
    config: { damping: 200 },
    durationInFrames: 15,
  });

  const adjExitFrame = adjFrameInScene - (FRAMES_PER_SCENE - 8);
  const adjExitProgress =
    adjExitFrame > 0
      ? interpolate(adjExitFrame, [0, 8], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.inOut(Easing.quad),
        })
      : 0;

  const adjLabelEntrance = spring({
    frame: adjFrameInScene - 5,
    fps,
    config: { damping: 100, stiffness: 200 },
    durationInFrames: 20,
  });

  return (
    <AbsoluteFill style={{ backgroundColor: "#0a0a0a" }}>
      {/* Gradient scenes */}
      {!isTitleCard && (
        <AbsoluteFill
          style={{
            opacity: (isOutro ? 1 - outroEntrance : 1) * interpolate(adjEntrance, [0, 1], [0, 1]) * (1 - adjExitProgress),
            transform: `scale(${interpolate(adjEntrance, [0, 1], [1.05, 1])})`,
          }}
        >
          <GradientCanvas
            template={adjScene.template}
            color1={adjScene.color1}
            color2={adjScene.color2}
            sharpness={adjScene.sharpness}
            seed={adjScene.seed}
          />

          {/* Shape label */}
          <div
            style={{
              position: "absolute",
              bottom: 60,
              left: 60,
              opacity: interpolate(adjLabelEntrance, [0, 1], [0, 1]),
              transform: `translateY(${interpolate(adjLabelEntrance, [0, 1], [20, 0])}px)`,
            }}
          >
            <div
              style={{
                fontFamily: "Space Grotesk, system-ui, sans-serif",
                fontSize: 18,
                fontWeight: 500,
                color: "rgba(255,255,255,0.5)",
                textTransform: "uppercase",
                letterSpacing: "0.15em",
                padding: "6px 14px",
                borderRadius: 8,
                background: "rgba(0,0,0,0.4)",
                backdropFilter: "blur(8px)",
              }}
            >
              {adjScene.label}
            </div>
          </div>
        </AbsoluteFill>
      )}

      {/* Title card */}
      {isTitleCard && (
        <AbsoluteFill
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: titleEntrance * titleExit,
          }}
        >
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                fontFamily: "Space Grotesk, system-ui, sans-serif",
                fontSize: 72,
                fontWeight: 600,
                color: "white",
                letterSpacing: "-0.02em",
                transform: `translateY(${interpolate(titleEntrance, [0, 1], [30, 0])}px)`,
              }}
            >
              Gradient Gen
            </div>
            <div
              style={{
                fontFamily: "JetBrains Mono, monospace",
                fontSize: 20,
                color: "rgba(255,255,255,0.4)",
                marginTop: 12,
                transform: `translateY(${interpolate(titleEntrance, [0, 1], [20, 0])}px)`,
              }}
            >
              Infinite wallpaper generator
            </div>
          </div>
        </AbsoluteFill>
      )}

      {/* Outro */}
      {isOutro && (
        <AbsoluteFill
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: outroEntrance,
          }}
        >
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                fontFamily: "Space Grotesk, system-ui, sans-serif",
                fontSize: 48,
                fontWeight: 600,
                color: "white",
                letterSpacing: "-0.02em",
                transform: `translateY(${interpolate(outroEntrance, [0, 1], [20, 0])}px)`,
              }}
            >
              kaminskypavel.github.io/gradient-gen
            </div>
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
