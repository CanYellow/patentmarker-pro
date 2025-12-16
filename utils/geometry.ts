import { Point, AlignmentLine, StartStyle } from '../types';

/**
 * Calculates a point on a cubic Bezier curve.
 */
export const getBezierPoint = (t: number, p0: Point, p1: Point, p2: Point, p3: Point): Point => {
  const cX = 3 * (p1.x - p0.x);
  const bX = 3 * (p2.x - p1.x) - cX;
  const aX = p3.x - p0.x - cX - bX;

  const cY = 3 * (p1.y - p0.y);
  const bY = 3 * (p2.y - p1.y) - cY;
  const aY = p3.y - p0.y - cY - bY;

  const x = aX * Math.pow(t, 3) + bX * Math.pow(t, 2) + cX * t + p0.x;
  const y = aY * Math.pow(t, 3) + bY * Math.pow(t, 2) + cY * t + p0.y;

  return { x, y };
};

/**
 * Calculates control points for a patent-style lead line.
 * Rule 8: Bounding box logic.
 * Rule 9: Template based.
 * Rule 11: Perpendicular to alignment line if snapped.
 */
export const calculateSmartControlPoints = (
  start: Point,
  end: Point,
  snappedLine: AlignmentLine | null
): { cp1: Point; cp2: Point } => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  let cp1 = { x: start.x, y: start.y };
  let cp2 = { x: end.x, y: end.y };

  // Heuristic: Is the dominant direction horizontal or vertical?
  const isHorizontalish = absDx > absDy;

  // Basic S-curve or C-curve template
  // We generally want the curve to leave Start and arrive at End smoothly.
  
  if (snappedLine) {
    // Constraint: Tangent at End MUST be perpendicular to the line.
    if (snappedLine.type === 'vertical') {
      // Line is x = C. Normal is horizontal. Tangent should be horizontal (dx/dt != 0, dy/dt = 0)
      // So CP2 must have same Y as End.
      cp2 = { x: end.x - (dx * 0.5), y: end.y };
      
      // Adjust CP1 to smooth the start
      cp1 = { x: start.x + (dx * 0.5), y: start.y };
    } else {
      // Line is y = C. Normal is vertical. Tangent should be vertical.
      // So CP2 must have same X as End.
      cp2 = { x: end.x, y: end.y - (dy * 0.5) };
      
      // Adjust CP1
      cp1 = { x: start.x, y: start.y + (dy * 0.5) };
    }
  } else {
    // Default Rule 8: Parallel to long side of bounding box.
    if (isHorizontalish) {
      // Long side is X. Tangents horizontal.
      cp1 = { x: start.x + dx * 0.5, y: start.y };
      cp2 = { x: end.x - dx * 0.5, y: end.y };
    } else {
      // Long side is Y. Tangents vertical.
      cp1 = { x: start.x, y: start.y + dy * 0.5 };
      cp2 = { x: end.x, y: end.y - dy * 0.5 };
    }
  }

  return { cp1, cp2 };
};

export const findSnapLine = (
  pos: Point,
  lines: AlignmentLine[],
  threshold: number
): { point: Point; line: AlignmentLine | null } => {
  let bestDist = threshold;
  let snappedPoint = { ...pos };
  let bestLine: AlignmentLine | null = null;

  lines.forEach((line) => {
    if (line.type === 'vertical') {
      const dist = Math.abs(pos.x - line.value);
      if (dist < bestDist) {
        bestDist = dist;
        snappedPoint.x = line.value;
        // Keep Y same
        bestLine = line;
      }
    } else {
      const dist = Math.abs(pos.y - line.value);
      if (dist < bestDist) {
        bestDist = dist;
        snappedPoint.y = line.value;
        // Keep X same
        bestLine = line;
      }
    }
  });

  return { point: snappedPoint, line: bestLine };
};

/**
 * Calculates position for text based on the tangent at the end of the curve.
 * Rule 12: Fixed distance.
 */
export const calculateTextPosition = (
  end: Point,
  cp2: Point,
  offset: number
): Point => {
  // Vector from CP2 to End is the tangent direction.
  let dx = end.x - cp2.x;
  let dy = end.y - cp2.y;
  
  // If points are identical (degenerate), default to right
  if (dx === 0 && dy === 0) {
    dx = 1;
  }

  const len = Math.sqrt(dx * dx + dy * dy);
  const uX = dx / len;
  const uY = dy / len;

  return {
    x: end.x + uX * offset,
    y: end.y + uY * offset,
  };
};

export const cycleStartStyle = (current: StartStyle): StartStyle => {
  if (current === StartStyle.NONE) return StartStyle.ARROW;
  if (current === StartStyle.ARROW) return StartStyle.DOT;
  return StartStyle.NONE;
};
