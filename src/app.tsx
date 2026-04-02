import { useCallback, useEffect, useRef, useState } from "react";
import { generate, TEMPLATES, type GeneratedResult, type ShapeTemplate } from "./generator";

const PREVIEW_W = 1920;
const PREVIEW_H = 1080;

function scaleImageData(src: ImageData, dw: number, dh: number): ImageData {
  const tmp = new OffscreenCanvas(src.width, src.height);
  tmp.getContext("2d")!.putImageData(src, 0, 0);
  const dst = new OffscreenCanvas(dw, dh);
  const dCtx = dst.getContext("2d")!;
  dCtx.drawImage(tmp, 0, 0, dw, dh);
  return dCtx.getImageData(0, 0, dw, dh);
}

function renderToCanvas(ctx: CanvasRenderingContext2D, result: GeneratedResult, w: number, h: number) {
  ctx.putImageData(
    result.w === w && result.h === h ? result.imageData : scaleImageData(result.imageData, w, h),
    0,
    0,
  );
}

function randomHex(): string {
  const h = Math.random() * 360;
  const s = 50 + Math.random() * 50;
  const l = 30 + Math.random() * 40;
  const c = (1 - Math.abs((2 * l) / 100 - 1)) * (s / 100);
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l / 100 - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function HistoryItem({
  result,
  onSelect,
  onDownload,
}: {
  result: GeneratedResult;
  onSelect: () => void;
  onDownload: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) renderToCanvas(ctx, result, 256, 144);
  }, [result]);

  return (
    <div
      onClick={onSelect}
      className="history-enter group relative shrink-0 w-[100px] h-[56px] rounded-lg overflow-hidden cursor-pointer border border-transparent transition-all hover:border-white/20 hover:scale-[1.04]"
    >
      <canvas ref={canvasRef} width={256} height={144} className="w-full h-full" />
      <span className="absolute top-0.5 left-1 text-[8px] uppercase tracking-wider text-white/60 font-mono opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
        {result.template}
      </span>
      <button
        onClick={(e) => { e.stopPropagation(); onDownload(); }}
        className="absolute bottom-1 right-1 w-4 h-4 rounded bg-black/50 text-white/70 text-[9px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer border-none backdrop-blur-sm"
      >
        ↓
      </button>
    </div>
  );
}

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const [color1, setColor1] = useState("#059669");
  const [color2, setColor2] = useState("#34d399");
  const [template, setTemplate] = useState<ShapeTemplate>("random");
  const [sharpness, setSharpness] = useState(50);
  const [exportSize, setExportSize] = useState("3840x2160");
  const [current, setCurrent] = useState<GeneratedResult | null>(null);
  const [history, setHistory] = useState<GeneratedResult[]>([]);

  const doGenerate = useCallback(
    (c1 = color1, c2 = color2) => {
      const result = generate(PREVIEW_W, PREVIEW_H, c1, c2, undefined, template, sharpness);
      setCurrent(result);
      setHistory((prev) => [result, ...prev].slice(0, 30));

      // Crossfade
      wrapRef.current?.classList.remove("canvas-fresh");
      void wrapRef.current?.offsetWidth;
      wrapRef.current?.classList.add("canvas-fresh");
    },
    [color1, color2, template, sharpness],
  );

  // Render current result to canvas
  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx && current) renderToCanvas(ctx, current, PREVIEW_W, PREVIEW_H);
  }, [current]);

  // Generate on mount
  useEffect(() => { doGenerate(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const downloadResult = useCallback(
    (result: GeneratedResult) => {
      const [ew, eh] = exportSize.split("x").map(Number);
      const offscreen = new OffscreenCanvas(ew, eh);
      const oCtx = offscreen.getContext("2d")!;
      const exp = generate(ew, eh, result.color1, result.color2, result.seed, result.template, result.sharpness);
      oCtx.putImageData(exp.imageData, 0, 0);
      offscreen.convertToBlob({ type: "image/png" }).then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `gradient-${result.template}-${Date.now()}.png`;
        a.click();
        URL.revokeObjectURL(url);
      });
    },
    [exportSize],
  );

  const handleSelect = useCallback((result: GeneratedResult) => {
    setCurrent(result);
    wrapRef.current?.classList.remove("canvas-fresh");
    void wrapRef.current?.offsetWidth;
    wrapRef.current?.classList.add("canvas-fresh");
  }, []);

  const handleShuffle = useCallback(() => {
    const c1 = randomHex();
    const c2 = randomHex();
    setColor1(c1);
    setColor2(c2);
    doGenerate(c1, c2);
  }, [doGenerate]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        doGenerate();
      }
      if (e.key === "s" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (current) downloadResult(current);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [doGenerate, downloadResult, current]);

  return (
    <div className="h-screen w-screen bg-neutral-950 flex flex-col overflow-hidden font-display">
      {/* Toolbar */}
      <header className="flex items-center justify-between px-5 py-3 border-b border-white/[0.04] shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-medium tracking-tight text-white/80">Gradient</h1>
          <span className="w-px h-4 bg-white/[0.06]" />

          <div className="flex items-center gap-1.5">
            <input
              type="color"
              value={color1}
              onChange={(e) => setColor1(e.target.value)}
              className="w-7 h-7 rounded-md border border-white/[0.08] cursor-pointer bg-transparent p-0.5"
            />
            <input
              type="color"
              value={color2}
              onChange={(e) => setColor2(e.target.value)}
              className="w-7 h-7 rounded-md border border-white/[0.08] cursor-pointer bg-transparent p-0.5"
            />
            <button
              onClick={handleShuffle}
              title="Random colors"
              className="w-7 h-7 rounded-md border border-white/[0.06] bg-white/[0.03] text-white/50 text-xs flex items-center justify-center cursor-pointer transition hover:bg-white/[0.08] hover:text-white/80"
            >
              🎲
            </button>
          </div>

          <span className="w-px h-4 bg-white/[0.06]" />

          <select
            value={template}
            onChange={(e) => setTemplate(e.target.value as ShapeTemplate)}
            className="bg-white/[0.04] text-white/60 border border-white/[0.06] pl-2 pr-6 py-1 rounded-md text-xs cursor-pointer hover:text-white/80 transition"
          >
            {TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>

          <span className="w-px h-4 bg-white/[0.06]" />

          <div className="flex items-center gap-2">
            <label className="text-[10px] uppercase tracking-wider text-white/30">Sharp</label>
            <input
              type="range"
              min={0}
              max={100}
              value={sharpness}
              onChange={(e) => setSharpness(Number(e.target.value))}
              className="w-20 h-1 accent-white/60 cursor-pointer"
            />
            <span className="text-[10px] text-white/40 font-mono w-6 text-right">{sharpness}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={exportSize}
            onChange={(e) => setExportSize(e.target.value)}
            className="bg-white/[0.04] text-white/60 border border-white/[0.06] pl-2 pr-6 py-1 rounded-md text-xs cursor-pointer"
          >
            <option value="1920x1080">1920 × 1080</option>
            <option value="2560x1440">2560 × 1440</option>
            <option value="3840x2160">3840 × 2160</option>
          </select>

          <button
            onClick={() => doGenerate()}
            className="h-7 px-3 rounded-md text-xs font-medium bg-white text-neutral-950 cursor-pointer transition hover:bg-neutral-200 active:scale-[0.97]"
          >
            Generate
          </button>
          <button
            onClick={() => current && downloadResult(current)}
            className="h-7 px-3 rounded-md text-xs font-medium bg-white/[0.06] text-white/60 border border-white/[0.06] cursor-pointer transition hover:bg-white/[0.12] hover:text-white/90"
          >
            Download
          </button>
        </div>
      </header>

      {/* Canvas */}
      <main className="flex-1 relative min-h-0 flex items-center justify-center bg-neutral-950/80 p-4">
        <div
          ref={wrapRef}
          className="relative rounded-xl overflow-hidden shadow-2xl shadow-black/60 border border-white/[0.04] max-w-full max-h-full"
        >
          <canvas
            ref={canvasRef}
            width={PREVIEW_W}
            height={PREVIEW_H}
            className="block max-w-full max-h-[calc(100vh-140px)] w-auto h-auto"
          />
        </div>

        {current && (
          <div className="absolute top-6 left-6 px-2 py-0.5 rounded-md bg-black/50 backdrop-blur-sm text-[10px] uppercase tracking-widest text-white/40 font-mono pointer-events-none">
            {current.template}
          </div>
        )}
      </main>

      {/* History filmstrip */}
      <footer className="shrink-0 border-t border-white/[0.04] bg-neutral-950">
        <div className="history-rail flex items-center gap-2 px-4 py-2.5 overflow-x-auto">
          {history.map((result) => (
            <HistoryItem
              key={result.seed}
              result={result}
              onSelect={() => handleSelect(result)}
              onDownload={() => downloadResult(result)}
            />
          ))}
        </div>
      </footer>
    </div>
  );
}
