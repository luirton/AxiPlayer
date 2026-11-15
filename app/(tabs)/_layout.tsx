import React from 'react';
import { Tabs } from 'expo-router';
import { FloatingTabBar } from '../../src/components/navigation/FloatingTabBar';
import { colors } from '../../src/theme/colors';

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: 'transparent',
          position: 'absolute',
          borderTopWidth: 0,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Início' }} />
      <Tabs.Screen name="live" options={{ title: 'TV ao vivo' }} />
      <Tabs.Screen name="movies" options={{ title: 'Filmes' }} />
      <Tabs.Screen name="series" options={{ title: 'Séries' }} />
      <Tabs.Screen name="settings" options={{ title: 'Menu' }} />
    </Tabs>
  );
}
