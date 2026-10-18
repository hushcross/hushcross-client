import styles from './Spot.module.css';

export type SpotName = 'quiet' | 'lost' | 'envelope' | 'notes' | 'welcome';

/**
 * Spot illustrations (DESIGN_SYSTEM §9.6): small line drawings built from the hero motifs —
 * the vault ring, unit squares, the sealed envelope, the crossing arcs of the mark.
 * Hairline strokes in currentColor with one accent detail; decorative only.
 */
export function Spot({ name, className }: { readonly name: SpotName; readonly className?: string }) {
  return (
    <svg viewBox="0 0 160 112" className={[styles.spot, className].filter(Boolean).join(' ')} aria-hidden="true" focusable="false" fill="none" data-spot={name}>
      <ellipse cx={80} cy={100} rx={54} ry={5} className={styles.shadow} />
      {name === 'quiet' ? <Quiet /> : name === 'lost' ? <Lost /> : name === 'envelope' ? <Envelope /> : name === 'notes' ? <Notes /> : <Quiet />}
    </svg>
  );
}

function Quiet() {
  return (
    <g>
      <circle cx={80} cy={54} r={36} className={styles.line} />
      <circle cx={80} cy={54} r={28} className={styles.dash} />
      {[0, 1, 2, 3, 4].map((i) => {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
        return <rect key={i} x={80 + Math.cos(a) * 28 - 4} y={54 + Math.sin(a) * 28 - 4} width={8} height={8} rx={2} className={i === 0 ? styles.accentFill : styles.fill} />;
      })}
      <path d="M71 54h18" className={styles.line} />
      <path d="M22 70c8-2 12-6 16-12M138 38c-8 2-12 6-16 12" className={styles.faint} />
    </g>
  );
}

function Lost() {
  return (
    <g>
      <circle cx={80} cy={54} r={38} className={styles.dash} />
      <path d="M58 32c14 5 30 20 44 44" className={styles.accent} />
      <path d="M102 32c-8 3-16 9-23 16M70 59c-5 6-9 12-12 17" className={styles.line} />
      <circle cx={80} cy={54} r={3} className={styles.accentFill} />
    </g>
  );
}

function Envelope() {
  return (
    <g>
      <rect x={42} y={26} width={76} height={58} rx={8} className={styles.paper} />
      <path d="M44 30l36 28 36-28" className={styles.line} />
      <circle cx={80} cy={58} r={8} className={styles.accentSoft} />
      <path d="M76.5 54.5l7 7M83.5 54.5l-7 7" className={styles.accent} />
      <path d="M30 40h6M124 52h6M28 64h4" className={styles.faint} />
    </g>
  );
}

function Notes() {
  return (
    <g>
      <rect x={50} y={30} width={60} height={40} rx={7} className={styles.paper} transform="rotate(-6 80 50)" />
      <rect x={50} y={36} width={60} height={40} rx={7} className={styles.paper} />
      <path d="M60 50h22M60 58h14" className={styles.line} />
      <rect x={92} y={46} width={10} height={10} rx={2.5} className={styles.accentFill} />
    </g>
  );
}
