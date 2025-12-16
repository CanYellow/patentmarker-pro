import React, { useRef, useState, useEffect } from 'react';
import { Stage, Layer, Image as KonvaImage, Rect, Group, Line, Circle, Text, Arrow, Transformer } from 'react-konva';
import useImage from 'use-image';
import Konva from 'konva';
// Explicitly import shapes to ensure they are registered with Konva
// This fixes errors where shapes are missing from the Konva instance when using esm.sh
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
    calculateTextPosition,
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

  // If no numbers exist, use the configured start value.
  // If numbers exist, use max + step.
  if (!hasNumber) {
      return startValue.toString();
  }
  return (max + step).toString();
};

const BackgroundImage = ({ imageState, isSelected, onSelect, onChange }: any) => {
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
        draggable={isSelected}
        onClick={onSelect}
        onTap={onSelect}
        onDragEnd={(e) => {
          onChange({ x: e.target.x(), y: e.target.y() });
        }}
        onTransformEnd={(e) => {
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
        }}
      />
      {isSelected && (
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

  // Interaction State
  const isDrawing = useRef(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Focus input when editing starts
  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  // Handle Tab key for cycling styles (Rule 10)
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
      if (e.key === 'Delete' || e.key === 'Backspace') {
          if(state.selectedId && !editingId) {
            dispatch({ type: 'DELETE_ANNOTATION', payload: state.selectedId });
            dispatch({ type: 'DELETE_ALIGNMENT_LINE', payload: state.selectedId });
          }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [tempAnnotation, state.selectedId, editingId]);


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

  // Determine Input Style and Position
  let inputStyle: React.CSSProperties = { display: 'none' };
  const editingAnnotation = state.annotations.find(a => a.id === editingId);
  
  if (editingAnnotation) {
    const fontSize = editingAnnotation.fontSize || state.globalSettings.fontSize;
    const textPos = calculateTextPosition(editingAnnotation.endPoint, editingAnnotation.controlPoint2, TEXT_OFFSET_PX);
    // Convert to screen coordinates relative to container
    // Stage x=50, y=50. Scale = viewScale.
    const screenX = 50 + textPos.x * state.viewScale;
    const screenY = 50 + textPos.y * state.viewScale;
    
    inputStyle = {
        display: 'block',
        position: 'absolute',
        left: `${screenX}px`,
        top: `${screenY}px`,
        transform: 'translate(-50%, -50%)',
        fontSize: `${fontSize * state.viewScale}px`,
        fontFamily: 'Arial',
        textAlign: 'center',
        padding: '2px',
        zIndex: 50,
        width: `${Math.max(50, editingAnnotation.text.length * fontSize)}px`,
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        border: '1px solid #3b82f6',
        borderRadius: '4px',
        outline: 'none',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
    };
  }

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
        setEditingId(null);
    } else if (e.key === 'Tab') {
        e.preventDefault();
        // Cycle to next annotation
        const currentIndex = state.annotations.findIndex(a => a.id === editingId);
        if (currentIndex !== -1) {
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
          />

          {/* Annotations Layer */}
          {state.annotations.map((ann) => {
            const isSelected = state.selectedId === ann.id;
            const isEditing = editingId === ann.id;
            const color = isSelected ? ANNOTATION_SELECTED_COLOR : ANNOTATION_COLOR;
            const textPos = calculateTextPosition(ann.endPoint, ann.controlPoint2, TEXT_OFFSET_PX);
            const fontSize = ann.fontSize || state.globalSettings.fontSize;
            const strokeWidth = ann.strokeWidth || state.globalSettings.strokeWidth;
            
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
                
                {/* Start Marker */}
                {ann.startStyle === StartStyle.ARROW && (
                    <Arrow
                        points={[ann.controlPoint1.x, ann.controlPoint1.y, ann.startPoint.x, ann.startPoint.y]}
                        pointerLength={10}
                        pointerWidth={10}
                        fill={color}
                        stroke={color}
                        strokeWidth={strokeWidth}
                    />
                )}
                {ann.startStyle === StartStyle.DOT && (
                    <Circle
                        x={ann.startPoint.x}
                        y={ann.startPoint.y}
                        radius={strokeWidth * 1.5}
                        fill={color}
                    />
                )}

                {/* Text Label - Hidden if Editing */}
                {!isEditing && (
                    <Text
                        x={textPos.x}
                        y={textPos.y}
                        text={ann.text}
                        fontSize={fontSize}
                        fontFamily="Arial"
                        fill={color}
                        align="center"
                        verticalAlign="middle"
                        offsetX={ann.text.length * (fontSize / 4)} // Approximate centering
                        offsetY={fontSize / 2}
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
                    <Arrow
                        points={[tempAnnotation.controlPoint1!.x, tempAnnotation.controlPoint1!.y, tempAnnotation.startPoint.x, tempAnnotation.startPoint.y]}
                        pointerLength={10}
                        pointerWidth={10}
                        fill={ANNOTATION_COLOR}
                        stroke={ANNOTATION_COLOR}
                        strokeWidth={tempAnnotation.strokeWidth || 2}
                    />
                )}
                 {tempAnnotation.startStyle === StartStyle.DOT && (
                    <Circle
                        x={tempAnnotation.startPoint.x}
                        y={tempAnnotation.startPoint.y}
                        radius={(tempAnnotation.strokeWidth || 2) * 1.5}
                        fill={ANNOTATION_COLOR}
                    />
                )}
                 <Text
                    x={calculateTextPosition(tempAnnotation.endPoint, tempAnnotation.controlPoint2!, TEXT_OFFSET_PX).x}
                    y={calculateTextPosition(tempAnnotation.endPoint, tempAnnotation.controlPoint2!, TEXT_OFFSET_PX).y}
                    text={tempAnnotation.text || ''}
                    fontSize={tempAnnotation.fontSize || 24}
                    fill={ANNOTATION_COLOR}
                    opacity={0.5}
                />
             </Group>
          )}

          {/* Alignment Lines Layer */}
          {state.alignmentLines.map((line) => {
              const isSelected = state.selectedId === line.id;
              // Group is positioned AT the line value, so dragging works intuitively
              return (
                  <Group
                    key={line.id}
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
        </Layer>
      </Stage>
    </div>
  );
};

export default CanvasArea;