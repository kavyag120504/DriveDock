/**
 * File part for an image returned by expo-image-picker.
 *
 * On Android the picker re-encodes every image it hands back (we pass quality < 1) as real PNG or JPEG data,
 * but names the output file after the *source* type (.webp, .gif, .bmp, .jpeg ...). Deriving the declared
 * type from that name used to send things like "image/gif" for JPEG bytes, which the server refuses
 * ("Only images (JPEG, PNG, WEBP) and PDF documents are allowed"). Declare what the bytes really are:
 * PNG when the picker wrote a .png, JPEG otherwise. Camera and gallery picks then upload identically.
 */
export const imageFilePart = (asset: { uri: string }, baseName = 'photo'): { uri: string; name: string; type: string } => {
  const isPng = /\.png(?:$|\?)/i.test(asset.uri);
  return { uri: asset.uri, name: `${baseName}.${isPng ? 'png' : 'jpg'}`, type: isPng ? 'image/png' : 'image/jpeg' };
};
