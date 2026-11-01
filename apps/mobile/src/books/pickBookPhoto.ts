import * as ImagePicker from 'expo-image-picker';

export type PickedBookPhoto =
  | { coverImg: string }
  | { cancelled: true }
  | { error: string };

/**
 * One still image for a photo-only book. Base64 is preferred so a later
 * cloud save has the picture, not a file path that only exists on this phone.
 */
export async function pickBookPhoto(source: 'camera' | 'library'): Promise<PickedBookPhoto> {
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      return { error: 'Camera access is needed to photograph a book.' };
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.5,
      base64: true,
    });
    return coverFromResult(result);
  }

  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    return { error: 'Photo library access is needed to choose a book photo.' };
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.5,
    base64: true,
  });
  return coverFromResult(result);
}

function coverFromResult(result: ImagePicker.ImagePickerResult): PickedBookPhoto {
  if (result.canceled) return { cancelled: true };
  const asset = result.assets[0];
  if (!asset) return { error: 'No photo was returned. Try again.' };
  if (asset.base64) {
    const mime = asset.mimeType && asset.mimeType.startsWith('image/') ? asset.mimeType : 'image/jpeg';
    return { coverImg: `data:${mime};base64,${asset.base64}` };
  }
  if (asset.uri) return { coverImg: asset.uri };
  return { error: 'No photo was returned. Try again.' };
}
