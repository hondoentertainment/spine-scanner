import type { ExpoConfig } from 'expo/config';

const cameraPermission = 'Spine Scanner uses the camera to scan ISBN barcodes on books.';

const config: ExpoConfig = {
  name: 'Spine Scanner',
  slug: 'spine-scanner',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'spinescanner',
  userInterfaceStyle: 'dark',
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.hondoentertainment.spinescanner',
    infoPlist: {
      NSCameraUsageDescription: cameraPermission,
    },
  },
  android: {
    package: 'com.hondoentertainment.spinescanner',
    adaptiveIcon: {
      backgroundColor: '#0f172a',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    bundler: 'metro',
    output: 'server',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        image: './assets/images/splash-icon.png',
        resizeMode: 'contain',
        backgroundColor: '#0f172a',
      },
    ],
    'expo-secure-store',
    [
      'expo-camera',
      {
        cameraPermission,
        microphonePermission: false,
        recordAudioAndroid: false,
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
};

export default config;
