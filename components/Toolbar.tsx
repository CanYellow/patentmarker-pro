import React, { useRef } from 'react';
import { usePatentStore } from '../store';
import { ToolMode } from '../types';
import { 
  MousePointer2, 
  PenTool, 
  AlignVerticalJustifyStart, 
  AlignHorizontalJustifyStart,
  Upload,
  Download,
  ZoomIn,
  ZoomOut,
  Trash2
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import Konva from 'konva';

interface ToolbarProps {
  stageRef: React.RefObject<Konva.Stage>;
}

const Toolbar: React.FC<ToolbarProps> = ({ stageRef }) => {
  const { state, dispatch } = usePatentStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.src = reader.result as string;
        img.onload = () => {
          dispatch({
            type: 'SET_IMAGE',
            payload: { src: img.src, width: img.width, height: img.height },
          });
        };
      };
      reader.readAsDataURL(file);
    }
  };

  const handleExport = () => {
    if (!stageRef.current) return;
    
    // Rule 13: Export annotated image (excluding alignment lines, which are on a separate layer/logic or we hide them)
    // We need to temporarily hide alignment lines visual if they were drawn on the same canvas (logic handled in CanvasArea)
    // Or simpler: We just export. The implementation in CanvasArea will handle visibility.
    // Calculate cropping area.
    
    const scale = state.viewScale;
    
    // Reset scale to 1 for high res export
    const oldScale = stageRef.current.scale();
    stageRef.current.scale({ x: 1, y: 1 });
    
    // Find bounding box of image + annotations
    // Default to canvas size if simple
    const dataURL = stageRef.current.toDataURL({
      pixelRatio: 1, // Already 300 DPI native
      x: 0,
      y: 0,
      width: state.config.pixelWidth,
      height: state.config.pixelHeight,
    });
    
    // Restore preview scale
    stageRef.current.scale(oldScale);

    const link = document.createElement('a');
    link.download = 'patent_figure.png';
    link.href = dataURL;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const addVerticalLine = () => {
    dispatch({
      type: 'ADD_ALIGNMENT_LINE',
      payload: { id: uuidv4(), type: 'vertical', value: state.config.pixelWidth / 2 },
    });
    dispatch({ type: 'SET_MODE', payload: ToolMode.SELECT });
  };

  const addHorizontalLine = () => {
    dispatch({
      type: 'ADD_ALIGNMENT_LINE',
      payload: { id: uuidv4(), type: 'horizontal', value: state.config.pixelHeight / 2 },
    });
    dispatch({ type: 'SET_MODE', payload: ToolMode.SELECT });
  };

  const deleteSelected = () => {
    if (state.selectedId) {
      dispatch({ type: 'DELETE_ANNOTATION', payload: state.selectedId });
      dispatch({ type: 'DELETE_ALIGNMENT_LINE', payload: state.selectedId });
    }
  };

  return (
    <div className="h-full w-16 bg-gray-900 flex flex-col items-center py-4 gap-4 shadow-xl z-50">
      <div className="text-white font-bold text-xs mb-2">PatentPro</div>
      
      <button
        onClick={() => dispatch({ type: 'SET_MODE', payload: ToolMode.SELECT })}
        className={`p-2 rounded-lg transition ${state.mode === ToolMode.SELECT ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
        title="Select (V)"
      >
        <MousePointer2 size={24} />
      </button>

      <button
        onClick={() => dispatch({ type: 'SET_MODE', payload: ToolMode.DRAW_ANNOTATION })}
        className={`p-2 rounded-lg transition ${state.mode === ToolMode.DRAW_ANNOTATION ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
        title="Annotate (P)"
      >
        <PenTool size={24} />
      </button>

      <div className="h-px w-10 bg-gray-700 my-1" />

      <button
        onClick={addVerticalLine}
        className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition"
        title="Add Vertical Alignment Line"
      >
        <AlignVerticalJustifyStart size={24} />
      </button>

      <button
        onClick={addHorizontalLine}
        className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition"
        title="Add Horizontal Alignment Line"
      >
        <AlignHorizontalJustifyStart size={24} />
      </button>

      <div className="h-px w-10 bg-gray-700 my-1" />

      <button
        onClick={() => fileInputRef.current?.click()}
        className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition"
        title="Import Image"
      >
        <Upload size={24} />
      </button>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleImageUpload}
        accept="image/*"
        className="hidden"
      />

      <button
        onClick={handleExport}
        className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition"
        title="Export"
      >
        <Download size={24} />
      </button>

      <div className="flex-grow" />

      <button
        onClick={deleteSelected}
        disabled={!state.selectedId}
        className={`p-2 rounded-lg transition ${!state.selectedId ? 'text-gray-700 cursor-not-allowed' : 'text-red-400 hover:bg-red-900/30'}`}
        title="Delete Selected"
      >
        <Trash2 size={24} />
      </button>

      <div className="flex flex-col gap-2 mb-4">
        <button
            onClick={() => dispatch({ type: 'SET_VIEW_SCALE', payload: state.viewScale * 1.1 })}
            className="text-gray-400 hover:text-white"
        >
            <ZoomIn size={20} />
        </button>
        <span className="text-xs text-gray-500">{Math.round(state.viewScale * 100)}%</span>
        <button
            onClick={() => dispatch({ type: 'SET_VIEW_SCALE', payload: state.viewScale * 0.9 })}
            className="text-gray-400 hover:text-white"
        >
            <ZoomOut size={20} />
        </button>
      </div>
    </div>
  );
};

export default Toolbar;
