/**
 * ドラッグ・ピンチ・ホイールで拡大縮小できる SVG。
 * 子要素には現在の「1画面px あたりの SVG単位」（unit）を渡すので、
 * 線の太さや文字サイズを画面上で一定に保てる。
 */
import { useCallback, useEffect, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from 'react'

export interface View { x: number; y: number; w: number; h: number }
export interface PanZoomHandle {
  focus: (x: number, y: number, w?: number) => void
  fit: () => void
}

interface Props {
  bounds: View
  children: (unit: number, view: View) => ReactNode
  initial?: View
  minW?: number
  className?: string
  handle?: Ref<PanZoomHandle>
  /** タップ（ドラッグでない）時のSVG座標 */
  onTap?: (x: number, y: number, unit: number) => void
}

export function PanZoomSvg({ bounds, children, initial, minW = 20, className, handle, onTap }: Props) {
  const ref = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [view, setView] = useState<View>(initial ?? bounds)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{ moved: boolean; dist?: number; startView: View; start: { x: number; y: number } } | null>(null)
  const anim = useRef<number>(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth || 1, h: el.clientHeight || 1 }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // アスペクト比を画面に合わせる
  const aspect = size.w > 0 ? size.h / size.w : 1
  const fitted: View = { x: view.x, y: view.y, w: view.w, h: view.w * aspect }

  const clamp = useCallback(
    (v: View): View => {
      const w = Math.max(minW, Math.min(v.w, bounds.w * 1.6))
      const cx = Math.max(bounds.x, Math.min(bounds.x + bounds.w, v.x + v.w / 2))
      const cy = Math.max(bounds.y, Math.min(bounds.y + bounds.h, v.y + (v.w * aspect) / 2))
      return { x: cx - w / 2, y: cy - (w * aspect) / 2, w, h: w * aspect }
    },
    [bounds, minW, aspect],
  )

  const animateTo = useCallback(
    (target: View) => {
      cancelAnimationFrame(anim.current)
      const from = view
      const t0 = performance.now()
      const step = (t: number) => {
        const k = Math.min(1, (t - t0) / 450)
        const e = 1 - Math.pow(1 - k, 3)
        setView({
          x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e,
          w: from.w + (target.w - from.w) * e, h: from.h + (target.h - from.h) * e,
        })
        if (k < 1) anim.current = requestAnimationFrame(step)
      }
      anim.current = requestAnimationFrame(step)
    },
    [view],
  )

  useImperativeHandle(handle, () => ({
    focus: (x, y, w) => {
      touched.current = true
      const nw = w ?? Math.min(view.w, bounds.w / 3)
      animateTo(clamp({ x: x - nw / 2, y: y - (nw * aspect) / 2, w: nw, h: nw * aspect }))
    },
    fit: () => {
      const w = Math.max(bounds.w, bounds.h / aspect)
      animateTo({ x: bounds.x + bounds.w / 2 - w / 2, y: bounds.y + bounds.h / 2 - (w * aspect) / 2, w, h: w * aspect })
    },
  }), [animateTo, bounds, clamp, view.w, aspect])

  // ユーザーが操作するまでは、サイズが変わるたびに全体が収まるように合わせる
  const touched = useRef(false)
  useEffect(() => {
    if (touched.current || size.w <= 1) return
    if (!initial) {
      const w = Math.max(bounds.w, bounds.h / aspect)
      setView({ x: bounds.x + bounds.w / 2 - w / 2, y: bounds.y + bounds.h / 2 - (w * aspect) / 2, w, h: w * aspect })
    }
  }, [size, bounds, aspect, initial])

  const toSvg = (cx: number, cy: number, v = fitted) => {
    const r = ref.current!.getBoundingClientRect()
    return { x: v.x + ((cx - r.left) / r.width) * v.w, y: v.y + ((cy - r.top) / r.height) * v.h }
  }

  const zoomAt = (cx: number, cy: number, factor: number, base = fitted) => {
    const p = toSvg(cx, cy, base)
    const w = Math.max(minW, Math.min(base.w * factor, bounds.w * 1.6))
    const k = w / base.w
    return clamp({ x: p.x - (p.x - base.x) * k, y: p.y - (p.y - base.y) * k, w, h: w * aspect })
  }

  const onPointerDown = (e: React.PointerEvent) => {
    cancelAnimationFrame(anim.current)
    touched.current = true
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const pts = [...pointers.current.values()]
    if (pts.length === 1) gesture.current = { moved: false, startView: fitted, start: pts[0] }
    else if (pts.length === 2) {
      gesture.current = {
        moved: true, startView: fitted, start: { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 },
        dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
      }
    }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId) || !gesture.current) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const pts = [...pointers.current.values()]
    const g = gesture.current
    const r = ref.current!.getBoundingClientRect()
    if (pts.length === 1) {
      const dx = pts[0].x - g.start.x
      const dy = pts[0].y - g.start.y
      if (Math.abs(dx) + Math.abs(dy) > 6) g.moved = true
      if (!g.moved) return
      const sv = g.startView
      setView(clamp({ ...sv, x: sv.x - (dx / r.width) * sv.w, y: sv.y - (dy / r.height) * sv.h }))
    } else if (pts.length === 2 && g.dist) {
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      const sv = g.startView
      const zoomed = zoomAt(g.start.x, g.start.y, g.dist / dist, sv)
      const dx = ((mid.x - g.start.x) / r.width) * zoomed.w
      const dy = ((mid.y - g.start.y) / r.height) * zoomed.h
      setView(clamp({ ...zoomed, x: zoomed.x - dx, y: zoomed.y - dy }))
    }
  }
  const onPointerUp = (e: React.PointerEvent) => {
    const g = gesture.current
    pointers.current.delete(e.pointerId)
    if (pointers.current.size === 0) {
      if (g && !g.moved && onTap) {
        const p = toSvg(e.clientX, e.clientY)
        onTap(p.x, p.y, fitted.w / size.w)
      }
      gesture.current = null
    } else if (pointers.current.size === 1) {
      const p = [...pointers.current.values()][0]
      gesture.current = { moved: true, startView: fitted, start: p }
    }
  }

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      touched.current = true
      setView((v) => {
        const base = { ...v, h: v.w * aspect }
        const r = el.getBoundingClientRect()
        const p = { x: base.x + ((e.clientX - r.left) / r.width) * base.w, y: base.y + ((e.clientY - r.top) / r.height) * base.h }
        const w = Math.max(minW, Math.min(base.w * Math.exp(e.deltaY * 0.0015), bounds.w * 1.6))
        const k = w / base.w
        return clamp({ x: p.x - (p.x - base.x) * k, y: p.y - (p.y - base.y) * k, w, h: w * aspect })
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [aspect, bounds, clamp, minW])

  const zoomBtn = (f: number) => setView(zoomAt(ref.current!.getBoundingClientRect().left + size.w / 2, ref.current!.getBoundingClientRect().top + size.h / 2, f))

  const unit = size.w > 0 ? fitted.w / size.w : 1
  return (
    <div className={`panzoom ${className ?? ''}`}>
      <svg
        ref={ref}
        viewBox={`${fitted.x} ${fitted.y} ${fitted.w} ${fitted.h}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ touchAction: 'none' }}
      >
        {size.w > 0 && children(unit, fitted)}
      </svg>
      <div className="zoom-buttons">
        <button onClick={() => zoomBtn(0.6)} aria-label="拡大">＋</button>
        <button onClick={() => zoomBtn(1.6)} aria-label="縮小">－</button>
      </div>
    </div>
  )
}
