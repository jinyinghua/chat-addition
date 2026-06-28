'use client';

import { useEffect, useRef } from 'react';

/**
 * 生命体烟雾 / Google 流体渐变光环 Canvas
 *
 * 原理：
 * - 32 个重叠的大半径粒子（blur 由 CSS 提供），形成流动的彩色烟雾。
 * - 正常情况下粒子跟随鼠标，形成一个呼吸的发光球。
 * - hover 在 .interactive-capsule 上时，粒子精确包裹胶囊轮廓。
 * - 鼠标失去焦点 / loading 时粒子散开。
 */
export function SmokeCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d')!;

    let width = 0, height = 0;
    const resize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', resize);
    resize();

    // ---- 鼠标追踪 ----
    const mouse = { x: width / 2, y: height / 2 };
    const targetMouse = { x: width / 2, y: height / 2 };
    const onMouseMove = (e: MouseEvent) => {
      targetMouse.x = e.clientX;
      targetMouse.y = e.clientY;
    };
    window.addEventListener('mousemove', onMouseMove);

    // ---- 状态 ----
    type State = 'normal' | 'scatter' | 'attract';
    let smokeState: State = 'normal';
    let activeElement: HTMLElement | null = null;

    const onBlur = () => { smokeState = 'scatter'; };
    const onFocus = () => { smokeState = 'normal'; };
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);

    // 监听自定义事件：send / loading 触发 scatter
    const onLoadingChange = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      smokeState = detail?.loading ? 'scatter' : 'normal';
    };
    window.addEventListener('smoke-loading', onLoadingChange);

    // 监听胶囊 hover (使用全局事件委托)
    const onMouseOver = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('.interactive-capsule') as HTMLElement | null;
      if (target) {
        smokeState = 'attract';
        activeElement = target;
      }
    };
    const onMouseOut = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('.interactive-capsule') as HTMLElement | null;
      if (!target) return;
      const related = (e.relatedTarget as HTMLElement)?.closest('.interactive-capsule');
      if (!related) {
        smokeState = 'normal';
        activeElement = null;
      }
    };
    document.addEventListener('mouseover', onMouseOver);
    document.addEventListener('mouseout', onMouseOut);

    // ---- 粒子系统 ----
    const numParticles = 32;
    const googleColors = ['#4285F4', '#EA4335', '#FBBC05', '#34A853'];
    const particles: { color: string; x: number; y: number }[] = [];
    for (let i = 0; i < numParticles; i++) {
      const colorPhase = Math.floor((i / numParticles) * 4);
      particles.push({
        color: googleColors[colorPhase],
        x: width / 2,
        y: height / 2,
      });
    }

    let globalOffset = 0;

    // 获取圆角矩形周长上的点 (支持胶囊形)
    function getRoundedRectPoint(
      cx: number, cy: number, w: number, h: number, r: number, t: number,
    ) {
      const tw = Math.max(0, w - 2 * r);
      const th = Math.max(0, h - 2 * r);
      const pLength = 2 * tw + 2 * th + 2 * Math.PI * r;
      let d = ((t % 1) + 1) % 1 * pLength;

      // Top
      if (d < tw) return { x: cx - tw / 2 + d, y: cy - h / 2 };
      d -= tw;
      const cornerLen = (Math.PI * r) / 2;
      // Top-Right
      if (d < cornerLen) {
        const a = -Math.PI / 2 + (d / cornerLen) * (Math.PI / 2);
        return { x: cx + tw / 2 + r * Math.cos(a), y: cy - th / 2 + r * Math.sin(a) };
      }
      d -= cornerLen;
      // Right
      if (d < th) return { x: cx + w / 2, y: cy - th / 2 + d };
      d -= th;
      // Bottom-Right
      if (d < cornerLen) {
        const a = 0 + (d / cornerLen) * (Math.PI / 2);
        return { x: cx + tw / 2 + r * Math.cos(a), y: cy + th / 2 + r * Math.sin(a) };
      }
      d -= cornerLen;
      // Bottom
      if (d < tw) return { x: cx + tw / 2 - d, y: cy + h / 2 };
      d -= tw;
      // Bottom-Left
      if (d < cornerLen) {
        const a = Math.PI / 2 + (d / cornerLen) * (Math.PI / 2);
        return { x: cx - tw / 2 + r * Math.cos(a), y: cy + th / 2 + r * Math.sin(a) };
      }
      d -= cornerLen;
      // Left
      if (d < th) return { x: cx - w / 2, y: cy + th / 2 - d };
      d -= th;
      // Top-Left
      const a = Math.PI + (d / cornerLen) * (Math.PI / 2);
      return { x: cx - tw / 2 + r * Math.cos(a), y: cy - th / 2 + r * Math.sin(a) };
    }

    let animId: number;

    function animate() {
      ctx.clearRect(0, 0, width, height);

      ctx.globalCompositeOperation = 'source-over';

      mouse.x += (targetMouse.x - mouse.x) * 0.1;
      mouse.y += (targetMouse.y - mouse.y) * 0.1;

      globalOffset += smokeState === 'attract' ? 0.008 : 0.004;

      for (let i = 0; i < numParticles; i++) {
        const p = particles[i];
        const t = (i / numParticles + globalOffset) % 1;
        let tx: number, ty: number;

        if (smokeState === 'attract' && activeElement) {
          // 吸附态：每帧实时读取元素位置，跟随滚动/移动
          const r = activeElement.getBoundingClientRect();
          const cx = r.left + r.width / 2;
          const cy = r.top + r.height / 2;
          const pad = 24;
          const wrappedW = r.width + pad * 2;
          const wrappedH = r.height + pad * 2;
          const wrappedR = Math.min(wrappedW, wrappedH) / 2;
          const pt = getRoundedRectPoint(cx, cy, wrappedW, wrappedH, wrappedR, t);
          tx = pt.x;
          ty = pt.y;
        } else {
          // 集中 / 散开态：生命体呼吸
          const baseRadius = smokeState === 'scatter' ? 140 : 40;
          const breathe = Math.sin(t * Math.PI * 4 + globalOffset * 15) * 15;
          const r = baseRadius + breathe;
          tx = mouse.x + Math.cos(t * Math.PI * 2) * r;
          ty = mouse.y + Math.sin(t * Math.PI * 2) * r;
        }

        // 惯性缓动
        p.x += (tx - p.x) * 0.12;
        p.y += (ty - p.y) * 0.12;

        ctx.beginPath();
        ctx.arc(p.x, p.y, 45, 0, Math.PI * 2);
        ctx.fillStyle = p.color + 'E6';
        ctx.fill();
      }

      animId = requestAnimationFrame(animate);
    }

    animId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('smoke-loading', onLoadingChange);
      document.removeEventListener('mouseover', onMouseOver);
      document.removeEventListener('mouseout', onMouseOut);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      id="smoke-canvas"
      className="fixed inset-0 z-0 pointer-events-none"
      style={{ filter: 'blur(75px)', opacity: 0.95 }}
    />
  );
}
