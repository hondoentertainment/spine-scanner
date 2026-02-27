import { useRef, useCallback } from 'react';

const DEFAULT_FRAME_COUNT = 3;
const MAX_FRAME_COUNT = 5;
const FRAME_CAPTURE_INTERVAL_MS = 80;

interface UseFrameAveragingOptions {
    frameCount?: number;
}

/**
 * Hook that captures multiple consecutive video frames and averages them
 * pixel-by-pixel to reduce noise and minor motion blur.
 * 
 * Averaging N frames reduces random noise by sqrt(N) — 3 frames gives ~42%
 * noise reduction which meaningfully improves OCR on noisy phone cameras.
 */
export function useFrameAveraging({ frameCount = DEFAULT_FRAME_COUNT }: UseFrameAveragingOptions = {}) {
    const captureCanvas = useRef<HTMLCanvasElement | null>(null);
    const count = Math.min(Math.max(1, frameCount), MAX_FRAME_COUNT);

    const getCanvas = () => {
        if (!captureCanvas.current) {
            captureCanvas.current = document.createElement('canvas');
        }
        return captureCanvas.current;
    };

    /**
     * Capture `count` frames from a video element spaced by FRAME_CAPTURE_INTERVAL_MS,
     * average them pixel-by-pixel, and return the result as a data URL.
     * 
     * Falls back to a single frame if the video isn't ready or on any error.
     */
    const captureAveragedFrame = useCallback(async (
        video: HTMLVideoElement,
    ): Promise<string | null> => {
        if (!video || video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
            return null;
        }

        const w = video.videoWidth;
        const h = video.videoHeight;
        const canvas = getCanvas();
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        try {
            if (count <= 1) {
                ctx.drawImage(video, 0, 0, w, h);
                return canvas.toDataURL('image/jpeg', 0.92);
            }

            // Accumulator for pixel sums (Float32 avoids overflow for up to 255*5=1275)
            const accumulator = new Float32Array(w * h * 4);
            let capturedFrames = 0;

            for (let i = 0; i < count; i++) {
                ctx.drawImage(video, 0, 0, w, h);
                const frameData = ctx.getImageData(0, 0, w, h).data;
                
                for (let p = 0; p < frameData.length; p++) {
                    accumulator[p] += frameData[p];
                }
                capturedFrames++;

                if (i < count - 1) {
                    await new Promise(resolve => setTimeout(resolve, FRAME_CAPTURE_INTERVAL_MS));
                    if (video.readyState < 2) break;
                }
            }

            if (capturedFrames === 0) return null;

            // Average and write back
            const outputData = ctx.createImageData(w, h);
            const output = outputData.data;
            for (let p = 0; p < output.length; p++) {
                output[p] = Math.round(accumulator[p] / capturedFrames);
            }
            // Ensure alpha channel is fully opaque
            for (let p = 3; p < output.length; p += 4) {
                output[p] = 255;
            }

            ctx.putImageData(outputData, 0, 0);
            return canvas.toDataURL('image/jpeg', 0.92);
        } catch {
            // Fallback: single frame
            try {
                ctx.drawImage(video, 0, 0, w, h);
                return canvas.toDataURL('image/jpeg', 0.92);
            } catch {
                return null;
            }
        }
    }, [count]);

    return { captureAveragedFrame };
}
