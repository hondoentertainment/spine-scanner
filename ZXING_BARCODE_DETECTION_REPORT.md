# Comprehensive Report: ZXing BrowserMultiFormatReader EAN-13 Detection Issues

## Executive Summary

This report addresses common issues with `@zxing/browser` `BrowserMultiFormatReader` failing to detect EAN-13 barcodes from live webcam feeds. Based on research, there are several known limitations and better alternatives available.

---

## 1. Canvas-Captured Frames vs. Direct Video Stream

### Current Approach Issues

**BrowserMultiFormatReader with canvas-captured frames has limitations:**

- **Memory Leaks**: Using `decodeFromImageElement` with canvas-captured frames causes significant memory issues (~50MB per call), with memory being freed slowly (~3 minutes after calls)
- **Canvas Conversion Errors**: Known issues exist when using `getImageData` from canvas context directly, causing errors during the conversion process
- **Performance Overhead**: Frame-by-frame canvas capture adds unnecessary processing overhead compared to direct video stream access

### Better Approach: Use `decodeFromVideoDevice`

**Recommendation**: Use `decodeFromVideoDevice()` or `decodeOnceFromVideoDevice()` instead of canvas-captured frames.

**Advantages:**
- Direct access to video stream without intermediate canvas processing
- More efficient memory usage
- Better performance for continuous scanning
- Built-in continuous decoding mode

**Example Implementation:**
```typescript
import { BrowserMultiFormatReader } from '@zxing/library';

const codeReader = new BrowserMultiFormatReader();
codeReader.decodeFromVideoDevice(deviceId, videoElement, (result, err) => {
  if (result) {
    console.log('Barcode detected:', result.getText());
  }
  if (err) {
    // Handle error
  }
});
```

---

## 2. Known Issues with `decodeFromImageElement`

### Critical Problems

1. **Memory Consumption**: Each call increases memory usage by approximately 50MB, with slow garbage collection (~3 minutes)
2. **Not Suitable for Frequent Use**: Should be used sparingly, not in frame-by-frame loops
3. **EAN-13 Format Conflicts**: When both EAN-13 and UPC-A formats are enabled, barcodes starting with '0' may fail detection due to format conversion logic issues where raw bytes are not properly set

### Impact on Detection

- **Missed Detections**: The memory overhead and processing delays can cause frames to be skipped or processed incorrectly
- **False Negatives**: Format conflicts between EAN-13 and UPC-A can prevent valid barcodes from being detected
- **Performance Degradation**: Repeated calls degrade performance over time

**Recommendation**: Avoid `decodeFromImageElement` for live webcam feeds. Use `decodeFromVideoDevice` for real-time scanning.

---

## 3. Continuous Decoding Mode: `decodeFromVideoDevice`

### Yes, Continuous Mode Exists and is More Reliable

**`decodeFromVideoDevice()` provides continuous decoding:**

- Runs continuously until explicitly stopped
- More reliable than frame-by-frame capture
- Better resource management
- Configurable frame rate via `timeBetweenDecodingAttempts`

### Configuration Options

```typescript
// Configure scan interval (default: 500ms)
const codeReader = new BrowserMultiFormatReader(
  hints, 
  timeBetweenScansMillis // e.g., 300 for faster scanning
);

// Or adjust after initialization
codeReader.timeBetweenDecodingAttempts = 300; // milliseconds
```

### Best Practices for Continuous Mode

1. **Proper Cleanup**: Always call `reset()` to clean up resources:
   ```typescript
   codeReader.reset();
   ```

2. **Stream Management**: Use `BrowserCodeReader.releaseAllStreams()` to ensure all media streams are terminated

3. **Error Handling**: Note that permission errors may not be properly returned in callbacks (known library limitation)

4. **Single Scan Alternative**: Use `decodeOnceFromVideoDevice()` for single detection operations

### Known Issues with Continuous Mode

- Occasional unexpected camera shutoffs when getting closer to barcodes (browser/device dependent)
- Error handling limitations: some errors are logged internally but not returned to callbacks

---

## 4. Optimal Resolution and Image Format

### Resolution Recommendations

**While specific optimal resolutions aren't explicitly documented, research suggests:**

1. **Camera Constraints**: Configure camera constraints for optimal quality:
   ```typescript
   const constraints = {
     video: {
       width: { ideal: 1280 },
       height: { ideal: 720 },
       facingMode: 'environment' // for back camera on mobile
     }
   };
   ```

2. **Avoid Full Resolution**: Users report inconsistent EAN-13 decoding at full camera resolution, suggesting moderate resolutions (720p-1080p) may work better

3. **Focus Area**: Consider cropping the video feed to focus on the barcode area for better detection

