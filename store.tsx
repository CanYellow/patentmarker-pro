import React, { createContext, useContext, useReducer, ReactNode } from 'react';
import { AppState, Action, ToolMode, CanvasConfig } from './types';
import { DEFAULT_DPI, DEFAULT_HEIGHT_MM, DEFAULT_WIDTH_MM, MM_TO_INCH } from './constants';

const calculatePixels = (mm: number, dpi: number) => Math.round((mm * MM_TO_INCH) * dpi);

const initialConfig: CanvasConfig = {
  widthMM: DEFAULT_WIDTH_MM,
  heightMM: DEFAULT_HEIGHT_MM,
  dpi: DEFAULT_DPI,
  pixelWidth: calculatePixels(DEFAULT_WIDTH_MM, DEFAULT_DPI),
  pixelHeight: calculatePixels(DEFAULT_HEIGHT_MM, DEFAULT_DPI),
};

const initialState: AppState = {
  config: initialConfig,
  image: {
    src: null,
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    width: 0,
    height: 0,
  },
  alignmentLines: [],
  annotations: [],
  mode: ToolMode.SELECT,
  selectedId: null,
  viewScale: 0.2, // Start zoomed out to see the whole high-res canvas
  activeAnnotationId: null,
  globalSettings: {
    fontSize: 50,
    strokeWidth: 1,
    labelStep: 1,
    labelStartValue: 1,
  },
  exportBounds: null,
};

const reducer = (state: AppState, action: Action): AppState => {
  switch (action.type) {
    case 'SET_MODE':
      return { ...state, mode: action.payload, selectedId: null };
    case 'SET_IMAGE': {
      const { width, height } = action.payload;
      // Fit image to canvas (Rule 4)
      const scaleX = state.config.pixelWidth / width;
      const scaleY = state.config.pixelHeight / height;
      const scale = Math.min(scaleX, scaleY) * 0.9; // 90% fit
      
      const x = (state.config.pixelWidth - width * scale) / 2;
      const y = (state.config.pixelHeight - height * scale) / 2;

      return {
        ...state,
        image: {
          ...state.image,
          src: action.payload.src,
          width,
          height,
          x,
          y,
          scale,
        },
      };
    }
    case 'UPDATE_IMAGE_TRANSFORM':
      return { ...state, image: { ...state.image, ...action.payload } };
    case 'ADD_ALIGNMENT_LINE':
      return { ...state, alignmentLines: [...state.alignmentLines, action.payload] };
    case 'UPDATE_ALIGNMENT_LINE':
      return {
        ...state,
        alignmentLines: state.alignmentLines.map(line => 
            line.id === action.payload.id ? { ...line, value: action.payload.value } : line
        )
      };
    case 'DELETE_ALIGNMENT_LINE':
      return {
        ...state,
        alignmentLines: state.alignmentLines.filter((l) => l.id !== action.payload),
      };
    case 'ADD_ANNOTATION':
      return { ...state, annotations: [...state.annotations, action.payload] };
    case 'UPDATE_ANNOTATION':
      return {
        ...state,
        annotations: state.annotations.map((a) =>
          a.id === action.payload.id ? { ...a, ...action.payload } : a
        ),
      };
    case 'DELETE_ANNOTATION':
      return {
        ...state,
        annotations: state.annotations.filter((a) => a.id !== action.payload),
        selectedId: state.selectedId === action.payload ? null : state.selectedId,
      };
    case 'SELECT_ITEM':
      return { ...state, selectedId: action.payload };
    case 'SET_VIEW_SCALE':
      return { ...state, viewScale: action.payload };
    case 'SET_CANVAS_SIZE': {
      const { widthMM, heightMM } = action.payload;
      return {
        ...state,
        config: {
          ...state.config,
          widthMM,
          heightMM,
          pixelWidth: calculatePixels(widthMM, state.config.dpi),
          pixelHeight: calculatePixels(heightMM, state.config.dpi),
        },
      };
    }
    case 'UPDATE_GLOBAL_SETTINGS': {
      // Rule: "Any adjustment acts on all marked lead lines"
      // We update the global settings
      const newSettings = { ...state.globalSettings, ...action.payload };
      
      // And we strictly update all existing annotations to match the new visual styles
      // if those specific visual styles were part of the payload.
      const updatedAnnotations = state.annotations.map(ann => {
          const newAnn = { ...ann };
          if (action.payload.fontSize !== undefined) {
              newAnn.fontSize = action.payload.fontSize;
          }
          if (action.payload.strokeWidth !== undefined) {
              newAnn.strokeWidth = action.payload.strokeWidth;
          }
          return newAnn;
      });

      return { 
          ...state, 
          globalSettings: newSettings,
          annotations: updatedAnnotations
      };
    }
    case 'SET_EXPORT_BOUNDS':
      return { ...state, exportBounds: action.payload };
    default:
      return state;
  }
};

const PatentContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<Action>;
} | null>(null);

export const PatentProvider = ({ children }: { children?: ReactNode }) => {
  const [state, dispatch] = useReducer(reducer, initialState);
  return (
    <PatentContext.Provider value={{ state, dispatch }}>
      {children}
    </PatentContext.Provider>
  );
};

export const usePatentStore = () => {
  const context = useContext(PatentContext);
  if (!context) throw new Error('usePatentStore must be used within PatentProvider');
  return context;
};