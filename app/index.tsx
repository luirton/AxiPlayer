import React, { useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { colors } from '../src/theme/colors';
import { storage } from '../src/services/storage';

export default function SplashScreen() {
  const router = useRouter();

  useEffect(() => {
    async function checkAuth() {
      try {
        const active = await storage.getActiveAccount();
        // Give a slight splash delay for smooth visual transition
        setTimeout(() => {
          if (active) {
            router.replace('/(tabs)');
          } else {
            router.replace('/login');
          }
        }, 1000);
      } catch (err) {
        router.replace('/login');
      }
    }
    checkAuth();
  }, [router]);

  return (
    <View style={styles.container}>
      <Image
        source={require('../assets/icon.png')}
        style={styles.logo}
        contentFit="contain"
      />
      <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    width: 220,
    height: 220,
  },
  loader: {
    marginTop: 28,
  },
});
