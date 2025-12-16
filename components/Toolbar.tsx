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
  Trash2,
  Crop
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
    const stage = stageRef.current;
    
    // 1. Identify nodes to hide (Alignment Lines, Export Box, Transformers)
    // We used name='no-export' in CanvasArea for items that shouldn't be exported
    const nodesToHide = stage.find('.no-export');
    const transformers = stage.find('Transformer');
    
    // Hide them
    nodesToHide.forEach(node => node.hide());
    transformers.forEach(node => node.hide());
    
    // 2. Determine Export Crop Area
    let cropX = 0;
    let cropY = 0;
    let cropWidth = state.config.pixelWidth;
    let cropHeight = state.config.pixelHeight;

    if (state.exportBounds) {
        cropX = state.exportBounds.x;
        cropY = state.exportBounds.y;
        cropWidth = state.exportBounds.width;
        cropHeight = state.exportBounds.height;
    }
    
    // 3. Reset scale to 1 for high res export based on original pixel dimensions
    const oldScale = stage.scale();
    stage.scale({ x: 1, y: 1 });
    
    // 4. Generate Data URL
    const dataURL = stage.toDataURL({
      pixelRatio: 1, // Already 300 DPI native pixel dimensions
      x: cropX,
      y: cropY,
      width: cropWidth,
      height: cropHeight,
      mimeType: 'image/png'
    });
    
    // 5. Restore State
    stage.scale(oldScale);
    nodesToHide.forEach(node => node.show());
    // Transformers will reappear automatically on next render/click, or we can show them
    // But since we didn't change selection state, showing them is fine.
    transformers.forEach(node => node.show());

    // 6. Download
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

  const toggleExportArea = () => {
      if (state.exportBounds) {
          // If it exists, select it
          dispatch({ type: 'SELECT_ITEM', payload: 'EXPORT_BOUNDS' });
          dispatch({ type: 'SET_MODE', payload: ToolMode.SELECT });
      } else {
          // Create default export bounds (e.g., 80% of canvas)
          const w = state.config.pixelWidth * 0.8;
          const h = state.config.pixelHeight * 0.8;
          const x = (state.config.pixelWidth - w) / 2;
          const y = (state.config.pixelHeight - h) / 2;
          
          dispatch({
              type: 'SET_EXPORT_BOUNDS',
              payload: { x, y, width: w, height: h }
          });
          dispatch({ type: 'SELECT_ITEM', payload: 'EXPORT_BOUNDS' });
          dispatch({ type: 'SET_MODE', payload: ToolMode.SELECT });
      }
  };

  const deleteSelected = () => {
    if (state.selectedId) {
      if (state.selectedId === 'EXPORT_BOUNDS') {
          dispatch({ type: 'SET_EXPORT_BOUNDS', payload: null });
          dispatch({ type: 'SELECT_ITEM', payload: null });
      } else {
          dispatch({ type: 'DELETE_ANNOTATION', payload: state.selectedId });
          dispatch({ type: 'DELETE_ALIGNMENT_LINE', payload: state.selectedId });
      }
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

      {/* Swapped Icons as requested */}
      <button
        onClick={addVerticalLine}
        className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition"
        title="Add Vertical Alignment Line"
      >
        <AlignHorizontalJustifyStart size={24} className="rotate-90" />
      </button>

      <button
        onClick={addHorizontalLine}
        className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition"
        title="Add Horizontal Alignment Line"
      >
        <AlignVerticalJustifyStart size={24} className="rotate-90" />
      </button>

      <button
        onClick={toggleExportArea}
        className={`p-2 rounded-lg transition ${state.exportBounds ? 'text-blue-400' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
        title="Set Export Area / Crop"
      >
        <Crop size={24} />
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