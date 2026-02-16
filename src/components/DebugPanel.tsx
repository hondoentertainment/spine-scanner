import React from 'react';
import { Terminal } from 'lucide-react';
import type { LiveScanTelemetry } from '../hooks/useBarcodeScanner.ts';
import { useToast } from './Toast.tsx';
import s from './Scanner.module.css';

interface DebugPanelProps {
    logs: string[];
    telemetry: LiveScanTelemetry;
    show: boolean;
    onToggle: () => void;
}

const DebugPanel: React.FC<DebugPanelProps> = ({ logs, telemetry, show, onToggle }) => {
    const { toast } = useToast();

    return (
        <>
            <button
                onClick={onToggle}
                aria-label={show ? 'Hide debug logs' : 'Show debug logs'}
                className={s.debugBtn}
                style={{ background: show ? 'var(--primary)' : 'rgba(0,0,0,0.5)' }}
            >
                <Terminal size={16} />
            </button>

            {show && (
                <div className={s.debugPanel}>
                    <div className={s.debugHeader}>
                        <span>SCANNER LOGS</span>
                        <button
                            className={s.copyLogsBtn}
                            onClick={async () => {
                                try {
                                    await navigator.clipboard.writeText(logs.slice().reverse().join('\n'));
                                    toast('Scanner logs copied', 'success');
                                } catch {
                                    toast('Unable to copy logs', 'error');
                                }
                            }}
                            aria-label="Copy scanner logs"
                        >
                            Copy
                        </button>
                    </div>
                    <div className={s.debugLine}>
                        {'> '}
                        live telemetry: attempts={telemetry.attempts}
                        {' | '}native={telemetry.nativeHits}
                        {' | '}zxing={telemetry.zxingHits}
                        {' | '}confirmed={telemetry.confirmed}
                        {' | '}cooldownSuppressed={telemetry.cooldownSuppressed}
                        {' | '}busySuppressed={telemetry.busySuppressed}
                    </div>
                    {logs.map((log, i) => (
                        <div key={i} className={s.debugLine}>&gt; {log}</div>
                    ))}
                </div>
            )}
        </>
    );
};

export default DebugPanel;
