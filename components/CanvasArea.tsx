import React, { useRef, useState, useEffect, useLayoutEffect } from 'react';
import { Stage, Layer, Image as KonvaImage, Rect, Group, Line, Circle, Text, Arrow, Transformer } from 'react-konva';
import useImage from 'use-image';
import Konva from 'konva';
// Explicitly import shapes to ensure they are registered with Konva Core
import 'konva/lib/shapes/Rect';
import 'konva/lib/shapes/Image';
import 'konva/lib/shapes/Line';
import 'konva/lib/shapes/Circle';
import 'konva/lib/shapes/Text';
import 'konva/lib/shapes/Arrow';
import 'konva/lib/shapes/Transformer';

import { v4 as uuidv4 } from 'uuid';
import { usePatentStore } from '../store';
import { ToolMode, StartStyle, Point, Annotation } from '../types';
import { 
    getBezierPoint, 
    calculateSmartControlPoints, 
    findSnapLine, 
    calculateTextDirection,
    TextDirection,
    calculateArrowPoints,
    cycleStartStyle 
} from '../utils/geometry';
import { 
    ALIGNMENT_LINE_COLOR, 
    ALIGNMENT_LINE_WIDTH, 
    SNAP_THRESHOLD_PX,
    TEXT_OFFSET_PX,
    ANNOTATION_COLOR,
    ANNOTATION_SELECTED_COLOR
} from '../constants';

interface CanvasAreaProps {
  stageRef: React.RefObject<Konva.Stage>;
}

// Helper to determine the next label number
const getNextLabel = (annotations: Annotation[], step: number, startValue: number): string => {
  let max = -Infinity;
  let hasNumber = false;
  
  annotations.forEach((a) => {
    const val = parseInt(a.text, 10);
    if (!isNaN(val)) {
      hasNumber = true;
      if (val > max) max = val;
    }
  });

  if (!hasNumber) {
      return startValue.toString();
  }
  return (max + step).toString();
};

// Canvas context for measuring text width accurately
let measureContext: CanvasRenderingContext2D | null = null;
const getTextWidth = (text: string, fontSize: number): number => {
    if (!measureContext) {
        const canvas = document.createElement('canvas');
        measureContext = canvas.getContext('2d');
    }
    if (measureContext) {
        measureContext.font = `${fontSize}px Arial`;
        return measureContext.measureText(text).width;
    }
    return text.length * fontSize * 0.6; // Fallback
};

const getLabelTransform = (
    endPoint: Point, 
    controlPoint2: Point, 
    text: string, 
    fontSize: number, 
    gap: number
): { x: number, y: number, align: string, offsetX: number, offsetY: number, direction: TextDirection } => {
    const direction = calculateTextDirection(endPoint, controlPoint2);
    const width = getTextWidth(text, fontSize);
    const height = fontSize; // Approximate height for centering (Arial cap height)

    let x = endPoint.x;
    let y = endPoint.y;
    let offsetX = 0;
    // We center text vertically using offsetY = fontSize / 2, 
    // so y corresponds to the vertical center of the text block.

    switch (direction) {
        case 'RIGHT':
            x = endPoint.x + gap;
            y = endPoint.y;
            offsetX = 0; // Anchor is left edge
            break;
        case 'LEFT':
            x = endPoint.x - gap;
            y = endPoint.y;
            offsetX = width; // Anchor is right edge
            break;
        case 'UP':
            x = endPoint.x;
            y = endPoint.y - gap;
            offsetX = width / 2; // Center horizontally
            // The default Text rendering with verticalAlign="middle" and offsetY=height/2 means 
            // the `y` coord is the vertical center. 
            // If we want the text *Bottom* to be at `end.y - gap`:
            // The bottom of text block is `y + height/2` (relative to center).
            // So we want the center to be at `end.y - gap - height/2`.
            y = endPoint.y - gap - (height / 2);
            break;
        case 'DOWN':
            x = endPoint.x;
            y = endPoint.y + gap + (height / 2);
            offsetX = width / 2; // Center horizontally
            break;
    }
    
    // We use a fixed offsetY to center the text vertically around the calculated point y
    // However, for UP/DOWN we shifted Y manually to account for height.
    // For LEFT/RIGHT, Y is exactly the line end, so centering is perfect.
    
    return { x, y, align: 'left', offsetX, offsetY: height / 2, direction };
};