### Image Format

- **Supported Sources**: Video camera feeds, Image URLs, Video URLs, `<img>` and `<video>` HTML elements
- **Format**: The library works with standard web image formats (JPEG, PNG) but direct video stream is preferred
- **Quality**: Higher quality video streams generally improve detection, but very high resolutions may cause issues

### Optimization Tips

- Use `TRY_HARDER` hint for better detection:
  ```typescript
  const hints = new Map();
  hints.set(DecodeHintType.TRY_HARDER, true);
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13]);
  ```

- Limit formats to only what you need (e.g., EAN-13 only) to improve performance

---

## 5. Alternative Barcode Scanning Libraries

### Recommended Alternatives

#### 1. **qr-scanner** (Highly Recommended)

**Advantages:**
- Lightweight: ~16.3 KB gzipped (~5.6 KB with native BarcodeDetector)
- Runs in WebWorker (keeps UI thread responsive)
- 2-3x higher detection rate than popular alternatives
- Uses browser's native BarcodeDetector API when available
- Actively maintained
- Supports EAN-13 and other formats

**Limitation**: Primarily focused on QR codes, but supports barcodes via native BarcodeDetector API

#### 2. **STRICH** (Commercial Option)

**Advantages:**
- Outperforms open-source libraries in real-world scenarios
- Better accuracy and faster scanning times
- Professional-grade solution
- Better EAN-13 support

**Limitation**: Paid/commercial license required

#### 3. **html5-qrcode** (Maintenance Mode)

**Status**: In maintenance mode with 422 open issues
- 487k weekly downloads
- Handles camera, UI, and decoding
- **Not recommended** due to maintenance status

### Libraries to Avoid

- **QuaggaJS/Quagga2**: Only supports 1D barcodes, unmaintained since 2017
- **qrcode-reader**: Deprecated, unmaintained for 8+ years
- **jsqr**: Decoder-only (requires manual camera setup), last updated 5 years ago

### Migration Recommendation

**For EAN-13 barcode scanning, consider:**

1. **Try native BarcodeDetector API first** (if browser support is acceptable):
   ```javascript
   const detector = new BarcodeDetector({ formats: ['ean_13'] });
   ```

2. **If native API isn't sufficient, use qr-scanner** with BarcodeDetector fallback

3. **For production/critical applications, consider STRICH** for best reliability

---

## Analysis of Current Implementation

Based on review of `src/hooks/useBarcodeScanner.ts`, the current implementation exhibits several of the problematic patterns identified in this report:

### Current Issues Identified

1. **Canvas-Captured Frames Pattern** (Lines 212-262)
   - Using `canvas.toDataURL()` → `Image` → `decodeFromImageElement()`
   - This is the exact pattern that causes memory leaks (~50MB per call)
   - Processing every 200ms (BARCODE_SCAN_INTERVAL) compounds the memory issue

2. **Multiple Format Conflicts** (Lines 108-111)
   - Enabling both EAN-13 and UPC-A can cause detection failures for barcodes starting with '0'
   - Current code includes: EAN_13, EAN_8, UPC_A, UPC_E

3. **Inefficient Frame Processing**
   - Creating new Image objects and loading data URLs on every scan attempt
   - Two decode attempts per frame (preprocessed and raw) doubles memory usage

4. **Missing Cleanup**
   - No `reset()` call on BrowserMultiFormatReader when component unmounts
   - Canvas and image references may not be properly released

### Current Strengths

- ✅ Already using native BarcodeDetector API as primary method
- ✅ Using TRY_HARDER hint
- ✅ Has streak confirmation logic to reduce false positives
- ✅ Good error handling and telemetry

### Recommended Refactoring

**Option 1: Hybrid Approach (Recommended)**
- Keep native BarcodeDetector for primary detection (already working well)
- Replace ZXing canvas-capture pattern with `decodeFromVideoDevice()` for fallback
- This maintains your dual-detector strategy while fixing memory issues

**Option 2: ZXing-Only with Continuous Mode**
- Replace entire canvas-capture loop with `decodeFromVideoDevice()`
- Use native BarcodeDetector only when ZXing fails
- Simpler code, better performance

**Option 3: Remove UPC-A Format**
- If EAN-13 is primary use case, remove UPC-A from formats to avoid conflicts
- Keep EAN-13 and EAN-8 only

### Specific Code Changes Needed

1. **Remove canvas capture pattern** (lines 212-262)
2. **Add `decodeFromVideoDevice()` for ZXing fallback**
3. **Add `reset()` cleanup** in useEffect cleanup function
4. **Consider removing UPC-A** from format list if not needed
5. **Reduce scan frequency** if using continuous mode (300-500ms instead of 200ms)

