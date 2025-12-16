import React, { createContext, useContext, useReducer, ReactNode } from 'react';
import { AppState, Action, ToolMode, CanvasConfig, ContentState } from './types';
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
  isImageLocked: false,
  alignmentLines: [],
  annotations: [],
  mode: ToolMode.SELECT,
  selectedId: null,
  viewScale: 0.2, // Start zoomed out
  activeAnnotationId: null,
  globalSettings: {
    fontSize: 50,
    strokeWidth: 1,
    labelStep: 1,
    labelStartValue: 1,
  },
  exportBounds: null,
  past: [],
  future: [],
};

// Helper to extract content state for history
const getContentState = (state: AppState): ContentState => ({
  config: state.config,
  image: state.image,
  alignmentLines: state.alignmentLines,
  annotations: state.annotations,
  globalSettings: state.globalSettings,
  exportBounds: state.exportBounds,
});

const MAX_HISTORY = 50;

const reducer = (state: AppState, action: Action): AppState => {
  // Actions that change content and should trigger a history save
  const isHistoryAction = [
    'SET_IMAGE',
    'UPDATE_IMAGE_TRANSFORM',
    'ADD_ALIGNMENT_LINE',
    'UPDATE_ALIGNMENT_LINE',
    'DELETE_ALIGNMENT_LINE',
    'ADD_ANNOTATION',
    'UPDATE_ANNOTATION',
    'DELETE_ANNOTATION',
    'SET_CANVAS_SIZE',
    'UPDATE_GLOBAL_SETTINGS',
    'SET_EXPORT_BOUNDS'
  ].includes(action.type);

  // If it's a history action, save current state to past
  let stateWithHistory = state;
  if (isHistoryAction) {
    const currentContent = getContentState(state);
    const newPast = [...state.past, currentContent].slice(-MAX_HISTORY);
    stateWithHistory = {
      ...state,
      past: newPast,
      future: [], // Clear future on new action
    };
  }

  // Handle Undo/Redo separately
  if (action.type === 'UNDO') {
    if (state.past.length === 0) return state;
    const previous = state.past[state.past.length - 1];
    const newPast = state.past.slice(0, -1);
    const currentContent = getContentState(state);
    return {
      ...state,
      ...previous, // Restore content
      past: newPast,
      future: [currentContent, ...state.future],
    };
  }

  if (action.type === 'REDO') {
    if (state.future.length === 0) return state;
    const next = state.future[0];
    const newFuture = state.future.slice(1);
    const currentContent = getContentState(state);
    return {
      ...state,
      ...next, // Restore content
      past: [...state.past, currentContent],
      future: newFuture,
    };
  }

  // Apply specific reducers
  switch (action.type) {
    case 'SET_MODE':
      return { ...state, mode: action.payload, selectedId: null };
    case 'SET_IMAGE': {
      const { width, height } = action.payload;
      // Fit image to canvas (Rule 4)
      const scaleX = stateWithHistory.config.pixelWidth / width;
      const scaleY = stateWithHistory.config.pixelHeight / height;
      const scale = Math.min(scaleX, scaleY) * 0.9; // 90% fit
      
      const x = (stateWithHistory.config.pixelWidth - width * scale) / 2;
      const y = (stateWithHistory.config.pixelHeight - height * scale) / 2;

      return {
        ...stateWithHistory,
        image: {
          ...stateWithHistory.image,
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
      return { ...stateWithHistory, image: { ...stateWithHistory.image, ...action.payload } };
    case 'TOGGLE_IMAGE_LOCK':
      return { 
          ...state, // UI State, no history update
          isImageLocked: !state.isImageLocked,
          selectedId: !state.isImageLocked && state.selectedId === 'IMAGE' ? null : state.selectedId
      };
    case 'ADD_ALIGNMENT_LINE':
      return { ...stateWithHistory, alignmentLines: [...stateWithHistory.alignmentLines, action.payload] };
    case 'UPDATE_ALIGNMENT_LINE':
      return {
        ...stateWithHistory,
        alignmentLines: stateWithHistory.alignmentLines.map(line => 
            line.id === action.payload.id ? { ...line, value: action.payload.value } : line
        )
      };
    case 'DELETE_ALIGNMENT_LINE':
      return {
        ...stateWithHistory,
        alignmentLines: stateWithHistory.alignmentLines.filter((l) => l.id !== action.payload),
      };
    case 'ADD_ANNOTATION':
      return { ...stateWithHistory, annotations: [...stateWithHistory.annotations, action.payload] };
    case 'UPDATE_ANNOTATION':
      return {
        ...stateWithHistory,
        annotations: stateWithHistory.annotations.map((a) =>
          a.id === action.payload.id ? { ...a, ...action.payload } : a
        ),
      };
    case 'DELETE_ANNOTATION':
      return {
        ...stateWithHistory,
        annotations: stateWithHistory.annotations.filter((a) => a.id !== action.payload),
        selectedId: state.selectedId === action.payload ? null : state.selectedId,
      };
    case 'SELECT_ITEM':
      return { ...state, selectedId: action.payload }; // UI Only
    case 'SET_VIEW_SCALE':
      return { ...state, viewScale: action.payload }; // UI Only
    case 'SET_CANVAS_SIZE': {
      const { widthMM, heightMM } = action.payload;
      return {
        ...stateWithHistory,
        config: {
          ...stateWithHistory.config,
          widthMM,
          heightMM,
          pixelWidth: calculatePixels(widthMM, stateWithHistory.config.dpi),
          pixelHeight: calculatePixels(heightMM, stateWithHistory.config.dpi),
        },
      };
    }
    case 'UPDATE_GLOBAL_SETTINGS': {
      const newSettings = { ...stateWithHistory.globalSettings, ...action.payload };
      const updatedAnnotations = stateWithHistory.annotations.map(ann => {
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
          ...stateWithHistory, 
          globalSettings: newSettings,
          annotations: updatedAnnotations
      };
    }
    case 'SET_EXPORT_BOUNDS':
      return { ...stateWithHistory, exportBounds: action.payload };
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