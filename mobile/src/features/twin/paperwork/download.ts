import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { TwinAPI } from '../api';

export type FormKind = 'form29' | 'form30' | 'insurer-letter';

/**
 * Fetches a worksheet with the signed-in session (the server issues no download links) and hands it to
 * the phone's share sheet to save, print or send; on the web it downloads as a file.
 */
export const downloadAndOpenForm = async (transferId: string, form: FormKind): Promise<void> => {
  const res = await TwinAPI.downloadForm(transferId, form);
  const disposition = String(res.headers?.['content-disposition'] ?? '');
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `${form}-worksheet.pdf`;

  if (Platform.OS === 'web') {
    const doc = (globalThis as any).document;
    const url = (globalThis as any).URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
    const link = doc.createElement('a');
    link.href = url;
    link.download = filename;
    doc.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => (globalThis as any).URL.revokeObjectURL(url), 10_000);
    return;
  }

  const file = new File(Paths.cache, filename);
  file.create({ overwrite: true });
  await file.write(new Uint8Array(res.data));

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('This device cannot open or share files from the app.');
  }
  await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Save or share your worksheet' });
};
