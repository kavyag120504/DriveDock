import { useWindowDimensions } from 'react-native';
import { getResponsiveLayout } from './responsiveLayout';

export { getResponsiveLayout } from './responsiveLayout';

export function useResponsiveLayout() {
  return getResponsiveLayout(useWindowDimensions());
}
