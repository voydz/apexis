// Registers the background location task — must run at startup.
import './src/tracking/locationTask';

import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SettingsProvider } from './src/settings/SettingsContext';
import { AppNavigator } from './src/navigation';

export default function App() {
  return (
    <SafeAreaProvider>
      <SettingsProvider>
        <StatusBar style="light" />
        <AppNavigator />
      </SettingsProvider>
    </SafeAreaProvider>
  );
}
