import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import type { TrackPoint } from '../types';
import { colors } from '../theme';

/**
 * Tile-free route thumbnail: projects the GPS trace onto an SVG canvas.
 * Works everywhere without map API keys — used in list cards.
 * While `loading`, renders a plain box; once loaded, runs without a route
 * get a footsteps glyph instead of an empty tile.
 */
export function RoutePreview({
  points,
  width,
  height,
  stroke = colors.accent,
  strokeWidth = 2.5,
  loading = false,
}: {
  points: TrackPoint[];
  width: number;
  height: number;
  stroke?: string;
  strokeWidth?: number;
  loading?: boolean;
}) {
  if (points.length < 2) {
    return (
      <View style={[styles.placeholder, { width, height }]}>
        {!loading && (
          <Ionicons
            name="footsteps-outline"
            size={Math.round(Math.min(width, height) * 0.4)}
            color={colors.textTertiary}
          />
        )}
      </View>
    );
  }

  const lats = points.map((p) => p.latitude);
  const lngs = points.map((p) => p.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  // Equirectangular projection with latitude correction
  const midLat = ((minLat + maxLat) / 2) * (Math.PI / 180);
  const lngScale = Math.cos(midLat);
  const spanX = Math.max((maxLng - minLng) * lngScale, 1e-6);
  const spanY = Math.max(maxLat - minLat, 1e-6);

  const pad = strokeWidth * 2;
  const availW = width - pad * 2;
  const availH = height - pad * 2;
  const scale = Math.min(availW / spanX, availH / spanY);
  const offsetX = pad + (availW - spanX * scale) / 2;
  const offsetY = pad + (availH - spanY * scale) / 2;

  const toXY = (p: TrackPoint): [number, number] => [
    offsetX + (p.longitude - minLng) * lngScale * scale,
    offsetY + (maxLat - p.latitude) * scale,
  ];

  // One path per segment so pauses appear as gaps
  const paths: string[] = [];
  let current = '';
  let lastSegment = -1;
  for (const p of points) {
    const [x, y] = toXY(p);
    if (p.segment !== lastSegment) {
      if (current) paths.push(current);
      current = `M ${x.toFixed(1)} ${y.toFixed(1)}`;
      lastSegment = p.segment;
    } else {
      current += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
    }
  }
  if (current) paths.push(current);

  const [startX, startY] = toXY(points[0]);
  const [endX, endY] = toXY(points[points.length - 1]);

  return (
    <Svg width={width} height={height}>
      {paths.map((d, i) => (
        <Path
          key={i}
          d={d}
          stroke={stroke}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      <Circle cx={startX} cy={startY} r={strokeWidth + 1} fill={colors.text} />
      <Circle cx={endX} cy={endY} r={strokeWidth + 1} fill={stroke} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