const BackgroundImage = ({ imageState, isSelected, onSelect, onChange, locked }: any) => {
  const [img] = useImage(imageState.src || '', 'anonymous');
  const shapeRef = useRef<Konva.Image>(null);
  const trRef = useRef<Konva.Transformer>(null);

  useEffect(() => {
    if (isSelected && trRef.current && shapeRef.current) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected]);

  if (!imageState.src) return null;

  return (
    <>
      <KonvaImage
        image={img}
        ref={shapeRef}
        x={imageState.x}
        y={imageState.y}
        width={imageState.width}
        height={imageState.height}
        scaleX={imageState.scale}
        scaleY={imageState.scale}
        rotation={imageState.rotation}
        // If locked, we disable listening, allowing clicks to pass through
        listening={!locked} 
        draggable={isSelected && !locked}
        onClick={!locked ? onSelect : undefined}
        onTap={!locked ? onSelect : undefined}
        onDragEnd={(e) => {
          if (!locked) {
            onChange({ x: e.target.x(), y: e.target.y() });
          }
        }}
        onTransformEnd={(e) => {
          if (!locked) {
            const node = shapeRef.current;
            if (!node) return;
            const scaleX = node.scaleX();
            const scaleY = node.scaleY();
            node.scaleX(1);
            node.scaleY(1);
            onChange({
                x: node.x(),
                y: node.y(),
                width: Math.max(5, node.width() * scaleX),
                height: Math.max(5, node.height() * scaleY),
                rotation: node.rotation(),
                scale: 1
            });
          }
        }}
      />
      {isSelected && !locked && (
        <Transformer
          ref={trRef}
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 5 || newBox.height < 5) return oldBox;
            return newBox;
          }}
        />
      )}
    </>
  );
};

