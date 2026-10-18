import { epitrochoidPath, PLATE_ROSETTE, wavePath } from './trochoid';

/** The plate rosette: three woven epitrochoids, hairline strokes in `currentColor`. */
export function Rosette({ className, strokeWidth = 0.45 }: { readonly className?: string; readonly strokeWidth?: number }) {
  return (
    <svg viewBox="-104 -104 208 208" className={className} aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth={strokeWidth}>
      {PLATE_ROSETTE.map((layer, i) => (
        <path key={i} d={epitrochoidPath(layer)} opacity={1 - i * 0.18} />
      ))}
      <circle r={22} opacity={0.6} />
      <circle r={19.5} opacity={0.35} />
    </svg>
  );
}

/** A guilloché border band (four phase-shifted waves). */
export function WaveBand({ className, width = 600, height = 28 }: { readonly className?: string; readonly width?: number; readonly height?: number }) {
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className={className} aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth={0.6}>
      {[0, 0.8, 1.6, 2.4].map((phase) => (
        <path key={phase} d={wavePath({ width, height, waves: width / 22, phase, amplitude: height * 0.36 })} />
      ))}
    </svg>
  );
}
