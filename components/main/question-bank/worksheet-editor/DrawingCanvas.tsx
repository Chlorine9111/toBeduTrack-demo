"use client";

import { useRef, useEffect, useCallback, useState } from "react";

/** 单条笔画：X 坐标使用 0-1 相对值，Y 坐标使用绝对像素值（增大画布不拉伸） */
export type DrawingStroke = {
  points: Array<{ x: number; y: number }>;
  color: string;
  lineWidth: number;
};

type DrawingCanvasProps = {
  width: number;
  height: number;
  strokes: DrawingStroke[];
  color: string;
  lineWidth: number;
  isEraser: boolean;
  onStrokesChange: (strokes: DrawingStroke[]) => void;
};

/** 将坐标转换为画布像素坐标：X 相对(0-1)，Y 绝对像素 */
function toAbsolute(
  point: { x: number; y: number },
  canvasWidth: number,
  _canvasHeight: number,
) {
  return {
    x: point.x * canvasWidth,
    y: point.y,  // Y 已经是绝对像素值
  };
}

/** 在 canvas 上绘制所有笔画 */
function drawAllStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: DrawingStroke[],
  canvasWidth: number,
  canvasHeight: number,
) {
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  for (const stroke of strokes) {
    if (stroke.points.length < 2) continue;

    ctx.beginPath();
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.lineWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // 橡皮擦用 destination-out 模式
    if (stroke.color === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.strokeStyle = "rgba(0,0,0,1)";
    } else {
      ctx.globalCompositeOperation = "source-over";
    }

    const first = toAbsolute(stroke.points[0], canvasWidth, canvasHeight);
    ctx.moveTo(first.x, first.y);

    for (let i = 1; i < stroke.points.length; i++) {
      const point = toAbsolute(stroke.points[i], canvasWidth, canvasHeight);
      ctx.lineTo(point.x, point.y);
    }

    ctx.stroke();
  }

  // 恢复默认合成模式
  ctx.globalCompositeOperation = "source-over";
}

export default function DrawingCanvas({
  width,
  height,
  strokes,
  color,
  lineWidth,
  isEraser,
  onStrokesChange,
}: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const currentStrokeRef = useRef<DrawingStroke | null>(null);
  const [devicePixelRatio, setDevicePixelRatio] = useState(1);

  useEffect(() => {
    setDevicePixelRatio(window.devicePixelRatio || 1);
  }, []);

  // 设置 canvas 的高清分辨率并绘制所有笔画
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = width * devicePixelRatio;
    canvas.height = height * devicePixelRatio;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    drawAllStrokes(ctx, strokes, width, height);
  }, [width, height, devicePixelRatio, strokes]);

  /** 获取坐标：X 相对(0-1)，Y 绝对像素 */
  const getRelativePoint = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };

      const rect = canvas.getBoundingClientRect();
      return {
        x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
        y: Math.max(0, (event.clientY - rect.top) / rect.height * height),  // 绝对像素
      };
    },
    [height],
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      event.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;

      canvas.setPointerCapture(event.pointerId);
      isDrawingRef.current = true;

      const point = getRelativePoint(event);
      currentStrokeRef.current = {
        points: [point],
        color: isEraser ? "eraser" : color,
        lineWidth: isEraser ? lineWidth * 3 : lineWidth,
      };
    },
    [color, lineWidth, isEraser, getRelativePoint],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isDrawingRef.current || !currentStrokeRef.current) return;
      event.preventDefault();

      const point = getRelativePoint(event);
      currentStrokeRef.current = {
        ...currentStrokeRef.current,
        points: [...currentStrokeRef.current.points, point],
      };

      // 实时绘制当前笔画
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // 重绘已保存笔画 + 当前笔画
      drawAllStrokes(
        ctx,
        [...strokes, currentStrokeRef.current],
        width,
        height,
      );
    },
    [strokes, width, height, getRelativePoint],
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isDrawingRef.current || !currentStrokeRef.current) return;
      event.preventDefault();

      const canvas = canvasRef.current;
      if (canvas) {
        canvas.releasePointerCapture(event.pointerId);
      }

      isDrawingRef.current = false;

      // 只保存有实际绘画的笔画（至少 2 个点）
      if (currentStrokeRef.current.points.length >= 2) {
        onStrokesChange([...strokes, currentStrokeRef.current]);
      }

      currentStrokeRef.current = null;
    },
    [strokes, onStrokesChange],
  );

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: `${width}px`,
        height: `${height}px`,
        touchAction: "none",
        cursor: isEraser ? "cell" : "crosshair",
      }}
      className="rounded-lg border border-dashed border-[rgba(55,53,47,0.12)] bg-white"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    />
  );
}
