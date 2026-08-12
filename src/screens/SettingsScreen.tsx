import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Screen, Card, SectionTitle, SegmentedControl } from '../components/ui';
import { useSettings } from '../settings/SettingsContext';
import {
  healthStoreLabel,
  isHealthStoreAvailable,
  isHealthSyncSupported,
  requestHealthPermissions,
} from '../health';
import { colors, radius, spacing, typography } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function SettingsScreen() {
  const { settings, update } = useSettings();
  const navigation = useNavigation<Nav>();
  const [healthBusy, setHealthBusy] = useState(false);

  const weightLb = Math.round(settings.weightKg * 2.20462);
  const isMetric = settings.unit === 'metric';
  const storeLabel = healthStoreLabel();

  const adjustWeight = (deltaKg: number) => {
    const next = Math.min(200, Math.max(30, settings.weightKg + deltaKg));
    update({ weightKg: Math.round(next * 2) / 2, weightSetManually: true });
  };

  const toggleHealthSync = async (value: boolean) => {
    if (!value) {
      update({ syncToHealth: false });
      return;
    }
    setHealthBusy(true);
    try {
      if (!(await isHealthStoreAvailable())) {
        Alert.alert(
          `${storeLabel} unavailable`,
          `${storeLabel} is not available on this device.`
        );
        return;
      }
      const granted = await requestHealthPermissions();
      if (!granted) {
        Alert.alert(
          'Permission needed',
          `Apex could not get access to ${storeLabel}. You can grant it in system settings.`
        );
        return;
      }
      update({ syncToHealth: true });
    } finally {
      setHealthBusy(false);
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={typography.title}>Settings</Text>

        <SectionTitle>Units</SectionTitle>
        <Card>
          <SegmentedControl
            options={[
              { value: 'metric', label: 'Kilometers' },
              { value: 'imperial', label: 'Miles' },
            ]}
            value={settings.unit}
            onChange={(unit) => update({ unit })}
          />
        </Card>

        <SectionTitle>Tracking</SectionTitle>
        <Card>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Auto-pause</Text>
              <Text style={styles.rowSubtitle}>
                Pauses the clock automatically when you stop moving.
              </Text>
            </View>
            <Switch
              value={settings.autoPause}
              onValueChange={(autoPause) => update({ autoPause })}
              trackColor={{ true: colors.accent, false: colors.surfaceAlt }}
              thumbColor={colors.text}
            />
          </View>
        </Card>

        <SectionTitle>Body</SectionTitle>
        <Card>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Weight</Text>
              <Text style={styles.rowSubtitle}>Used to estimate calories burned.</Text>
            </View>
            <View style={styles.stepper}>
              <Pressable onPress={() => adjustWeight(-1)} style={styles.stepperButton} hitSlop={8}>
                <Text style={styles.stepperLabel}>−</Text>
              </Pressable>
              <Text style={styles.stepperValue}>
                {isMetric ? `${settings.weightKg} kg` : `${weightLb} lb`}
              </Text>
              <Pressable onPress={() => adjustWeight(1)} style={styles.stepperButton} hitSlop={8}>
                <Text style={styles.stepperLabel}>+</Text>
              </Pressable>
            </View>
          </View>
        </Card>

        {isHealthSyncSupported() && (
          <>
            <SectionTitle>{storeLabel}</SectionTitle>
            <Card>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>Sync with {storeLabel}</Text>
                  <Text style={styles.rowSubtitle}>
                    Saves finished runs to {storeLabel} and imports new runs from other apps
                    automatically.
                  </Text>
                </View>
                <Switch
                  value={settings.syncToHealth}
                  onValueChange={toggleHealthSync}
                  disabled={healthBusy}
                  trackColor={{ true: colors.accent, false: colors.surfaceAlt }}
                  thumbColor={colors.text}
                />
              </View>
              {settings.syncToHealth && (
                <Pressable
                  onPress={() => navigation.navigate('ImportHealth')}
                  style={styles.linkRow}
                  hitSlop={8}
                >
                  <Text style={styles.linkLabel}>Import past runs</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.accent} />
                </Pressable>
              )}
            </Card>
          </>
        )}

        <SectionTitle>About</SectionTitle>
        <Card>
          <Text style={styles.rowSubtitle}>
            Apex keeps every run on this device — no account, no cloud, no social feed.
            Heart-rate data requires a wearable and is not available from the phone alone.
          </Text>
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.m,
    paddingBottom: spacing.xxl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
  },
  rowTitle: {
    ...typography.body,
    fontWeight: '700',
  },
  rowSubtitle: {
    ...typography.caption,
    marginTop: 2,
    lineHeight: 18,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
  },
  stepperButton: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  stepperLabel: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    lineHeight: 22,
  },
  stepperValue: {
    ...typography.statMedium,
    fontSize: 16,
    minWidth: 64,
    textAlign: 'center',
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.m,
    paddingTop: spacing.m,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  linkLabel: {
    ...typography.body,
    color: colors.accent,
    fontWeight: '700',
  },
});
