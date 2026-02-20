/**
 * Haptic feedback for mobile. Uses navigator.vibrate when available.
 * - Success: short pulse
 * - Failure: double pulse
 * - Hold steady: very short nudge
 */
export const hapticSuccess = (): void => {
    if (typeof navigator?.vibrate === 'function') navigator.vibrate(50);
};

export const hapticFailure = (): void => {
    if (typeof navigator?.vibrate === 'function') navigator.vibrate([30, 50, 30]);
};

export const hapticHoldSteady = (): void => {
    if (typeof navigator?.vibrate === 'function') navigator.vibrate(20);
};
