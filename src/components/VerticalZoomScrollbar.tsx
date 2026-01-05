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
    const dragStartY = useRef(0);
    const startScrollTop = useRef(0);

    const totalHeight = totalItems * rowHeight;
    const thumbHeight = Math.max(20, (visibleHeight / totalHeight) * visibleHeight || 0);

    const maxScroll = Math.max(0, totalHeight - visibleHeight);
    const scrollRatio = maxScroll > 0 ? scrollTop / maxScroll : 0;
    const trackRange = visibleHeight - thumbHeight;
    const thumbTop = scrollRatio * trackRange;

    const handleMouseDown = (e: React.MouseEvent, type: 'thumb' | 'top' | 'bottom') => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(type);
        dragStartY.current = e.clientY;
        startScrollTop.current = scrollTop;
    };

    useEffect(() => {
        if (!isDragging) return;

        const handleMouseMove = (e: MouseEvent) => {
            const deltaY = e.clientY - dragStartY.current;

            if (isDragging === 'thumb') {
                const deltaRatio = deltaY / trackRange;
                const deltaScroll = deltaRatio * maxScroll;
                const newScroll = Math.max(0, Math.min(maxScroll, startScrollTop.current + deltaScroll));
                onScroll(newScroll);
            } else if (isDragging === 'top') {
                const newThumbTop = Math.max(0, thumbTop + deltaY);
                const currentThumbBottom = thumbTop + thumbHeight;
                const newThumbHeight = currentThumbBottom - newThumbTop;

                if (newThumbHeight < 20) return;

                const newTotalHeight = (visibleHeight * visibleHeight) / newThumbHeight;
                const newRowHeight = newTotalHeight / totalItems;

                const clampedRow = Math.max(minRowHeight, Math.min(maxRowHeight, newRowHeight));
                onZoom(clampedRow);
            } else if (isDragging === 'bottom') {
                const newThumbHeight = Math.max(20, thumbHeight + deltaY);
                const newTotalHeight = (visibleHeight * visibleHeight) / newThumbHeight;
                const newRowHeight = newTotalHeight / totalItems;
                const clampedRow = Math.max(minRowHeight, Math.min(maxRowHeight, newRowHeight));
                onZoom(clampedRow);
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
    }, [isDragging, maxScroll, trackRange, startScrollTop, rowHeight, thumbTop, thumbHeight, visibleHeight, totalItems, onScroll, onZoom, minRowHeight, maxRowHeight]);

    return (
        <div ref={trackRef} className="absolute right-0 top-0 bottom-0 w-4 bg-slate-900 border-l border-slate-700 select-none z-20">
            <div
                className="absolute bg-slate-600 rounded-sm w-3 left-0.5 hover:bg-slate-500 active:bg-slate-400 group cursor-grab active:cursor-grabbing"
                style={{ top: thumbTop, height: thumbHeight }}
                onMouseDown={(e) => handleMouseDown(e, 'thumb')}
            >
                {/* Top Handle */}
                <div
                    className="absolute top-0 left-0 right-0 h-2 bg-slate-400 opacity-0 group-hover:opacity-100 cursor-ns-resize rounded-t-sm"
                    onMouseDown={(e) => handleMouseDown(e, 'top')}
                />

                {/* Grip Lines */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col gap-0.5">
                    <div className="w-2 h-px bg-slate-800/50"></div>
                    <div className="w-2 h-px bg-slate-800/50"></div>
                    <div className="w-2 h-px bg-slate-800/50"></div>
                </div>

                {/* Bottom Handle */}
                <div
                    className="absolute bottom-0 left-0 right-0 h-2 bg-slate-400 opacity-0 group-hover:opacity-100 cursor-ns-resize rounded-b-sm"
                    onMouseDown={(e) => handleMouseDown(e, 'bottom')}
                />
            </div>
        </div>
    );
};
