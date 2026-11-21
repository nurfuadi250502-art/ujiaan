import React, { useRef, useState } from 'react';
import { Trash2, Copy, Bold } from 'lucide-react';
import type { CanvasElement, CanvasPoint, CanvasToolMode } from '../types/exam';

interface CanvasLayerOverlayProps {
  pageIndex: number;
  pageWidthMm: number;
  pageHeightMm: number;
  mmToPx: number;
  zoom: number;
  elements: CanvasElement[];
  toolMode: CanvasToolMode;
  drawColor: string;
  drawWidthMm: number;
  selectedId: string | null;
  readOnly?: boolean;
  onSelectElement?: (id: string | null) => void;
  onChangeElement?: (el: CanvasElement) => void;
  onAddElement?: (el: CanvasElement) => void;
  onDeleteElement?: (id: string) => void;
}

function pointsToSvgPath(points: CanvasPoint[], mmToPx: number): string {
  if (!points || points.length === 0) return '';
  if (points.length === 1) {
    const p = points[0];
    return `M ${(p.xMm * mmToPx).toFixed(2)} ${(p.yMm * mmToPx).toFixed(2)} l 0.5 0.5`;
  }
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${(p.xMm * mmToPx).toFixed(2)} ${(p.yMm * mmToPx).toFixed(2)}`)
    .join(' ');
}

export const CanvasLayerOverlay: React.FC<CanvasLayerOverlayProps> = ({
  pageIndex,
  pageWidthMm,
  pageHeightMm,
  mmToPx,
  zoom,
  elements,
  toolMode,
  drawColor,
  drawWidthMm,
  selectedId,
  readOnly = false,
  onSelectElement,
  onChangeElement,
  onAddElement,
  onDeleteElement,
}) => {
  const layerRef = useRef<HTMLDivElement>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [livePoints, setLivePoints] = useState<CanvasPoint[] | null>(null);

  const pageElements = elements.filter((el) => el.pageIndex === pageIndex);
  const pageWidthPx = pageWidthMm * mmToPx;
  const pageHeightPx = pageHeightMm * mmToPx;

  const clientToMm = (clientX: number, clientY: number): CanvasPoint => {
    const rect = layerRef.current?.getBoundingClientRect();
    if (!rect) return { xMm: 0, yMm: 0 };
    const effectiveScale = zoom || 1;
    const xPx = (clientX - rect.left) / effectiveScale;
    const yPx = (clientY - rect.top) / effectiveScale;
    return {
      xMm: Math.max(0, Math.min(pageWidthMm, xPx / mmToPx)),
      yMm: Math.max(0, Math.min(pageHeightMm, yPx / mmToPx)),
    };
  };

  const handleDrawPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (readOnly || toolMode !== 'draw') return;
    e.preventDefault();
    e.stopPropagation();
    const startPt = clientToMm(e.clientX, e.clientY);
    const collected: CanvasPoint[] = [startPt];
    setLivePoints(collected);

    const onMove = (mv: PointerEvent) => {
      const pt = clientToMm(mv.clientX, mv.clientY);
      const last = collected[collected.length - 1];
      if (!last || Math.hypot(pt.xMm - last.xMm, pt.yMm - last.yMm) >= 0.4) {
        collected.push(pt);
        setLivePoints([...collected]);
      }
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setLivePoints(null);
      if (collected.length >= 1 && onAddElement) {
        const xs = collected.map((p) => p.xMm);
        const ys = collected.map((p) => p.yMm);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        onAddElement({
          id: `cv_draw_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          pageIndex,
          kind: 'drawing',
          xMm: minX,
          yMm: minY,
          wMm: Math.max(2, maxX - minX),
          hMm: Math.max(2, maxY - minY),
          strokeColor: drawColor,
          strokeWidthMm: drawWidthMm,
          points: collected,
        });
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const startDragElement = (e: React.PointerEvent, el: CanvasElement) => {
    if (readOnly || toolMode !== 'select' || editingTextId === el.id) return;
    e.stopPropagation();
    e.preventDefault();
    onSelectElement?.(el.id);

    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const origX = el.xMm;
    const origY = el.yMm;
    const origPoints = el.points ? el.points.map((p) => ({ ...p })) : undefined;

    const onMove = (mv: PointerEvent) => {
      const dxMm = (mv.clientX - startClientX) / (zoom * mmToPx);
      const dyMm = (mv.clientY - startClientY) / (zoom * mmToPx);
      const nextX = Math.max(0, Math.min(pageWidthMm - Math.min(el.wMm, 12), origX + dxMm));
      const nextY = Math.max(0, Math.min(pageHeightMm - Math.min(el.hMm, 12), origY + dyMm));
      const actualDx = nextX - origX;
      const actualDy = nextY - origY;

      onChangeElement?.({
        ...el,
        xMm: Number(nextX.toFixed(2)),
        yMm: Number(nextY.toFixed(2)),
        ...(origPoints
          ? {
              points: origPoints.map((pt) => ({
                xMm: Number((pt.xMm + actualDx).toFixed(2)),
                yMm: Number((pt.yMm + actualDy).toFixed(2)),
              })),
            }
          : {}),
      });
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const startResizeElement = (e: React.PointerEvent, el: CanvasElement) => {
    if (readOnly) return;
    e.stopPropagation();
    e.preventDefault();
    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const origW = el.wMm;
    const origH = el.hMm;

    const onMove = (mv: PointerEvent) => {
      const dwMm = (mv.clientX - startClientX) / (zoom * mmToPx);
      const dhMm = (mv.clientY - startClientY) / (zoom * mmToPx);
      const nextW = Math.max(8, Math.min(pageWidthMm - el.xMm, origW + dwMm));
      const nextH =
        el.kind === 'line'
          ? origH
          : Math.max(6, Math.min(pageHeightMm - el.yMm, origH + dhMm));

      onChangeElement?.({
        ...el,
        wMm: Number(nextW.toFixed(2)),
        hMm: Number(nextH.toFixed(2)),
      });
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const drawings = pageElements.filter((el) => el.kind === 'drawing');
  const boxElements = pageElements.filter((el) => el.kind !== 'drawing');

  return (
    <div
      ref={layerRef}
      onPointerDown={handleDrawPointerDown}
      className={`absolute inset-0 z-20 ${
        !readOnly && toolMode === 'draw'
          ? 'cursor-crosshair pointer-events-auto'
          : 'pointer-events-none'
      }`}
    >
      {/* Vector Freehand Pen Drawings Layer */}
      {(drawings.length > 0 || (livePoints && livePoints.length > 0)) && (
        <svg
          width={pageWidthPx}
          height={pageHeightPx}
          viewBox={`0 0 ${pageWidthPx} ${pageHeightPx}`}
          className="absolute inset-0 pointer-events-none overflow-visible"
        >
          {drawings.map((d) => (
            <path
              key={d.id}
              d={pointsToSvgPath(d.points || [], mmToPx)}
              fill="none"
              stroke={d.strokeColor || '#0F172A'}
              strokeWidth={(d.strokeWidthMm || 0.5) * mmToPx}
              strokeLinecap="round"
              strokeLinejoin="round"
              className={!readOnly && toolMode === 'select' ? 'pointer-events-auto cursor-move' : ''}
              onPointerDown={(e) => startDragElement(e, d)}
            />
          ))}
          {livePoints && livePoints.length > 0 && (
            <path
              d={pointsToSvgPath(livePoints, mmToPx)}
              fill="none"
              stroke={drawColor}
              strokeWidth={drawWidthMm * mmToPx}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </svg>
      )}

      {/* Draggable & Resizable Objects Layer (Text Boxes, Images, Boxes, Lines) */}
      {boxElements.map((el) => {
        const isSelected = !readOnly && selectedId === el.id;
        const leftPx = el.xMm * mmToPx;
        const topPx = el.yMm * mmToPx;
        const widthPx = el.wMm * mmToPx;
        const heightPx = el.hMm * mmToPx;

        return (
          <div
            key={el.id}
            style={{
              left: `${leftPx}px`,
              top: `${topPx}px`,
              width: `${widthPx}px`,
              height: el.kind === 'line' ? `${Math.max(10, (el.strokeWidthMm || 0.6) * mmToPx + 8)}px` : `${heightPx}px`,
            }}
            onPointerDown={(e) => startDragElement(e, el)}
            onDoubleClick={(e) => {
              if (readOnly || el.kind !== 'text') return;
              e.stopPropagation();
              setEditingTextId(el.id);
              onSelectElement?.(el.id);
            }}
            className={`absolute ${
              !readOnly && toolMode === 'select' ? 'pointer-events-auto' : 'pointer-events-none'
            } ${
              isSelected
                ? 'ring-2 ring-sky-500 ring-offset-1'
                : !readOnly && toolMode === 'select'
                ? 'hover:ring-1 hover:ring-sky-400/70'
                : ''
            } ${editingTextId === el.id ? 'cursor-text' : !readOnly && toolMode === 'select' ? 'cursor-move' : ''}`}
          >
            {/* Selected Floating Quick Toolbar */}
            {isSelected && (
              <div
                onPointerDown={(e) => e.stopPropagation()}
                className="no-print absolute -top-9 left-0 z-40 flex items-center gap-1 bg-slate-900 text-white px-2 py-1 rounded-md shadow-lg text-[11px] font-sans whitespace-nowrap"
              >
                {el.kind === 'text' && (
                  <>
                    <button
                      type="button"
                      onClick={() => onChangeElement?.({ ...el, bold: !el.bold })}
                      className={`p-1 rounded ${el.bold ? 'bg-sky-600' : 'hover:bg-white/15'}`}
                      title="Tebal"
                    >
                      <Bold className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onChangeElement?.({
                          ...el,
                          fontSizePt: Math.max(7, (el.fontSizePt || 11) - 1),
                        })
                      }
                      className="px-1.5 py-0.5 rounded hover:bg-white/15 font-mono"
                      title="Perkecil huruf"
                    >
                      A-
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onChangeElement?.({
                          ...el,
                          fontSizePt: Math.min(28, (el.fontSizePt || 11) + 1),
                        })
                      }
                      className="px-1.5 py-0.5 rounded hover:bg-white/15 font-mono"
                      title="Perbesar huruf"
                    >
                      A+
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onChangeElement?.({
                          ...el,
                          borderColor: el.borderColor ? undefined : '#0F172A',
                        })
                      }
                      className="px-1.5 py-0.5 rounded hover:bg-white/15"
                      title="Garis tepi kotak"
                    >
                      Bingkai
                    </button>
                  </>
                )}
                {(el.kind === 'box' || el.kind === 'line') && (
                  <button
                    type="button"
                    onClick={() => onChangeElement?.({ ...el, dashed: !el.dashed })}
                    className="px-1.5 py-0.5 rounded hover:bg-white/15"
                    title="Putus-putus / Penuh"
                  >
                    {el.dashed ? 'Penuh' : 'Putus²'}
                  </button>
                )}
                {onAddElement && (
                  <button
                    type="button"
                    onClick={() =>
                      onAddElement({
                        ...el,
                        id: `cv_dup_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
                        xMm: Math.min(pageWidthMm - el.wMm, el.xMm + 6),
                        yMm: Math.min(pageHeightMm - el.hMm, el.yMm + 6),
                      })
                    }
                    className="p-1 rounded hover:bg-white/15"
                    title="Duplikasi elemen"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                )}
                {onDeleteElement && (
                  <button
                    type="button"
                    onClick={() => onDeleteElement(el.id)}
                    className="p-1 rounded text-rose-300 hover:bg-rose-600/40 hover:text-white"
                    title="Hapus elemen"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            )}

            {/* Element Visual Content */}
            {el.kind === 'text' && (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  fontSize: `${el.fontSizePt || 11}pt`,
                  color: el.color || '#0F172A',
                  backgroundColor: el.bgColor || 'rgba(255,255,255,0.88)',
                  border: el.borderColor ? `1px solid ${el.borderColor}` : 'none',
                  fontWeight: el.bold ? 700 : 400,
                  textAlign: el.align || 'left',
                  padding: '3px 6px',
                  lineHeight: 1.3,
                  overflow: 'hidden',
                }}
              >
                {editingTextId === el.id ? (
                  <textarea
                    autoFocus
                    value={el.text || ''}
                    onChange={(e) => onChangeElement?.({ ...el, text: e.target.value })}
                    onBlur={() => setEditingTextId(null)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setEditingTextId(null);
                    }}
                    className="w-full h-full bg-transparent outline-none resize-none"
                    style={{
                      fontSize: 'inherit',
                      fontWeight: 'inherit',
                      color: 'inherit',
                      textAlign: 'inherit',
                    }}
                  />
                ) : (
                  <div className="whitespace-pre-wrap break-words w-full h-full">
                    {el.text || 'Klik ganda untuk ubah teks'}
                  </div>
                )}
              </div>
            )}

            {el.kind === 'image' && el.dataUrl && (
              <img
                src={el.dataUrl}
                alt="Gambar Soal"
                draggable={false}
                className="w-full h-full object-contain select-none"
              />
            )}

            {el.kind === 'box' && (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  backgroundColor: el.fillColor || 'transparent',
                  borderColor: el.strokeColor || '#0F172A',
                  borderWidth: `${Math.max(1, (el.strokeWidthMm || 0.4) * mmToPx)}px`,
                  borderStyle: el.dashed ? 'dashed' : 'solid',
                }}
              />
            )}

            {el.kind === 'line' && (
              <div className="w-full h-full flex items-center">
                <div
                  style={{
                    width: '100%',
                    borderTopColor: el.strokeColor || '#0F172A',
                    borderTopWidth: `${Math.max(1, (el.strokeWidthMm || 0.5) * mmToPx)}px`,
                    borderTopStyle: el.dashed ? 'dashed' : 'solid',
                  }}
                />
              </div>
            )}

            {/* Corner Resize Handle */}
            {isSelected && (
              <div
                onPointerDown={(e) => startResizeElement(e, el)}
                className="no-print absolute -right-1.5 -bottom-1.5 w-3.5 h-3.5 bg-white border-2 border-sky-600 rounded-sm cursor-nwse-resize shadow"
                title="Seret untuk mengubah ukuran"
              />
            )}
          </div>
        );
      })}

      {/* Floating delete action when a freehand drawing is selected */}
      {!readOnly &&
        selectedId &&
        drawings.some((d) => d.id === selectedId) &&
        (() => {
          const d = drawings.find((x) => x.id === selectedId)!;
          return (
            <div
              style={{
                left: `${d.xMm * mmToPx}px`,
                top: `${Math.max(0, d.yMm * mmToPx - 28)}px`,
              }}
              className="no-print pointer-events-auto absolute z-40 flex items-center gap-1 bg-slate-900 text-white px-2 py-1 rounded-md shadow-lg text-[11px] font-sans"
            >
              <span>Coretan</span>
              {onDeleteElement && (
                <button
                  type="button"
                  onClick={() => onDeleteElement(d.id)}
                  className="p-0.5 rounded text-rose-300 hover:bg-rose-600/40 hover:text-white"
                  title="Hapus coretan"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          );
        })()}
    </div>
  );
};
