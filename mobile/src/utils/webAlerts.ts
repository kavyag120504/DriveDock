import { Alert, AlertButton, Platform } from 'react-native';

/**
 * React Native Web does not implement Alert.alert, so on the web every alert, confirmation and
 * option picker in the app silently did nothing. This maps Alert.alert onto the browser's own
 * dialogs: a plain message uses window.alert, one action plus Cancel uses window.confirm, and
 * several actions use a numbered window.prompt. Phones keep the native alerts.
 */
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  (Alert as any).alert = (title: string, message?: string, buttons?: AlertButton[]) => {
    const text = [title, message].filter(Boolean).join('\n\n');
    const list: AlertButton[] = buttons && buttons.length ? buttons : [{ text: 'OK' }];
    const cancel = list.find((b) => b.style === 'cancel');
    const actions = list.filter((b) => b !== cancel);

    // Just a message (with at most one button to run afterwards)
    if (actions.length <= 1 && !cancel) {
      window.alert(text);
      actions[0]?.onPress?.();
      return;
    }

    // One action to confirm or cancel
    if (actions.length <= 1) {
      const action = actions[0];
      if (action && window.confirm(`${text}\n\nOK = ${action.text}`)) action.onPress?.();
      else cancel?.onPress?.();
      return;
    }

    // Several actions: pick one by number
    const choice = window.prompt(
      `${text}\n\n${actions.map((b, i) => `${i + 1}. ${b.text}`).join('\n')}\n\nType a number:`
    );
    const picked = choice ? actions[parseInt(choice, 10) - 1] : undefined;
    if (picked) picked.onPress?.();
    else cancel?.onPress?.();
  };
}
