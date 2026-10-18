import { AlertButton, AlertOptions, Platform } from 'react-native';

/**
 * Android alerts show at most three buttons, so a Cancel button would push one of
 * three options off the dialog. On Android the alert is dismissed by tapping outside
 * instead (pass DISMISSIBLE_ALERT as the options); iOS gets an explicit Cancel button.
 */
export const withCancelButton = (buttons: AlertButton[]): AlertButton[] =>
  Platform.OS === 'android' ? buttons : [...buttons, { text: 'Cancel', style: 'cancel' }];

export const DISMISSIBLE_ALERT: AlertOptions = { cancelable: true };
