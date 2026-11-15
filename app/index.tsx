import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { colors } from '../src/theme/colors';
import { storage } from '../src/services/storage';
import { requestInitialPermissions } from '../src/services/permissions';

export default function SplashScreen() {
  const router = useRouter();
  const [statusText, setStatusText] = useState('Iniciando...');

  useEffect(() => {
    let isMounted = true;

    async function initApp() {
      try {
        if (isMounted) setStatusText('Verificando permissões...');
        
        // Solicita nativamente as permissões de armazenamento e verifica conectividade de rede
        await requestInitialPermissions();

        if (isMounted) setStatusText('Carregando conta...');
        const active = await storage.getActiveAccount();

        setTimeout(() => {
          if (!isMounted) return;
          if (active) {
            router.replace('/(tabs)');
          } else {
            router.replace('/login');
          }
        }, 800);
      } catch (err) {
        console.warn('Erro na inicialização:', err);
        if (isMounted) router.replace('/login');
      }
    }

    initApp();

    return () => {
      isMounted = false;
    };
  }, [router]);

  return (
    <View style={styles.container}>
      <Image
        source={require('../assets/icon.png')}
        style={styles.logo}
        contentFit="contain"
      />
      <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />
      <Text style={styles.statusText}>{statusText}</Text>
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
  statusText: {
    marginTop: 16,
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '500',
  },
});
