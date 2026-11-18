import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { BorderRadius, Colors, Layout, Typography } from '../theme/colors';
import { useResponsiveLayout } from '../theme/responsive';
type Icon = keyof typeof Ionicons.glyphMap;
type ButtonProps = {
  label: string;
  onPress: () => void;
  icon?: Icon;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
  color?: string;
  style?: StyleProp<ViewStyle>;
};
export function Button({
  label,
  onPress,
  icon,
  loading,
  disabled,
  variant = 'primary',
  color = Colors.primary,
  style,
}: ButtonProps) {
  const inactive = disabled || loading;
  const foreground = variant === 'primary' ? '#FFFFFF' : color;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: variant === 'primary' ? color : Colors.surface, borderColor: color },
        style,
        (inactive || pressed) && { opacity: inactive ? 0.5 : 0.8 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={foreground} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={19} color={foreground} />}
          <Text style={[styles.buttonText, { color: foreground }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

type FieldProps = TextInputProps & { label: string; hint?: string; error?: string };
export function Field({ label, hint, error, style, onFocus, onBlur, ...props }: FieldProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...props}
        accessibilityLabel={props.accessibilityLabel || label}
        placeholderTextColor={Colors.textMuted}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          Layout.input,
          props.multiline && { minHeight: 110, textAlignVertical: 'top' },
          style,
          focused && { borderColor: Colors.primary, borderWidth: 2, paddingHorizontal: 13 },
          error && { borderColor: Colors.nonCompliant },
        ]}
      />
      {(error || hint) && (
        <Text
          accessibilityLiveRegion={error ? 'polite' : 'none'}
          style={[Typography.caption, { marginTop: 6 }, error && { color: Colors.nonCompliant }]}
        >
          {error || hint}
        </Text>
      )}
    </View>
  );
}

export function Notice({
  title,
  children,
  tone = 'info',
}: {
  title: string;
  children: React.ReactNode;
  tone?: 'info' | 'warning' | 'error';
}) {
  const color = tone === 'error' ? Colors.nonCompliant : tone === 'warning' ? Colors.warning : Colors.primary;
  return (
    <View
      accessibilityLiveRegion={tone === 'error' ? 'polite' : 'none'}
      style={[
        styles.notice,
        {
          backgroundColor:
            tone === 'error'
              ? Colors.nonCompliantBg
              : tone === 'warning'
                ? Colors.warningBg
                : Colors.primaryLight,
        },
      ]}
    >
      <Ionicons
        name={tone === 'info' ? 'information-circle-outline' : 'alert-circle-outline'}
        size={21}
        color={color}
      />
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text style={[styles.noticeTitle, { color }]}>{title}</Text>
        <Text style={Typography.caption}>{children}</Text>
      </View>
    </View>
  );
}

export function ScreenState({
  title,
  message,
  icon = 'cloud-offline-outline',
  loading,
  action,
  onAction,
  color = Colors.primary,
}: {
  title: string;
  message?: string;
  icon?: Icon;
  loading?: boolean;
  action?: string;
  onAction?: () => void;
  color?: string;
}) {
  return (
    <View style={styles.state} accessibilityLiveRegion="polite">
      <View style={styles.stateIcon}>
        {loading ? (
          <ActivityIndicator size="large" color={color} />
        ) : (
          <Ionicons name={icon} size={30} color={color} />
        )}
      </View>
      <Text style={[Typography.heading, { textAlign: 'center' }]}>{title}</Text>
      {message && <Text style={[Typography.body, { textAlign: 'center' }]}>{message}</Text>}
      {action && onAction && (
        <Button
          label={action}
          onPress={onAction}
          color={color}
          variant="secondary"
          style={{ marginTop: 8 }}
        />
      )}
    </View>
  );
}

/** Keep forms scrollable above the keyboard, including on small Android phones. */
export function FormScreen({ children }: { children: React.ReactNode }) {
  const { pagePadding } = useResponsiveLayout();
  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        contentContainerStyle={[Layout.form, { paddingHorizontal: pagePadding, paddingTop: pagePadding }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
export function PageHeading({
  title,
  subtitle,
  onBack,
  backLabel = 'Back',
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  backLabel?: string;
}) {
  const { compact } = useResponsiveLayout();
  return (
    <View style={{ marginBottom: compact ? 16 : 24 }}>
      {onBack && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={backLabel}
          onPress={onBack}
          style={styles.back}
        >
          <Ionicons name="arrow-back" size={20} color={Colors.primary} />
          <Text style={styles.backText}>{backLabel}</Text>
        </Pressable>
      )}
      <Text
        accessibilityRole="header"
        style={[Typography.title, compact && { fontSize: 24, lineHeight: 31 }]}
      >
        {title}
      </Text>
      {subtitle && <Text style={[Typography.body, { marginTop: 8 }]}>{subtitle}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  button: {
    minHeight: 50,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: 16,
    paddingVertical: 13,
    flexDirection: 'row',
    gap: 9,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
    maxWidth: '100%',
  },
  buttonText: { fontSize: 15, fontWeight: '700', textAlign: 'center', flexShrink: 1, minWidth: 0 },
  field: { marginBottom: 18 },
  label: { ...Typography.label, marginBottom: 7 },
  notice: { flexDirection: 'row', gap: 10, padding: 16, borderRadius: BorderRadius.md, marginBottom: 20 },
  noticeTitle: { fontSize: 14, fontWeight: '700', lineHeight: 20 },
  state: { ...Layout.card, alignItems: 'center', padding: 28, gap: 12, marginVertical: 12 },
  stateIcon: {
    height: 64,
    width: 64,
    borderRadius: 22,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    alignSelf: 'flex-start',
    marginBottom: 16,
  },
  backText: { color: Colors.primary, fontSize: 14, fontWeight: '600' },
});