const CanvasArea: React.FC<CanvasAreaProps> = ({ stageRef }) => {
  const { state, dispatch } = usePatentStore();
  const [tempAnnotation, setTempAnnotation] = useState<Partial<Annotation> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const exportBoundsRef = useRef<Konva.Rect>(null);
  const exportTrRef = useRef<Konva.Transformer>(null);

  // Interaction State
  const isDrawing = useRef(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  // Separate state for input position to ensure it follows DOM reflows accurately
  const [inputPosition, setInputPosition] = useState({ top: 0, left: 0 });

  // Auto-fit Zoom on Mount (Fix Issue 1)
  useEffect(() => {
    if (containerRef.current && state.config.pixelWidth > 0) {
        // Delay slightly to ensure layout is done
        setTimeout(() => {
            if (!containerRef.current) return;
            const { clientWidth, clientHeight } = containerRef.current;
            const padding = 100;
            const availableWidth = clientWidth - padding;
            const availableHeight = clientHeight - padding;
            
            const scaleX = availableWidth / state.config.pixelWidth;
            const scaleY = availableHeight / state.config.pixelHeight;
            
            // Fit to screen, but don't zoom in excessively if the screen is huge relative to canvas
            const optimalScale = Math.min(scaleX, scaleY);
            
            dispatch({ type: 'SET_VIEW_SCALE', payload: optimalScale });
        }, 10);
    }
  }, []); // Run once on mount

  // Focus input when editing starts
  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  // Handle Export Bounds Transformer
  useEffect(() => {
      if (state.selectedId === 'EXPORT_BOUNDS' && exportTrRef.current && exportBoundsRef.current) {
          exportTrRef.current.nodes([exportBoundsRef.current]);
          exportTrRef.current.getLayer()?.batchDraw();
      }
  }, [state.selectedId, state.exportBounds]);

  // Handle Tab key for cycling styles AND Update Input Position on resize/scroll
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if editing text
      if (editingId) return;

      if (e.key === 'Tab' && isDrawing.current && tempAnnotation) {
        e.preventDefault();
        setTempAnnotation(prev => prev ? ({
          ...prev,
          startStyle: cycleStartStyle(prev.startStyle || StartStyle.NONE)
        }) : null);
      }
      // Undo/Redo Shortcuts
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
          e.preventDefault();
          dispatch({ type: 'UNDO' });
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
          e.preventDefault();
          dispatch({ type: 'REDO' });
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
          if(state.selectedId && !editingId) {
            if (state.selectedId === 'EXPORT_BOUNDS') {
                dispatch({ type: 'SET_EXPORT_BOUNDS', payload: null });
                dispatch({ type: 'SELECT_ITEM', payload: null });
            } else {
                dispatch({ type: 'DELETE_ANNOTATION', payload: state.selectedId });
                dispatch({ type: 'DELETE_ALIGNMENT_LINE', payload: state.selectedId });
            }
          }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [tempAnnotation, state.selectedId, editingId]);

  // Accurately calculate input position using DOM Rects to account for Flexbox centering + Scroll
  useLayoutEffect(() => {
      if (editingId && stageRef.current && containerRef.current) {
          const stage = stageRef.current;
          const container = containerRef.current;
          const editingAnnotation = state.annotations.find(a => a.id === editingId);
          
          if (editingAnnotation) {
             const fontSize = editingAnnotation.fontSize || state.globalSettings.fontSize;
             const layout = getLabelTransform(
                editingAnnotation.endPoint, 
                editingAnnotation.controlPoint2, 
                editingAnnotation.text, 
                fontSize, 
                TEXT_OFFSET_PX
             );
             
             // Calculate width to determine visual center
             const width = getTextWidth(editingAnnotation.text, fontSize);
             let visualCenterX = layout.x;
             let visualCenterY = layout.y;
             if (layout.direction === 'LEFT') visualCenterX -= width / 2;
             if (layout.direction === 'RIGHT') visualCenterX += width / 2;
             
             // Coordinates relative to the Stage (inside padding)
             const nodeX = visualCenterX;
             const nodeY = visualCenterY;

             // Stage's PADDING (defined in <Stage x={50} y={50} ...>)
             const STAGE_PADDING_X = 50;
             const STAGE_PADDING_Y = 50;

             // Get the bounding box of the Stage's content <div> (which includes scale) relative to viewport
             // stage.container() returns the div wrapping the canvas
             const stageRect = stage.container().getBoundingClientRect();
             const containerRect = container.getBoundingClientRect();

             // Calculate offset of stage content relative to container
             const offsetLeft = stageRect.left - containerRect.left + container.scrollLeft;
             const offsetTop = stageRect.top - containerRect.top + container.scrollTop;
             
             // Final position: Offset + (Internal Padding + Node Position) * Scale
             const finalX = offsetLeft + (STAGE_PADDING_X + nodeX) * state.viewScale;
             const finalY = offsetTop + (STAGE_PADDING_Y + nodeY) * state.viewScale;

             setInputPosition({ left: finalX, top: finalY });
          }
      }
  }, [editingId, state.viewScale, state.annotations, state.globalSettings.fontSize]);

  const handleStageMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    // If clicking outside while editing, commit and close
    if (editingId && e.target.nodeType === 'Stage') {
        setEditingId(null);
    }

    const stage = e.target.getStage();
    if (!stage) return;
    const pos = stage.getRelativePointerPosition();
    if (!pos) return;

    if (state.mode === ToolMode.DRAW_ANNOTATION) {
      isDrawing.current = true;
      const initialStyle = StartStyle.NONE;
      
      const nextText = getNextLabel(state.annotations, state.globalSettings.labelStep, state.globalSettings.labelStartValue);

      setTempAnnotation({
        id: uuidv4(),
        startPoint: pos,
        endPoint: pos,
        controlPoint1: pos,
        controlPoint2: pos,
        text: nextText,
        startStyle: initialStyle,
        groupId: uuidv4(),
        fontSize: state.globalSettings.fontSize,
        strokeWidth: state.globalSettings.strokeWidth,
      });
      // Deselect others
      dispatch({ type: 'SELECT_ITEM', payload: null });
    } else if (state.mode === ToolMode.SELECT) {
      const clickedOnEmpty = e.target === stage.findOne('#bg-rect');
      if (clickedOnEmpty) {
        dispatch({ type: 'SELECT_ITEM', payload: null });
      }
    }
  };

  const handleStageMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage();
    if (!stage || !isDrawing.current || !tempAnnotation) return;
    const pos = stage.getRelativePointerPosition();
    if (!pos) return;

    // Rule 11: Snap to alignment line
    const { point: snappedEnd, line } = findSnapLine(pos, state.alignmentLines, SNAP_THRESHOLD_PX);
    
    // Rule 8 & 9: Update bezier with template
    const { cp1, cp2 } = calculateSmartControlPoints(
      tempAnnotation.startPoint!, 
      snappedEnd, 
      line
    );

    setTempAnnotation({
      ...tempAnnotation,
      endPoint: snappedEnd,
      controlPoint1: cp1,
      controlPoint2: cp2,
    });
  };

  const handleStageMouseUp = () => {
    if (isDrawing.current && tempAnnotation && tempAnnotation.startPoint && tempAnnotation.endPoint) {
      // Commit annotation
      const finalAnnotation = tempAnnotation as Annotation;
      dispatch({ type: 'ADD_ANNOTATION', payload: finalAnnotation });
      // Select the new annotation
      dispatch({ type: 'SELECT_ITEM', payload: finalAnnotation.id });
      setTempAnnotation(null);
    }
    isDrawing.current = false;
  };

  // Determine Input Style
  let inputStyle: React.CSSProperties = { display: 'none' };
  const editingAnnotation = state.annotations.find(a => a.id === editingId);
  
  if (editingAnnotation) {
    const fontSize = editingAnnotation.fontSize || state.globalSettings.fontSize;
    const width = getTextWidth(editingAnnotation.text, fontSize);
    
    inputStyle = {
        display: 'block',
        position: 'absolute',
        left: `${inputPosition.left}px`,
        top: `${inputPosition.top}px`,
        transform: 'translate(-50%, -50%)',
        fontSize: `${fontSize * state.viewScale}px`,
        fontFamily: 'Arial',
        textAlign: 'center',
        padding: '0',
        zIndex: 50,
        width: `${Math.max(30, width * state.viewScale + 10)}px`,
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        border: '1px solid #3b82f6',
        borderRadius: '2px',
        outline: 'none',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
    };
  }

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    // Both Enter and Tab now cycle to the next text box
    if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault(); // Prevent newline in input or default tab focus change
        const currentIndex = state.annotations.findIndex(a => a.id === editingId);
        if (currentIndex !== -1) {
            // Cycle forward. If at end, loop to start.
            const nextIndex = (currentIndex + 1) % state.annotations.length;
            const nextId = state.annotations[nextIndex].id;
            setEditingId(nextId);
            dispatch({ type: 'SELECT_ITEM', payload: nextId });
        }
    } else if (e.key === 'Escape') {
        setEditingId(null);
    }
  };

  return (
    <div className="flex-1 bg-gray-200 overflow-auto flex justify-center items-center relative" ref={containerRef}>
      
      {/* Overlay Input for Text Editing */}
      {editingId && editingAnnotation && (
          <input
            ref={inputRef}
            style={inputStyle}
            value={editingAnnotation.text}
            onChange={(e) => dispatch({ type: 'UPDATE_ANNOTATION', payload: { id: editingAnnotation.id, text: e.target.value } })}
            onBlur={() => setEditingId(null)}
            onKeyDown={handleInputKeyDown}
          />
      )}

      <Stage
        width={state.config.pixelWidth * state.viewScale + 100} // Padding
        height={state.config.pixelHeight * state.viewScale + 100}
        scaleX={state.viewScale}
        scaleY={state.viewScale}
        onMouseDown={handleStageMouseDown}
        onMouseMove={handleStageMouseMove}
        onMouseUp={handleStageMouseUp}
        ref={stageRef}
        x={50} // visual padding
        y={50}
      >
        <Layer>
          {/* White Canvas Background */}
          <Rect
            id="bg-rect"
            x={0}
            y={0}
            width={state.config.pixelWidth}
            height={state.config.pixelHeight}
            fill="white"
            shadowColor="black"
            shadowBlur={10}
            shadowOpacity={0.1}
          />
          
          {/* Image Layer */}
          <BackgroundImage 
            imageState={state.image} 
            isSelected={state.selectedId === 'IMAGE' && state.mode === ToolMode.SELECT}
            onSelect={() => dispatch({ type: 'SELECT_ITEM', payload: 'IMAGE' })}
            onChange={(newAttrs: any) => dispatch({ type: 'UPDATE_IMAGE_TRANSFORM', payload: newAttrs })}
            locked={state.isImageLocked}
          />

          {/* Annotations Layer */}
          {state.annotations.map((ann) => {
            const isSelected = state.selectedId === ann.id;
            const isEditing = editingId === ann.id;
            const color = isSelected ? ANNOTATION_SELECTED_COLOR : ANNOTATION_COLOR;
            const fontSize = ann.fontSize || state.globalSettings.fontSize;
            const strokeWidth = ann.strokeWidth || state.globalSettings.strokeWidth;
            
            // Calculate Layout (Fix Issues 2 & 3)
            const layout = getLabelTransform(
                ann.endPoint, 
                ann.controlPoint2, 
                ann.text, 
                fontSize, 
                TEXT_OFFSET_PX
            );

            // Custom Arrow Head Points
            const arrowPoints = ann.startStyle === StartStyle.ARROW 
                ? calculateArrowPoints(ann.startPoint, ann.controlPoint1, 15, 10, 0.4) 
                : [];

            return (
              <Group 
                key={ann.id}
                draggable={state.mode === ToolMode.SELECT}
                onClick={() => dispatch({ type: 'SELECT_ITEM', payload: ann.id })}
                onDragEnd={(e) => {
                   // Calculate delta
                   const dx = e.target.x();
                   const dy = e.target.y();
                   // Reset group transform and update internal points
                   e.target.x(0); e.target.y(0);
                   
                   dispatch({ type: 'UPDATE_ANNOTATION', payload: {
                       id: ann.id,
                       startPoint: { x: ann.startPoint.x + dx, y: ann.startPoint.y + dy },
                       endPoint: { x: ann.endPoint.x + dx, y: ann.endPoint.y + dy },
                       controlPoint1: { x: ann.controlPoint1.x + dx, y: ann.controlPoint1.y + dy },
                       controlPoint2: { x: ann.controlPoint2.x + dx, y: ann.controlPoint2.y + dy },
                   }});
                }}
              >
                {/* Bezier Curve */}
                <Line
                  points={[
                    ann.startPoint.x, ann.startPoint.y,
                    ann.controlPoint1.x, ann.controlPoint1.y,
                    ann.controlPoint2.x, ann.controlPoint2.y,
                    ann.endPoint.x, ann.endPoint.y
                  ]}
                  stroke={color}
                  strokeWidth={strokeWidth}
                  bezier={true}
                  hitStrokeWidth={10}
                />
                
                {/* Custom Sharp Arrow Head */}
                {ann.startStyle === StartStyle.ARROW && (
                    <Line
                        points={arrowPoints}
                        fill={color}
                        closed={true}
                        stroke={null} // No stroke to avoid rounded corners if strokeWidth is high
                    />
                )}
                {/* Dot */}
                {ann.startStyle === StartStyle.DOT && (
                    <Circle
                        x={ann.startPoint.x}
                        y={ann.startPoint.y}
                        radius={strokeWidth * 2}
                        fill={color}
                    />
                )}

                {/* Text Label - Hidden if Editing */}
                {!isEditing && (
                    <Text
                        x={layout.x}
                        y={layout.y}
                        text={ann.text}
                        fontSize={fontSize}
                        fontFamily="Arial"
                        fill={color}
                        align={layout.align}
                        verticalAlign="middle"
                        offsetX={layout.offsetX}
                        offsetY={layout.offsetY}
                        onClick={(e) => {
                            e.cancelBubble = true;
                            setEditingId(ann.id);
                            dispatch({ type: 'SELECT_ITEM', payload: ann.id });
                        }}
                    />
                )}
              </Group>
            );
          })}

          {/* Temporary Annotation (Preview) */}
          {tempAnnotation && tempAnnotation.startPoint && tempAnnotation.endPoint && (
             <Group>
                <Line
                  points={[
                    tempAnnotation.startPoint.x, tempAnnotation.startPoint.y,
                    tempAnnotation.controlPoint1!.x, tempAnnotation.controlPoint1!.y,
                    tempAnnotation.controlPoint2!.x, tempAnnotation.controlPoint2!.y,
                    tempAnnotation.endPoint.x, tempAnnotation.endPoint.y
                  ]}
                  stroke={ANNOTATION_COLOR}
                  strokeWidth={tempAnnotation.strokeWidth || 2}
                  dash={[5, 5]} // Dashed for preview
                  bezier={true}
                />
                 {tempAnnotation.startStyle === StartStyle.ARROW && (
                    <Line
                        points={calculateArrowPoints(tempAnnotation.startPoint, tempAnnotation.controlPoint1!, 15, 10, 0.4)}
                        fill={ANNOTATION_COLOR}
                        closed={true}
                    />
                )}
                 {tempAnnotation.startStyle === StartStyle.DOT && (
                    <Circle
                        x={tempAnnotation.startPoint.x}
                        y={tempAnnotation.startPoint.y}
                        radius={(tempAnnotation.strokeWidth || 2) * 2}
                        fill={ANNOTATION_COLOR}
                    />
                )}
                {(() => {
                    const tempLayout = getLabelTransform(
                        tempAnnotation.endPoint, 
                        tempAnnotation.controlPoint2!, 
                        tempAnnotation.text || '', 
                        tempAnnotation.fontSize || 24, 
                        TEXT_OFFSET_PX
                    );
                    return (
                        <Text
                            x={tempLayout.x}
                            y={tempLayout.y}
                            text={tempAnnotation.text || ''}
                            fontSize={tempAnnotation.fontSize || 24}
                            fill={ANNOTATION_COLOR}
                            opacity={0.5}
                            offsetX={tempLayout.offsetX}
                            offsetY={tempLayout.offsetY}
                            verticalAlign="middle"
                        />
                    );
                })()}
             </Group>
          )}

          {/* Alignment Lines Layer - Tagged with 'no-export' to be hidden during export */}
          {state.alignmentLines.map((line) => {
              const isSelected = state.selectedId === line.id;
              // Group is positioned AT the line value, so dragging works intuitively
              return (
                  <Group
                    key={line.id}
                    name="no-export" 
                    x={line.type === 'vertical' ? line.value : 0}
                    y={line.type === 'horizontal' ? line.value : 0}
                    draggable={state.mode === ToolMode.SELECT}
                    dragBoundFunc={(pos) => {
                         // Fix: Use absolute stage position to prevent jumping or disappearing
                         const stage = stageRef.current;
                         if (!stage) return pos;
                         const stageAbs = stage.getAbsolutePosition();
                         
                         if (line.type === 'vertical') {
                             // Lock Y to stage Y (relative Y stays 0)
                             return { x: pos.x, y: stageAbs.y };
                         } else {
                             // Lock X to stage X (relative X stays 0)
                             return { x: stageAbs.x, y: pos.y };
                         }
                    }}
                    onDragEnd={(e) => {
                        const newVal = line.type === 'vertical' ? e.target.x() : e.target.y();
                        dispatch({ 
                            type: 'UPDATE_ALIGNMENT_LINE', 
                            payload: { id: line.id, value: newVal } 
                        });
                    }}
                    onClick={() => dispatch({ type: 'SELECT_ITEM', payload: line.id })}
                  >
                     <Line
                        points={
                            line.type === 'vertical' 
                            ? [0, 0, 0, state.config.pixelHeight] 
                            : [0, 0, state.config.pixelWidth, 0]
                        }
                        // Line is at 0 relative to group
                        x={0}
                        y={0}
                        stroke={ALIGNMENT_LINE_COLOR}
                        strokeWidth={isSelected ? ALIGNMENT_LINE_WIDTH * 2 : ALIGNMENT_LINE_WIDTH}
                        dash={[10, 5]}
                        hitStrokeWidth={20}
                     />
                  </Group>
              )
          })}

          {/* Export Bounds (Crop Box) - Tagged with 'no-export' */}
          {state.exportBounds && (
            <>
              <Rect
                  ref={exportBoundsRef}
                  name="no-export"
                  x={state.exportBounds.x}
                  y={state.exportBounds.y}
                  width={state.exportBounds.width}
                  height={state.exportBounds.height}
                  stroke={ALIGNMENT_LINE_COLOR}
                  strokeWidth={2}
                  dash={[10, 5]}
                  // Added transparent fill to allow dragging by clicking inside the box
                  fill="rgba(59, 130, 246, 0.1)"
                  draggable={state.mode === ToolMode.SELECT}
                  onClick={() => dispatch({ type: 'SELECT_ITEM', payload: 'EXPORT_BOUNDS' })}
                  onDragEnd={(e) => {
                      dispatch({
                          type: 'SET_EXPORT_BOUNDS',
                          payload: {
                              ...state.exportBounds!,
                              x: e.target.x(),
                              y: e.target.y(),
                          }
                      })
                  }}
                  onTransformEnd={(e) => {
                      const node = exportBoundsRef.current;
                      if (!node) return;
                      const scaleX = node.scaleX();
                      const scaleY = node.scaleY();
                      
                      // Reset scale and update dimensions directly
                      node.scaleX(1);
                      node.scaleY(1);
                      
                      dispatch({
                          type: 'SET_EXPORT_BOUNDS',
                          payload: {
                              x: node.x(),
                              y: node.y(),
                              width: Math.max(5, node.width() * scaleX),
                              height: Math.max(5, node.height() * scaleY),
                          }
                      });
                  }}
              />
              {state.selectedId === 'EXPORT_BOUNDS' && (
                  <Transformer
                      ref={exportTrRef}
                      rotateEnabled={false}
                      // Allow free resizing (not locked aspect ratio)
                      keepRatio={false}
                      boundBoxFunc={(oldBox, newBox) => {
                        if (newBox.width < 5 || newBox.height < 5) return oldBox;
                        return newBox;
                      }}
                  />
              )}
            </>
          )}

        </Layer>
      </Stage>
    </div>
  );
};

export default CanvasArea;