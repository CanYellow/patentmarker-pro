export type Point = { x: number; y: number };

export enum ToolMode {
  SELECT = 'SELECT',
  DRAW_ANNOTATION = 'DRAW_ANNOTATION',
  ADD_V_LINE = 'ADD_V_LINE',
  ADD_H_LINE = 'ADD_H_LINE',
}

export enum StartStyle {
  NONE = 'NONE',
  ARROW = 'ARROW',
  DOT = 'DOT',
}

export interface AlignmentLine {
  id: string;
  type: 'vertical' | 'horizontal';
  value: number; // x for vertical, y for horizontal
}

export interface Annotation {
  id: string;
  startPoint: Point;
  endPoint: Point;
  controlPoint1: Point;
  controlPoint2: Point;
  text: string;
  startStyle: StartStyle;
  groupId: string; // Grouping text and curve
  fontSize?: number;
  strokeWidth?: number;
}

export interface CanvasConfig {
  widthMM: number;
  heightMM: number;
  dpi: number;
  pixelWidth: number;
  pixelHeight: number;
}

export interface GlobalSettings {
  fontSize: number;
  strokeWidth: number;
  labelStep: number;
  labelStartValue: number; // Initial value if no numbers found
}

export interface AppState {
  config: CanvasConfig;
  image: {
    src: string | null;
    x: number;
    y: number;
    scale: number;
    rotation: number;
    width: number;
    height: number;
  };
  alignmentLines: AlignmentLine[];
  annotations: Annotation[];
  mode: ToolMode;
  selectedId: string | null;
  viewScale: number; // For UI zooming
  activeAnnotationId: string | null; // Currently being drawn
  globalSettings: GlobalSettings;
}

export type Action =
  | { type: 'SET_MODE'; payload: ToolMode }
  | { type: 'SET_IMAGE'; payload: { src: string; width: number; height: number } }
  | { type: 'UPDATE_IMAGE_TRANSFORM'; payload: Partial<AppState['image']> }
  | { type: 'ADD_ALIGNMENT_LINE'; payload: AlignmentLine }
  | { type: 'UPDATE_ALIGNMENT_LINE'; payload: { id: string; value: number } }
  | { type: 'DELETE_ALIGNMENT_LINE'; payload: string }
  | { type: 'ADD_ANNOTATION'; payload: Annotation }
  | { type: 'UPDATE_ANNOTATION'; payload: Partial<Annotation> & { id: string } }
  | { type: 'DELETE_ANNOTATION'; payload: string }
  | { type: 'SELECT_ITEM'; payload: string | null }
  | { type: 'SET_VIEW_SCALE'; payload: number }
  | { type: 'SET_CANVAS_SIZE'; payload: { widthMM: number; heightMM: number } }
  | { type: 'UPDATE_GLOBAL_SETTINGS'; payload: Partial<GlobalSettings> };
