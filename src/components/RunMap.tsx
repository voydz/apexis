import React, { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from 'react-native-maps';
import * as Location from 'expo-location';
import type { TrackPoint } from '../types';
import { colors, radius } from '../theme';

/** Viewport height in degrees latitude for live tracking (~250 m). */
const LIVE_ZOOM_DELTA = 0.0022;

const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#12151c' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8A94A6' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0A0C10' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1e2530' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0d1420' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];

/**
 * Route map. `live` mode shows the user dot and gently follows the latest
 * fix; static mode frames the whole route once.
 */
export function RunMap({
  points,
  style,
  live = false,
}: {
  points: TrackPoint[];
  style?: ViewStyle;
  live?: boolean;
}) {
  const mapRef = useRef<MapView>(null);
  const lastFollowAt = useRef(0);
  const hasZoomedIn = useRef(false);

  const segments = useMemo(() => {
    const out: { latitude: number; longitude: number }[][] = [];
    let current: { latitude: number; longitude: number }[] = [];
    let lastSegment = -1;
    for (const p of points) {
      if (p.segment !== lastSegment && current.length > 0) {
        out.push(current);
        current = [];
      }
      lastSegment = p.segment;
      current.push({ latitude: p.latitude, longitude: p.longitude });
    }
    if (current.length > 0) out.push(current);
    return out;
  }, [points]);

  const staticRegion = useMemo(() => {
    if (live || points.length === 0) return undefined;
    const lats = points.map((p) => p.latitude);
    const lngs = points.map((p) => p.longitude);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: Math.max((maxLat - minLat) * 1.4, 0.004),
      longitudeDelta: Math.max((maxLng - minLng) * 1.4, 0.004),
    };
  }, [live, points]);

  // Live mode: center on the current position before the run has points
  useEffect(() => {
    if (!live) return;
    Location.getLastKnownPositionAsync()
      .then((loc) => {
        if (loc && points.length === 0) {
          mapRef.current?.animateToRegion(
            {
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
              latitudeDelta: LIVE_ZOOM_DELTA,
              longitudeDelta: LIVE_ZOOM_DELTA,
            },
            600
          );
          hasZoomedIn.current = true;
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  // Live mode: follow the latest fix, throttled so panning stays usable.
  // The first follow also sets the zoom; later ones only re-center so a
  // manual pinch-zoom by the user is preserved.
  const last = points.length > 0 ? points[points.length - 1] : undefined;
  useEffect(() => {
    if (!live || !last) return;
    if (!hasZoomedIn.current) {
      hasZoomedIn.current = true;
      mapRef.current?.animateToRegion(
        {
          latitude: last.latitude,
          longitude: last.longitude,
          latitudeDelta: LIVE_ZOOM_DELTA,
          longitudeDelta: LIVE_ZOOM_DELTA,
        },
        600
      );
      lastFollowAt.current = Date.now();
      return;
    }
    const now = Date.now();
    if (now - lastFollowAt.current < 3000) return;
    lastFollowAt.current = now;
    mapRef.current?.animateCamera(
      { center: { latitude: last.latitude, longitude: last.longitude } },
      { duration: 800 }
    );
  }, [live, last]);

  const start = points[0];
  const end = points.length > 1 ? points[points.length - 1] : undefined;

  return (
    <View style={[styles.container, style]}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_DEFAULT}
        style={StyleSheet.absoluteFill}
        customMapStyle={DARK_MAP_STYLE}
        initialRegion={staticRegion}
        showsUserLocation={live}
        pitchEnabled={false}
        toolbarEnabled={false}
      >
        {segments.map((seg, i) => (
          <Polyline
            key={i}
            coordinates={seg}
            strokeColor={colors.accent}
            strokeWidth={4}
            lineCap="round"
            lineJoin="round"
          />
        ))}
        {start && !live && (
          <Marker
            coordinate={{ latitude: start.latitude, longitude: start.longitude }}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={[styles.dot, { backgroundColor: colors.text }]} />
          </Marker>
        )}
        {end && !live && (
          <Marker
            coordinate={{ latitude: end.latitude, longitude: end.longitude }}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={[styles.dot, { backgroundColor: colors.accent }]} />
          </Marker>
        )}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    borderRadius: radius.m,
    backgroundColor: colors.surfaceAlt,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.bg,
  },
});
