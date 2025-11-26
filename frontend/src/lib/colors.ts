/**
 * Generates a deterministic, high-saturation, pleasant color from any string.
 * @param str The input string (e.g., object type)
 * @returns An HSL color string (e.g., "hsl(145, 70%, 50%)")
 */
export function getDeterministicColor(str: string): string {
  // Simple hash function
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
    hash = hash & hash; // Convert to 32bit integer
  }
  
  // Use the hash to generate an HSL color
  // Hue (0-360): The color itself. We use modulo.
  const hue = Math.abs(hash % 360);
  
  // Saturation (60-80%): Keep colors vibrant, not dull.
  const saturation = 60 + Math.abs(hash % 20);
  
  // Lightness (40-60%): Keep colors dark enough to be seen, light enough to not be black.
  const lightness = 40 + Math.abs(hash % 20);

  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

/**
 * The standard "greyed out" color for deselected items.
 */
export const DESELECTED_COLOR = '#D1D5DB'; // A light grey