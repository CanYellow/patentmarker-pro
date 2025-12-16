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

  const isHorizontalish = absDx > absDy;

  if (snappedLine) {
    if (snappedLine.type === 'vertical') {
      // Tangent perpendicular to vertical line -> Horizontal
      cp2 = { x: end.x - (dx * 0.5), y: end.y };
      cp1 = { x: start.x + (dx * 0.5), y: start.y };
    } else {
      // Tangent perpendicular to horizontal line -> Vertical
      cp2 = { x: end.x, y: end.y - (dy * 0.5) };
      cp1 = { x: start.x, y: start.y + (dy * 0.5) };
    }
  } else {
    if (isHorizontalish) {
      cp1 = { x: start.x + dx * 0.5, y: start.y };
      cp2 = { x: end.x - dx * 0.5, y: end.y };
    } else {
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
        bestLine = line;
      }
    } else {
      const dist = Math.abs(pos.y - line.value);
      if (dist < bestDist) {
        bestDist = dist;
        snappedPoint.y = line.value;
        bestLine = line;
      }
    }
  });

  return { point: snappedPoint, line: bestLine };
};

export type TextDirection = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

/**
 * Determines the layout direction for text based on the tangent.
 * Now returns strictly the direction enum to allow precise rendering in the component.
 */
export const calculateTextDirection = (
  end: Point,
  cp2: Point
): TextDirection => {
  // Vector from CP2 to End is the tangent direction.
  let dx = end.x - cp2.x;
  let dy = end.y - cp2.y;
  
  if (dx === 0 && dy === 0) {
    dx = 1; 
  }

  // Normalize (not strictly necessary for sign check but good for debugging)
  const len = Math.sqrt(dx * dx + dy * dy);
  const uX = dx / len;
  const uY = dy / len;

  // Determine dominant direction
  const isHorizontal = Math.abs(uX) > Math.abs(uY);

  if (isHorizontal) {
    if (uX > 0) return 'RIGHT';
    return 'LEFT';
  } else {
     if (uY > 0) return 'DOWN';
     return 'UP';
  }
};

/**
 * Returns points [x1, y1, x2, y2...] for a sharp, concave arrow head
 */
export const calculateArrowPoints = (
    tip: Point,
    from: Point, // Usually ControlPoint1
    length: number = 15,
    width: number = 10,
    concavity: number = 0.3 // 0 to 1, how deep the back is
): number[] => {
    const dx = tip.x - from.x;
    const dy = tip.y - from.y;
    const angle = Math.atan2(dy, dx);

    // Template points relative to tip (0,0) facing 0 degrees (Right)
    // Tip: (0,0)
    // Top Back: (-length, -width/2)
    // Bottom Back: (-length, width/2)
    // Concave center: (-length * (1 - concavity), 0)

    const baseX = -length;
    const halfW = width / 2;
    const innerX = -length * (1 - concavity);

    const points = [
        { x: 0, y: 0 },
        { x: baseX, y: -halfW },
        { x: innerX, y: 0 },
        { x: baseX, y: halfW }
    ];

    // Rotate and Translate
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    const result: number[] = [];
    points.forEach(p => {
        const rX = p.x * cos - p.y * sin;
        const rY = p.x * sin + p.y * cos;
        result.push(tip.x + rX);
        result.push(tip.y + rY);
    });

    return result;
};

export const cycleStartStyle = (current: StartStyle): StartStyle => {
  if (current === StartStyle.NONE) return StartStyle.ARROW;
  if (current === StartStyle.ARROW) return StartStyle.DOT;
  return StartStyle.NONE;
};