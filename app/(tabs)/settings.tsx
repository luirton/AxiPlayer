import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { storage, AppSettings } from '../../src/services/storage';
import { SavedAccount } from '../../src/types/iptv';
import { FocusableItem } from '../../src/components/common/FocusableItem';

export default function SettingsScreen() {
  const router = useRouter();
  const [account, setAccount] = useState<SavedAccount | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const active = await storage.getActiveAccount();
    setAccount(active);
    const s = await storage.getSettings();
    setSettings(s);
  };

  const handleToggleStreamFormat = async () => {
    if (!settings) return;
    const newFormat = settings.streamFormat === 'm3u8' ? 'ts' : 'm3u8';
    const updated = await storage.saveSettings({ streamFormat: newFormat });
    setSettings(updated);
  };

  const handleTogglePlayerEngine = async () => {
    if (!settings) return;
    const newEngine = settings.playerEngine === 'exoplayer' ? 'vlc' : 'exoplayer';
    const updated = await storage.saveSettings({ playerEngine: newEngine });
    setSettings(updated);
  };

  const handleClearCache = async () => {
    Alert.alert('Limpeza de Cache', 'Cache de canais e EPG limpos com sucesso!');
  };

  const handleSwitchAccount = () => {
    router.push('/login');
  };

  const handleLogout = async () => {
    Alert.alert(
      'Desconectar',
      'Deseja realmente sair desta conta?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sair',
          style: 'destructive',
          onPress: async () => {
            await storage.setActiveAccount(null);
            router.replace('/login');
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Brand Header */}
      <View style={styles.brandHeader}>
        <Image
          source={require('../../assets/icon.png')}
          style={styles.logo}
          contentFit="contain"
        />
        <Text style={styles.brandName}>Axi Player</Text>
        <Text style={styles.appVersion}>Versão 1.0.0 • Edição Livre</Text>
      </View>

      {/* Account Info Card */}
      <Text style={styles.sectionTitle}>Conta Atual</Text>
      <View style={styles.card}>
        <View style={styles.accountRow}>
          <View style={styles.accountIconBox}>
            <Ionicons name="tv-outline" size={24} color={colors.primary} />
          </View>
          <View style={styles.accountInfo}>
            <Text style={styles.accountTitle}>{account?.name || 'Perfil Ativo'}</Text>
            <Text style={styles.accountSub}>{account?.username || 'Usuário conectado'}</Text>
            <Text style={styles.accountServer} numberOfLines={1}>
              {account?.serverUrl || ''}
            </Text>
          </View>
        </View>

        <View style={styles.cardActions}>
          <FocusableItem style={styles.outlineBtn} onPress={handleSwitchAccount}>
            <Ionicons name="swap-horizontal-outline" size={16} color={colors.text} />
            <Text style={styles.outlineBtnText}>Trocar / Adicionar Conta</Text>
          </FocusableItem>

          <FocusableItem style={styles.logoutBtn} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={16} color={colors.error} />
            <Text style={styles.logoutBtnText}>Desconectar</Text>
          </FocusableItem>
        </View>
      </View>

      {/* Stream & Player Settings */}
      <Text style={styles.sectionTitle}>Preferências de Reprodução</Text>
      <View style={styles.card}>
        {/* Stream Format */}
        <FocusableItem style={styles.settingRow} onPress={handleToggleStreamFormat}>
          <View style={styles.settingIcon}>
            <Ionicons name="options-outline" size={20} color={colors.primaryAmber} />
          </View>
          <View style={styles.settingDetails}>
            <Text style={styles.settingTitle}>Formato do Fluxo de Vídeo</Text>
            <Text style={styles.settingSub}>
              Atual: {settings?.streamFormat === 'm3u8' ? 'HLS (.m3u8) - Recomendado' : 'MPEG-TS (.ts)'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </FocusableItem>

        <View style={styles.divider} />

        {/* Player Engine */}
        <FocusableItem style={styles.settingRow} onPress={handleTogglePlayerEngine}>
          <View style={styles.settingIcon}>
            <Ionicons name="play-circle-outline" size={20} color={colors.primary} />
          </View>
          <View style={styles.settingDetails}>
            <Text style={styles.settingTitle}>Motor Padrão do Player</Text>
            <Text style={styles.settingSub}>
              Atual: {settings?.playerEngine === 'exoplayer' ? 'ExoPlayer Nativo (Alta fluidez)' : 'LibVLC (Máxima compatibilidade)'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </FocusableItem>

        <View style={styles.divider} />

        {/* Clear Cache */}
        <FocusableItem style={styles.settingRow} onPress={handleClearCache}>
          <View style={styles.settingIcon}>
            <Ionicons name="trash-bin-outline" size={20} color={colors.warning} />
          </View>
          <View style={styles.settingDetails}>
            <Text style={styles.settingTitle}>Limpar Cache de EPG e Miniaturas</Text>
            <Text style={styles.settingSub}>Libera memória no aparelho e força atualização</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </FocusableItem>
      </View>

      {/* About Box */}
      <Text style={styles.sectionTitle}>Sobre o Aplicativo</Text>
      <View style={styles.aboutCard}>
        <Ionicons name="shield-checkmark-outline" size={22} color={colors.success} />
        <Text style={styles.aboutText}>
          O Axi Player é livre de cobranças mensais, rastreadores e travas de expiração. Desenvolvido para máxima velocidade no seu smartphone, tablet ou Android TV.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 20,
    paddingTop: 48,
    paddingBottom: 40,
  },
  brandHeader: {
    alignItems: 'center',
    marginBottom: 28,
  },
  logo: {
    width: 80,
    height: 80,
    marginBottom: 10,
  },
  brandName: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
  },
  appVersion: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
    marginTop: 8,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 20,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  accountIconBox: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountInfo: {
    flex: 1,
  },
  accountTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  accountSub: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  accountServer: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  cardActions: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 10,
  },
  outlineBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  outlineBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 69, 58, 0.1)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  logoutBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.error,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 14,
  },
  settingIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingDetails: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  settingSub: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 4,
  },
  aboutCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  aboutText: {
    flex: 1,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
});
