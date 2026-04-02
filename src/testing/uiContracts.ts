export type MainViewKey = 'scan' | 'library' | 'data' | 'profile' | 'next-steps';

export const uiContracts = {
  navTabTestId: (view: MainViewKey) => `nav-tab-${view}`,
  scannerCaptureTestId: 'scanner-capture-btn',
  scannerTypeIsbnTestId: 'scanner-type-isbn-btn',
  scannerManualInputTestId: 'scanner-manual-input',
  scannerManualSubmitTestId: 'scanner-manual-submit-btn',
  scannerFileInputTestId: 'scanner-file-input',
} as const;
