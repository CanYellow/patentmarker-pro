import React, { useRef } from 'react';
import { usePatentStore } from '../store';
import { ToolMode, ContentState } from '../types';
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
  Crop,
  Lock,
  Unlock,
  Undo,
  Redo,
  Save,
  FolderOpen,
  FileX
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import Konva from 'konva';

interface ToolbarProps {
  stageRef: React.RefObject<Konva.Stage>;
}

const Toolbar: React.FC<ToolbarProps> = ({ stageRef }) => {
  const { state, dispatch } = usePatentStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);

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
    const nodesToHide = stage.find('.no-export');
    const transformers = stage.find('Transformer');
    
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
    
    // 3. Normalize Stage Transformation for WYSIWYG Export
    // CRITICAL FIX: To avoid offsets caused by stage panning/padding (x=50, y=50),
    // we must temporarily reset the stage to origin (0,0) and scale (1,1).
    const oldScale = stage.scale();
    const oldPos = stage.position();

    stage.scale({ x: 1, y: 1 });
    stage.position({ x: 0, y: 0 });
    
    // 4. Generate Data URL
    // Since we reset the stage to 0,0, the cropX/cropY (which are relative to internal content)
    // now map perfectly to the viewport coordinates.
    const dataURL = stage.toDataURL({
      pixelRatio: 1, // Already 300 DPI native pixel dimensions
      x: cropX,
      y: cropY,
      width: cropWidth,
      height: cropHeight,
      mimeType: 'image/png'
    });
    
    // 5. Restore State
    stage.position(oldPos);
    stage.scale(oldScale);
    nodesToHide.forEach(node => node.show());
    transformers.forEach(node => node.show());

    // 6. Download
    const link = document.createElement('a');
    link.download = 'patent_figure.png';
    link.href = dataURL;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSaveProject = () => {
    const content: ContentState = {
      config: state.config,
      image: state.image,
      alignmentLines: state.alignmentLines,
      annotations: state.annotations,
      globalSettings: state.globalSettings,
      exportBounds: state.exportBounds
    };
    
    const jsonStr = JSON.stringify(content, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = 'patent_project.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleLoadProject = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const content = JSON.parse(reader.result as string) as ContentState;
          // Basic validation
          if (content.config && content.annotations) {
             dispatch({ type: 'LOAD_STATE', payload: content });
          } else {
             alert('Invalid project file format.');
          }
        } catch (err) {
          console.error(err);
          alert('Failed to load project file.');
        }
      };
      reader.readAsText(file);
    }
    // Reset input
    if (e.target) e.target.value = '';
  };

  const handleClearAll = () => {
    if (window.confirm("Are you sure you want to clear all content? This cannot be undone (easily).")) {
      dispatch({ type: 'RESET_CANVAS' });
    }
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
    <div className="h-full w-16 bg-gray-900 flex flex-col items-center py-4 gap-4 shadow-xl z-50 overflow-y-auto no-scrollbar">
      <div className="text-white font-bold text-xs mb-2">PatentPro</div>
      
      {/* File Operations */}
      <button
        onClick={() => projectInputRef.current?.click()}
        className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition"
        title="Open Project"
      >
        <FolderOpen size={24} />
      </button>
      <input
        type="file"
        ref={projectInputRef}
        onChange={handleLoadProject}
        accept=".json"
        className="hidden"
      />

      <button
        onClick={handleSaveProject}
        className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition"
        title="Save Project"
      >
        <Save size={24} />
      </button>
      
      <button
        onClick={handleClearAll}
        className="p-2 rounded-lg text-red-400 hover:text-white hover:bg-red-900/30 transition"
        title="Clear All Content"
      >
        <FileX size={24} />
      </button>

      <div className="h-px w-10 bg-gray-700 my-1" />

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

      {/* Undo / Redo */}
      <button
        onClick={() => dispatch({ type: 'UNDO' })}
        disabled={state.past.length === 0}
        className={`p-2 rounded-lg transition ${state.past.length === 0 ? 'text-gray-600 cursor-not-allowed' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
        title="Undo (Ctrl+Z)"
      >
        <Undo size={24} />
      </button>

      <button
        onClick={() => dispatch({ type: 'REDO' })}
        disabled={state.future.length === 0}
        className={`p-2 rounded-lg transition ${state.future.length === 0 ? 'text-gray-600 cursor-not-allowed' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
        title="Redo (Ctrl+Y)"
      >
        <Redo size={24} />
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

      {/* Lock/Unlock Button */}
      {state.image.src && (
          <button
            onClick={() => dispatch({ type: 'TOGGLE_IMAGE_LOCK' })}
            className={`p-2 rounded-lg transition ${state.isImageLocked ? 'text-red-400' : 'text-green-400'} hover:bg-gray-800`}
            title={state.isImageLocked ? "Unlock Image" : "Lock Image"}
          >
            {state.isImageLocked ? <Lock size={24} /> : <Unlock size={24} />}
          </button>
      )}

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