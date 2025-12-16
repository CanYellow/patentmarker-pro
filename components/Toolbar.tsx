import React, { useRef, useState } from 'react';
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

// --- CRC32 Table & Checksum Logic for PNG Manipulation ---
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    if (c & 1) c = 0xedb88320 ^ (c >>> 1);
    else c = c >>> 1;
  }
  crcTable[n] = c;
}

const crc32 = (buf: Uint8Array): number => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return c ^ 0xffffffff;
};

// Helper to write a 32-bit unsigned integer to a Uint8Array at offset
const writeUint32 = (buf: Uint8Array, offset: number, value: number) => {
  buf[offset] = (value >>> 24) & 0xff;
  buf[offset + 1] = (value >>> 16) & 0xff;
  buf[offset + 2] = (value >>> 8) & 0xff;
  buf[offset + 3] = value & 0xff;
};

// --- Strict DPI Injection ---
// Canvas toDataURL produces PNGs without physical size metadata (defaults to 72 or 96 DPI in viewers).
// We must inject the 'pHYs' chunk so Word/viewers respect the millimeter size.
const base64ToBlobWithDPI = (base64: string, dpi: number): Blob => {
  // 1. Decode Base64
  const byteString = atob(base64.split(',')[1]);
  const buffer = new Uint8Array(byteString.length);
  for (let i = 0; i < byteString.length; i++) {
    buffer[i] = byteString.charCodeAt(i);
  }

  // 2. Calculate Pixels Per Meter (PNG uses PPM, not DPI)
  // 1 inch = 0.0254 meters
  const pixelsPerMeter = Math.round(dpi / 0.0254);

  // 3. Create pHYs chunk
  // Length (4) + Type (4) + Data (9) + CRC (4) = 21 bytes
  const physLength = 9;
  const chunkLen = 4 + 4 + physLength + 4; 
  const physChunk = new Uint8Array(chunkLen);

  // Length: 9 bytes of data
  writeUint32(physChunk, 0, physLength);
  
  // Type: 'pHYs' (0x70 0x48 0x59 0x73)
  physChunk[4] = 0x70;
  physChunk[5] = 0x48;
  physChunk[6] = 0x59;
  physChunk[7] = 0x73;

  // Data: 
  //   PixelsPerUnitX (4 bytes)
  //   PixelsPerUnitY (4 bytes)
  //   UnitSpecifier (1 byte) - 1 means Meter
  writeUint32(physChunk, 8, pixelsPerMeter);
  writeUint32(physChunk, 12, pixelsPerMeter);
  physChunk[16] = 1;

  // CRC: Calculated on Type + Data
  const crcInput = physChunk.subarray(4, 4 + 4 + physLength); // Type + Data
  const crcValue = crc32(crcInput);
  writeUint32(physChunk, 17, crcValue);

  // 4. Insert into PNG
  // Standard PNG: Signature (8) + IHDR Chunk (25: 4 len, 4 type, 13 data, 4 crc)
  // We insert pHYs right after IHDR, so at index 33.
  const headerSize = 33; 
  const newBuffer = new Uint8Array(buffer.length + chunkLen);

  // Copy Signature + IHDR
  newBuffer.set(buffer.subarray(0, headerSize), 0);
  // Insert pHYs
  newBuffer.set(physChunk, headerSize);
  // Copy rest (IDAT, IEND, etc.)
  newBuffer.set(buffer.subarray(headerSize), headerSize + chunkLen);

  return new Blob([newBuffer], { type: 'image/png' });
};

const Toolbar: React.FC<ToolbarProps> = ({ stageRef }) => {
  const { state, dispatch } = usePatentStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);
  const [exportDpi, setExportDpi] = useState<number>(300); 

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
    
    // 1. Hide UI elements
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
    
    // 3. Reset Stage for accurate 1:1 pixel rendering
    const oldScale = stage.scale();
    const oldPos = stage.position();

    stage.scale({ x: 1, y: 1 });
    stage.position({ x: 0, y: 0 });
    stage.batchDraw(); 
    
    // 4. Generate High-Res Pixels
    // We render based on the ratio between desired output DPI and the canvas working DPI (300).
    const pixelRatio = exportDpi / state.config.dpi;

    const base64Data = stage.toDataURL({
      pixelRatio: pixelRatio, 
      x: cropX,
      y: cropY,
      width: cropWidth,
      height: cropHeight,
      mimeType: 'image/png'
    });
    
    // 5. Restore Stage
    stage.position(oldPos);
    stage.scale(oldScale);
    nodesToHide.forEach(node => node.show());
    transformers.forEach(node => node.show());
    stage.batchDraw();

    // 6. Inject Metadata & Download
    // This is the CRITICAL STEP: We inject the 'pHYs' chunk so Word knows strictly to display it at the physical size.
    const blob = base64ToBlobWithDPI(base64Data, exportDpi);
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.download = `patent_figure_${exportDpi}dpi.png`;
    link.href = url;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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
    if (e.target) e.target.value = '';
  };

  const handleClearAll = () => {
    if (window.confirm("Are you sure you want to clear all content?")) {
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
          dispatch({ type: 'SELECT_ITEM', payload: 'EXPORT_BOUNDS' });
          dispatch({ type: 'SET_MODE', payload: ToolMode.SELECT });
      } else {
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

      {/* Tools */}
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

      {/* Undo/Redo */}
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

      {state.image.src && (
          <button
            onClick={() => dispatch({ type: 'TOGGLE_IMAGE_LOCK' })}
            className={`p-2 rounded-lg transition ${state.isImageLocked ? 'text-red-400' : 'text-green-400'} hover:bg-gray-800`}
            title={state.isImageLocked ? "Unlock Image" : "Lock Image"}
          >
            {state.isImageLocked ? <Lock size={24} /> : <Unlock size={24} />}
          </button>
      )}

      {/* Export Section */}
      <div className="flex flex-col gap-1 items-center bg-gray-800 p-2 rounded w-14">
        <select 
            value={exportDpi}
            onChange={(e) => setExportDpi(Number(e.target.value))}
            className="w-full text-[10px] bg-gray-900 text-white border border-gray-700 rounded p-1 mb-1 outline-none"
            title="Select Export Resolution"
        >
            <option value="300">300</option>
            <option value="150">150</option>
            <option value="72">72</option>
        </select>
        <button
            onClick={handleExport}
            className="text-gray-400 hover:text-white hover:bg-gray-700 rounded p-1"
            title="Export Image"
        >
            <Download size={24} />
        </button>
      </div>

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