---

## Summary of Recommendations

### Immediate Actions

1. **Switch from canvas-captured frames to `decodeFromVideoDevice()`**
   - Eliminates memory leaks
   - Better performance
   - More reliable detection

2. **Configure continuous decoding properly**
   - Set appropriate `timeBetweenDecodingAttempts` (300-500ms)
   - Always call `reset()` for cleanup
   - Use `decodeOnceFromVideoDevice()` for single scans

3. **Optimize detection settings**
   - Use `TRY_HARDER` hint
   - Limit formats to EAN-13 only (avoid UPC-A conflicts)
   - Use moderate camera resolution (720p-1080p)

4. **Consider alternative libraries**
   - Evaluate native BarcodeDetector API support
   - Test qr-scanner as a lightweight alternative
   - Consider STRICH for production-critical applications

### Code Example: Optimized Implementation

```typescript
import { BrowserMultiFormatReader, DecodeHintType, BarcodeFormat } from '@zxing/library';

// Configure hints for EAN-13 only
const hints = new Map();
hints.set(DecodeHintType.TRY_HARDER, true);
hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13]);

// Create reader with optimized scan interval
const codeReader = new BrowserMultiFormatReader(hints, 300);

// Use continuous decoding from video device
codeReader.decodeFromVideoDevice(
  null, // auto-select device
  videoElement,
  (result, err) => {
    if (result) {
      console.log('EAN-13 detected:', result.getText());
      // Optionally stop after successful detection
      // codeReader.reset();
    }
    if (err && err.name !== 'NotFoundException') {
      console.error('Decoding error:', err);
    }
  }
);

// Cleanup when done
// codeReader.reset();
```

### Migration Example: Refactoring Current Implementation

Here's how to refactor `useBarcodeScanner.ts` to use `decodeFromVideoDevice()` instead of canvas capture:

**Before (Current Pattern - Lines 210-262):**
```typescript
// Canvas capture pattern (causes memory leaks)
const bCanvas = barcodeCanvasRef.current;
ctx.drawImage(video, 0, 0);
const tmpImg = new Image();
tmpImg.src = bCanvas.toDataURL('image/png');
const result = await reader.decodeFromImageElement(tmpImg);
```

**After (Recommended Pattern):**
```typescript
// Use decodeFromVideoDevice for continuous scanning
useEffect(() => {
    if (!cameraReady || cameraError || isScanning) return;
    
    let zxingActive = false;
    const video = getVideo();
    if (!video) return;
    
    const reader = await getBarcodeReader();
    
    // Start continuous ZXing decoding
    const controls = reader.decodeFromVideoDevice(
        null, // auto-select device
        video,
        (result, err) => {
            if (result && zxingActive) {
                const raw = result.getText().replace(/[^0-9X]/g, '');
                if (raw.length === 13 || raw.length === 10) {
                    const isbn = validateBarcode(raw, addLog, 'ZXing');
                    if (isbn) {
                        bumpTelemetry('zxingHits', 1, true);
                        // Handle detection...
                    }
                }
            }
            if (err && err.name !== 'NotFoundException') {
                // Handle error (but note: some errors may not be returned)
            }
        }
    );
    
    zxingActive = true;
    
    return () => {
        zxingActive = false;
        reader.reset(); // Critical: cleanup resources
        controls.stop(); // Stop the continuous decoding
    };
}, [cameraReady, cameraError, isScanning, /* ... */]);
```

**Key Changes:**
1. Remove canvas capture code (lines 212-262)
2. Use `decodeFromVideoDevice()` instead of `decodeFromImageElement()`
3. Call `reader.reset()` in cleanup
4. Call `controls.stop()` to stop continuous decoding
5. Remove `barcodeCanvasRef` and `liveZxingImageRef` (no longer needed)

---

## Additional Notes

- **Library Status**: zxing-js is currently in maintenance mode, seeking new maintainers
- **EAN-13 Specific Issues**: Known inconsistencies with EAN-13 decoding, especially at full camera resolution
- **Browser Compatibility**: Test thoroughly across different browsers and devices
- **Mobile Considerations**: Use `facingMode: 'environment'` for back camera on mobile devices

---

## References

- [ZXing-js GitHub Repository](https://github.com/zxing-js/library)
- [ZXing Browser Package](https://github.com/zxing-js/browser)
- [ZXing Examples](https://zxing-js.github.io/library/examples/)
- [qr-scanner Library](https://github.com/nimiq/qr-scanner)
- [STRICH Comparison](https://strich.io/strich-compared-to-zxing-js-and-quagga.html)

---

*Report generated: February 15, 2026*
