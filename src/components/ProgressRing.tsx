interface ProgressRingProps {
  percent: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
}

export default function ProgressRing({ percent, size = 36, strokeWidth = 3, className = '' }: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(100, Math.max(0, percent)) / 100) * circumference;
  const color = percent >= 100 ? 'var(--status-read)' : percent > 0 ? 'var(--accent-blue)' : 'var(--text-muted)';

  return (
    <svg width={size} height={size} className={`progress-ring ${className}`} aria-hidden="true">
      <circle
        className="progress-ring-bg"
        cx={size / 2}
        cy={size / 2}
        r={radius}
        strokeWidth={strokeWidth}
      />
      <circle
        className="progress-ring-fill"
        cx={size / 2}
        cy={size / 2}
        r={radius}
        strokeWidth={strokeWidth}
        stroke={color}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
      />
      {percent > 0 && (
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="central"
          fill="var(--text-muted)"
          fontSize={size * 0.24}
          fontWeight={700}
          style={{ transform: 'rotate(90deg)', transformOrigin: 'center' }}
        >
          {Math.round(percent)}%
        </text>
      )}
    </svg>
  );
}
