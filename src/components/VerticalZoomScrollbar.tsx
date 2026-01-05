import React, { useRef, useState, useEffect } from 'react';

interface VerticalZoomScrollbarProps {
    totalItems: number; // Total rows
    rowHeight: number; // Current px per row
    visibleHeight: number; // Container height (px)
    scrollTop: number;
    onScroll: (newTop: number) => void;
    onZoom: (newRowHeight: number) => void;
    minRowHeight?: number;
    maxRowHeight?: number;
}

export const VerticalZoomScrollbar: React.FC<VerticalZoomScrollbarProps> = ({
    totalItems,
    rowHeight,
    visibleHeight,
    scrollTop,
    onScroll,
    onZoom,
    minRowHeight = 10,
    maxRowHeight = 100
}) => {
    const trackRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState<'thumb' | 'top' | 'bottom' | null>(null);

    // Use refs for values needed in mousemove to avoid effect re-attachment jitter
    const stateRef = useRef({
        dragStartY: 0,
        startScrollTop: 0,
        rowHeight,
        scrollTop,
        totalItems,
        visibleHeight
    });

    useEffect(() => {
        stateRef.current = {
            dragStartY: stateRef.current.dragStartY,
            startScrollTop: stateRef.current.startScrollTop,
            rowHeight,
            scrollTop,
            totalItems,
            visibleHeight
        };
    }, [rowHeight, scrollTop, totalItems, visibleHeight]);

    const totalHeight = Math.max(1, totalItems * rowHeight);
    const visibleH = Math.max(1, visibleHeight);
    const thumbHeight = Math.max(24, (visibleH / totalHeight) * visibleH || 0);

    const maxScroll = Math.max(0, totalHeight - visibleH);
    const scrollRatio = maxScroll > 0 ? scrollTop / maxScroll : 0;
    const trackRange = Math.max(1, visibleH - thumbHeight);
    const thumbTop = Math.max(0, Math.min(trackRange, scrollRatio * trackRange));

    const handleMouseDown = (e: React.MouseEvent, type: 'thumb' | 'top' | 'bottom') => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(type);
        stateRef.current.dragStartY = e.clientY;
        stateRef.current.startScrollTop = scrollTop;
    };

    useEffect(() => {
        if (!isDragging) return;

        const handleMouseMove = (e: MouseEvent) => {
            const { dragStartY, startScrollTop, rowHeight: curRowH, totalItems: curTotal, visibleHeight: curVisH } = stateRef.current;
            const deltaY = e.clientY - dragStartY;

            const safeVisH = Math.max(1, curVisH);
            const curTotalH = Math.max(1, curTotal * curRowH);
            const curMaxScroll = Math.max(0, curTotalH - safeVisH);
            const curThumbH = Math.max(24, (safeVisH / curTotalH) * safeVisH || 0);
            const curTrackRange = Math.max(1, safeVisH - curThumbH);

            if (isDragging === 'thumb') {
                const deltaRatio = deltaY / curTrackRange;
                const deltaScroll = deltaRatio * curMaxScroll;
                const newScroll = Math.max(0, Math.min(curMaxScroll, startScrollTop + deltaScroll));
                onScroll(newScroll);
            } else if (isDragging === 'top') {
                const scrollRatio = curMaxScroll > 0 ? startScrollTop / curMaxScroll : 0;
                const thumbTop = scrollRatio * curTrackRange;

                const newThumbTop = Math.max(0, thumbTop + deltaY);
                const currentThumbBottom = thumbTop + curThumbH;
                const newThumbHeight = Math.max(24, currentThumbBottom - newThumbTop);

                const newTotalHeight = (safeVisH * safeVisH) / newThumbHeight;
                const newRowHeight = newTotalHeight / curTotal;

                onZoom(Math.max(minRowHeight, Math.min(maxRowHeight, newRowHeight)));
            } else if (isDragging === 'bottom') {
                const newThumbHeight = Math.max(24, curThumbH + deltaY);

                const newTotalHeight = (safeVisH * safeVisH) / newThumbHeight;
                const newRowHeight = newTotalHeight / curTotal;
                onZoom(Math.max(minRowHeight, Math.min(maxRowHeight, newRowHeight)));
            }
        };

        const handleMouseUp = () => {
            setIsDragging(null);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, onScroll, onZoom, minRowHeight, maxRowHeight]);

    return (
        <div
            ref={trackRef}
            className="absolute right-0 top-0 bottom-0 w-6 bg-slate-900/80 border-l border-white/5 select-none z-50 flex justify-center"
            onMouseDown={e => e.stopPropagation()}
        >
            <div
                className="absolute bg-slate-700 rounded-full w-2.5 hover:bg-slate-500 active:bg-sky-500 transition-colors cursor-grab active:cursor-grabbing group shadow-lg"
                style={{ top: thumbTop, height: thumbHeight }}
                onMouseDown={(e) => handleMouseDown(e, 'thumb')}
            >
                {/* Top Handle - Invisible hit area but visible on hover */}
                <div
                    className="absolute -top-1 left-0 right-0 h-4 cursor-ns-resize z-10 flex items-start justify-center"
                    onMouseDown={(e) => handleMouseDown(e, 'top')}
                >
                    <div className="w-4 h-1 bg-white/20 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>

                {/* Visual Grips */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col gap-1 opacity-50">
                    <div className="w-1.5 h-1.5 rounded-full bg-white"></div>
                    <div className="w-1.5 h-1.5 rounded-full bg-white"></div>
                </div>

                {/* Bottom Handle */}
                <div
                    className="absolute -bottom-1 left-0 right-0 h-4 cursor-ns-resize z-10 flex items-end justify-center"
                    onMouseDown={(e) => handleMouseDown(e, 'bottom')}
                >
                    <div className="w-4 h-1 bg-white/20 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
            </div>
        </div>
    );
};
