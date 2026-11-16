import type { ReactNode } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Colors, Layout } from '../theme/colors';
import { useResponsiveLayout } from '../theme/responsive';

type WorkspaceScreenProps = Omit<ScrollViewProps, 'children' | 'contentContainerStyle'> & {
  header: ReactNode;
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
};

/** The workspace heading scrolls away, leaving the full viewport available for its contents. */
export function WorkspaceScreen({ header, children, contentStyle, style, ...props }: WorkspaceScreenProps) {
  const { pagePadding } = useResponsiveLayout();
  return (
    <ScrollView
      {...props}
      style={[styles.scroll, style]}
      keyboardShouldPersistTaps={props.keyboardShouldPersistTaps ?? 'handled'}
    >
      {header}
      <View
        style={[Layout.content, { paddingHorizontal: pagePadding, paddingTop: pagePadding }, contentStyle]}
      >
        {children}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({ scroll: { flex: 1, backgroundColor: Colors.background } });
