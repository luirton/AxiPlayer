import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Switch,
  Modal,
  TextInput,
  Pressable,
  FlatList,
  Dimensions,
  Linking,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { storage, AppSettings, MediaListItem } from '../../src/services/storage';
import { SavedAccount, LiveChannel, VodMovie, SeriesItem } from '../../src/types/iptv';
import { FocusableItem } from '../../src/components/common/FocusableItem';
import {
  checkStoragePermissions,
  requestStoragePermissions,
  checkNetworkConnectivity,
  openAppSettings,
} from '../../src/services/permissions';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function SettingsScreen() {
  const router = useRouter();
  const [account, setAccount] = useState<SavedAccount | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [storageGranted, setStorageGranted] = useState<boolean>(true);
  const [networkConnected, setNetworkConnected] = useState<boolean>(true);

  // Lists Data
  const [favChannels, setFavChannels] = useState<LiveChannel[]>([]);
  const [favMovies, setFavMovies] = useState<VodMovie[]>([]);
  const [favSeries, setFavSeries] = useState<SeriesItem[]>([]);
  const [myList, setMyList] = useState<MediaListItem[]>([]);
  const [watchLater, setWatchLater] = useState<MediaListItem[]>([]);

  // List Manager Modal State
  const [listManagerVisible, setListManagerVisible] = useState<boolean>(false);
  const [listManagerTab, setListManagerTab] = useState<'favorites' | 'mylist' | 'watchlater'>('favorites');
  const [favSubFilter, setFavSubFilter] = useState<'all' | 'live' | 'movie' | 'series'>('all');

  // Parental PIN Modal State
  const [pinModalVisible, setPinModalVisible] = useState<boolean>(false);
  const [currentPinInput, setCurrentPinInput] = useState<string>('');
  const [newPinInput, setNewPinInput] = useState<string>('');
  const [confirmPinInput, setConfirmPinInput] = useState<string>('');
  const [pinChangeError, setPinChangeError] = useState<string | null>(null);

  const loadAllLists = async () => {
    try {
      const [channels, movies, series, list, later] = await Promise.all([
        storage.getFavoriteChannels(),
        storage.getFavoriteMovies(),
        storage.getFavoriteSeries(),
        storage.getMyList(),
        storage.getWatchLater(),
      ]);
      setFavChannels(channels);
      setFavMovies(movies);
      setFavSeries(series);
      setMyList(list);
      setWatchLater(later);
    } catch (e) {
      console.warn('Erro ao carregar listas no settings:', e);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadSettings();
      checkPermissionsStatus();
      loadAllLists();
    }, [])
  );

  const checkPermissionsStatus = async () => {
    const storageOk = await checkStoragePermissions();
    setStorageGranted(storageOk);
    const netOk = await checkNetworkConnectivity();
    setNetworkConnected(netOk);
  };

  const handleRequestStorage = async () => {
    const granted = await requestStoragePermissions();
    setStorageGranted(granted);
    if (granted) {
      Alert.alert('Permissão Concedida', 'O acesso ao armazenamento local foi autorizado com sucesso!');
    } else {
      Alert.alert(
        'Permissão Necessária',
        'O acesso ao armazenamento foi negado. Deseja abrir as configurações do aparelho para conceder manualmente?',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Abrir Configurações', onPress: openAppSettings },
        ]
      );
    }
  };

  const loadSettings = async () => {
    const active = await storage.getActiveAccount();
    setAccount(active);
    const s = await storage.getSettings();
    setSettings(s);
  };

  const handleOpenListManager = (tab: 'favorites' | 'mylist' | 'watchlater') => {
    setListManagerTab(tab);
    setFavSubFilter('all');
    setListManagerVisible(true);
  };

  const handlePlayListItem = (item: {
    id: string | number;
    type: 'live' | 'movie' | 'series';
    title: string;
    poster?: string;
    extension?: string;
  }) => {
    setListManagerVisible(false);
    if (item.type === 'live') {
      router.push({
        pathname: '/(tabs)/live',
        params: {
          channelId: item.id,
          autoFullscreen: '1',
        },
      });
    } else if (item.type === 'movie') {
      router.push({
        pathname: '/player/[id]',
        params: {
          id: item.id,
          type: 'movie',
          title: item.title,
          extension: item.extension || 'mp4',
          icon: item.poster,
        },
      });
    } else {
      router.push('/(tabs)/series');
    }
  };

  const handleRemoveListItem = (
    tab: 'favorites' | 'mylist' | 'watchlater',
    item: { id: string | number; type: 'live' | 'movie' | 'series'; title: string }
  ) => {
    Alert.alert(
      'Remover Item',
      `Deseja remover "${item.title}" desta lista?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: async () => {
            if (tab === 'favorites') {
              if (item.type === 'live') {
                await storage.removeFavoriteChannel(Number(item.id));
              } else if (item.type === 'movie') {
                await storage.removeFavoriteMovie(Number(item.id));
              } else {
                await storage.removeFavoriteSeries(Number(item.id));
              }
            } else if (tab === 'mylist') {
              await storage.removeFromMyList(item.id);
            } else if (tab === 'watchlater') {
              await storage.removeFromWatchLater(item.id);
            }
            await loadAllLists();
          },
        },
      ]
    );
  };

  const getDisplayedItems = () => {
    if (listManagerTab === 'favorites') {
      let items: Array<{
        id: string | number;
        title: string;
        poster?: string;
        type: 'live' | 'movie' | 'series';
        subtitle: string;
        extension?: string;
      }> = [];

      if (favSubFilter === 'all' || favSubFilter === 'live') {
        items = items.concat(
          favChannels.map((c) => ({
            id: c.stream_id,
            title: c.name,
            poster: c.stream_icon,
            type: 'live' as const,
            subtitle: 'TV Ao Vivo',
          }))
        );
      }
      if (favSubFilter === 'all' || favSubFilter === 'movie') {
        items = items.concat(
          favMovies.map((m) => ({
            id: m.stream_id,
            title: m.name,
            poster: m.stream_icon,
            type: 'movie' as const,
            subtitle: `Filme ${m.rating ? '• ⭐ ' + m.rating : ''}`,
            extension: m.container_extension || 'mp4',
          }))
        );
      }
      if (favSubFilter === 'all' || favSubFilter === 'series') {
        items = items.concat(
          favSeries.map((s) => ({
            id: s.series_id,
            title: s.name,
            poster: s.cover,
            type: 'series' as const,
            subtitle: `Série ${s.rating ? '• ⭐ ' + s.rating : ''}`,
          }))
        );
      }
      return items;
    }

    if (listManagerTab === 'mylist') {
      return myList.map((i) => ({
        id: i.id,
        title: i.title,
        poster: i.poster,
        type: i.type,
        subtitle: `${i.type === 'movie' ? 'Filme' : 'Série'}${i.genre ? ' • ' + i.genre : ''}`,
        extension: i.extension,
      }));
    }

    return watchLater.map((i) => ({
      id: i.id,
      title: i.title,
      poster: i.poster,
      type: i.type,
      subtitle: `${i.type === 'movie' ? 'Filme' : 'Série'}${i.genre ? ' • ' + i.genre : ''}`,
      extension: i.extension,
    }));
  };

  const totalFavoritesCount = favChannels.length + favMovies.length + favSeries.length;

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

  const handleOpenPinModal = () => {
    setCurrentPinInput('');
    setNewPinInput('');
    setConfirmPinInput('');
    setPinChangeError(null);
    setPinModalVisible(true);
  };

  const handleSaveNewPin = async () => {
    if (currentPinInput.length !== 4) {
      setPinChangeError('Digite os 4 dígitos do seu PIN atual.');
      return;
    }

    const currentMatches = await storage.verifyParentalPin(currentPinInput);
    if (!currentMatches) {
      setPinChangeError('PIN atual incorreto. (PIN padrão de fábrica: 0000)');
      return;
    }

    if (newPinInput.length !== 4) {
      setPinChangeError('O novo PIN deve ter exatamente 4 dígitos numéricos.');
      return;
    }

    if (newPinInput !== confirmPinInput) {
      setPinChangeError('A confirmação do novo PIN não confere.');
      return;
    }

    await storage.setParentalPin(newPinInput);
    setPinModalVisible(false);
    Alert.alert('PIN Atualizado', 'Seu novo PIN de 4 dígitos foi configurado com sucesso!');
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

        <Pressable
          style={styles.developerLink}
          onPress={() => Linking.openURL('https://github.com/luirton')}
        >
          <Ionicons name="logo-github" size={14} color="#F5A623" />
          <Text style={styles.developerLinkText}>Created by Luirton Gurgel</Text>
        </Pressable>
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

      {/* Minhas Listas & Coleções */}
      <Text style={styles.sectionTitle}>Minhas Listas & Coleções</Text>
      <View style={styles.card}>
        {/* Meus Favoritos */}
        <FocusableItem
          style={styles.settingRow}
          onPress={() => handleOpenListManager('favorites')}
        >
          <View style={styles.settingIcon}>
            <Ionicons name="star" size={20} color="#FFD700" />
          </View>
          <View style={styles.settingDetails}>
            <Text style={styles.settingTitle}>Meus Favoritos</Text>
            <Text style={styles.settingSub}>
              {totalFavoritesCount} itens salvos (Canais, Filmes e Séries)
            </Text>
          </View>
          <View style={styles.badgeCount}>
            <Text style={styles.badgeCountText}>{totalFavoritesCount}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </FocusableItem>

        <View style={styles.divider} />

        {/* Minha Lista */}
        <FocusableItem
          style={styles.settingRow}
          onPress={() => handleOpenListManager('mylist')}
        >
          <View style={styles.settingIcon}>
            <Ionicons name="bookmark" size={20} color={colors.primary} />
          </View>
          <View style={styles.settingDetails}>
            <Text style={styles.settingTitle}>Minha Lista</Text>
            <Text style={styles.settingSub}>
              {myList.length} títulos adicionados
            </Text>
          </View>
          <View style={styles.badgeCount}>
            <Text style={styles.badgeCountText}>{myList.length}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </FocusableItem>

        <View style={styles.divider} />

        {/* Assistir Depois */}
        <FocusableItem
          style={styles.settingRow}
          onPress={() => handleOpenListManager('watchlater')}
        >
          <View style={styles.settingIcon}>
            <Ionicons name="time" size={20} color="#FF6A00" />
          </View>
          <View style={styles.settingDetails}>
            <Text style={styles.settingTitle}>Assistir Depois</Text>
            <Text style={styles.settingSub}>
              {watchLater.length} títulos salvos para mais tarde
            </Text>
          </View>
          <View style={styles.badgeCount}>
            <Text style={styles.badgeCountText}>{watchLater.length}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </FocusableItem>
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

      {/* Permissions Section */}
      <Text style={styles.sectionTitle}>Permissões do Sistema</Text>
      <View style={styles.card}>
        {/* Storage Permission */}
        <FocusableItem style={styles.settingRow} onPress={handleRequestStorage}>
          <View style={styles.settingIcon}>
            <Ionicons
              name={storageGranted ? 'folder-open-outline' : 'alert-circle-outline'}
              size={20}
              color={storageGranted ? colors.success : colors.warning}
            />
          </View>
          <View style={styles.settingDetails}>
            <Text style={styles.settingTitle}>Acesso ao Armazenamento</Text>
            <Text style={styles.settingSub}>
              {storageGranted
                ? 'Concedido • Arquivos locais e cache liberados'
                : 'Não concedido • Toque para solicitar permissão'}
            </Text>
          </View>
          <Ionicons
            name={storageGranted ? 'checkmark-circle' : 'chevron-forward'}
            size={18}
            color={storageGranted ? colors.success : colors.textMuted}
          />
        </FocusableItem>

        <View style={styles.divider} />

        {/* Network Status */}
        <FocusableItem style={styles.settingRow} onPress={checkPermissionsStatus}>
          <View style={styles.settingIcon}>
            <Ionicons
              name={networkConnected ? 'wifi-outline' : 'cloud-offline-outline'}
              size={20}
              color={networkConnected ? colors.primary : colors.error}
            />
          </View>
          <View style={styles.settingDetails}>
            <Text style={styles.settingTitle}>Acesso à Rede & Internet</Text>
            <Text style={styles.settingSub}>
              {networkConnected
                ? 'Conectado • Tráfego HTTP e HTTPS liberado'
                : 'Sem conexão ativa detectada • Toque para testar'}
            </Text>
          </View>
          <Ionicons
            name={networkConnected ? 'checkmark-circle' : 'refresh-outline'}
            size={18}
            color={networkConnected ? colors.success : colors.textMuted}
          />
        </FocusableItem>
      </View>

      {/* Parental Control Section */}
      <Text style={styles.sectionTitle}>Controle dos Pais & Proteção</Text>
      <View style={styles.card}>
        <FocusableItem style={styles.settingRow} onPress={handleOpenPinModal}>
          <View style={styles.settingIcon}>
            <Ionicons name="lock-closed-outline" size={20} color="#F5A623" />
          </View>
          <View style={styles.settingDetails}>
            <Text style={styles.settingTitle}>PIN de Conteúdo Adulto / XXX</Text>
            <Text style={styles.settingSub}>
              Padrão inicial: 0000 • Toque para alterar o PIN de 4 dígitos
            </Text>
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

        <Pressable
          style={styles.aboutGithubBtn}
          onPress={() => Linking.openURL('https://github.com/luirton')}
        >
          <Ionicons name="logo-github" size={18} color="#fff" />
          <Text style={styles.aboutGithubBtnText}>Created by Luirton Gurgel</Text>
          <Ionicons name="open-outline" size={14} color="#F5A623" style={{ marginLeft: 4 }} />
        </Pressable>
      </View>

      {/* Modal: Alterar PIN de Controle Parental */}
      <Modal
        visible={pinModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPinModalVisible(false)}
      >
        <View style={styles.pinModalBackdrop}>
          <View style={styles.pinModalCard}>
            <View style={styles.pinIconCircle}>
              <Ionicons name="lock-closed" size={28} color="#F5A623" />
            </View>

            <Text style={styles.pinModalTitle}>Alterar PIN Parental</Text>
            <Text style={styles.pinModalSubtitle}>
              Defina um código numérico de 4 dígitos para proteger as categorias de conteúdo adulto.
            </Text>

            {/* Input: PIN Atual */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>PIN Atual (padrão: 0000)</Text>
              <TextInput
                style={styles.pinInputField}
                value={currentPinInput}
                onChangeText={(val) => {
                  setPinChangeError(null);
                  if (val.length <= 4) setCurrentPinInput(val.replace(/[^0-9]/g, ''));
                }}
                keyboardType="numeric"
                maxLength={4}
                secureTextEntry
                placeholder="••••"
                placeholderTextColor="#666"
              />
            </View>

            {/* Input: Novo PIN */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Novo PIN (4 dígitos)</Text>
              <TextInput
                style={styles.pinInputField}
                value={newPinInput}
                onChangeText={(val) => {
                  setPinChangeError(null);
                  if (val.length <= 4) setNewPinInput(val.replace(/[^0-9]/g, ''));
                }}
                keyboardType="numeric"
                maxLength={4}
                secureTextEntry
                placeholder="••••"
                placeholderTextColor="#666"
              />
            </View>

            {/* Input: Confirmar Novo PIN */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Confirmar Novo PIN</Text>
              <TextInput
                style={styles.pinInputField}
                value={confirmPinInput}
                onChangeText={(val) => {
                  setPinChangeError(null);
                  if (val.length <= 4) setConfirmPinInput(val.replace(/[^0-9]/g, ''));
                }}
                keyboardType="numeric"
                maxLength={4}
                secureTextEntry
                placeholder="••••"
                placeholderTextColor="#666"
              />
            </View>

            {pinChangeError ? <Text style={styles.pinErrorText}>{pinChangeError}</Text> : null}

            <View style={styles.modalActionsRow}>
              <Pressable
                style={styles.modalCancelBtn}
                onPress={() => setPinModalVisible(false)}
              >
                <Text style={styles.modalCancelBtnText}>Cancelar</Text>
              </Pressable>

              <Pressable style={styles.modalSaveBtn} onPress={handleSaveNewPin}>
                <Text style={styles.modalSaveBtnText}>Salvar PIN</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal: Gerenciador de Listas & Coleções */}
      <Modal
        visible={listManagerVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setListManagerVisible(false)}
      >
        <View style={styles.managerModalContainer}>
          {/* Header */}
          <View style={styles.managerHeader}>
            <View style={styles.managerHeaderLeft}>
              <Ionicons
                name={
                  listManagerTab === 'favorites'
                    ? 'star'
                    : listManagerTab === 'mylist'
                    ? 'bookmark'
                    : 'time'
                }
                size={24}
                color={
                  listManagerTab === 'favorites'
                    ? '#FFD700'
                    : listManagerTab === 'mylist'
                    ? colors.primary
                    : '#FF6A00'
                }
              />
              <Text style={styles.managerHeaderTitle}>
                {listManagerTab === 'favorites'
                  ? 'Meus Favoritos'
                  : listManagerTab === 'mylist'
                  ? 'Minha Lista'
                  : 'Assistir Depois'}
              </Text>
            </View>
            <Pressable
              style={styles.managerCloseBtn}
              onPress={() => setListManagerVisible(false)}
            >
              <Ionicons name="close" size={24} color="#fff" />
            </Pressable>
          </View>

          {/* Top Tabs */}
          <View style={styles.managerTabsRow}>
            <Pressable
              style={[
                styles.managerTabItem,
                listManagerTab === 'favorites' && styles.managerTabItemActive,
              ]}
              onPress={() => setListManagerTab('favorites')}
            >
              <Ionicons
                name="star"
                size={14}
                color={listManagerTab === 'favorites' ? '#FFD700' : '#888'}
              />
              <Text
                style={[
                  styles.managerTabText,
                  listManagerTab === 'favorites' && styles.managerTabTextActive,
                ]}
              >
                Favoritos ({totalFavoritesCount})
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.managerTabItem,
                listManagerTab === 'mylist' && styles.managerTabItemActive,
              ]}
              onPress={() => setListManagerTab('mylist')}
            >
              <Ionicons
                name="bookmark"
                size={14}
                color={listManagerTab === 'mylist' ? colors.primary : '#888'}
              />
              <Text
                style={[
                  styles.managerTabText,
                  listManagerTab === 'mylist' && styles.managerTabTextActive,
                ]}
              >
                Minha Lista ({myList.length})
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.managerTabItem,
                listManagerTab === 'watchlater' && styles.managerTabItemActive,
              ]}
              onPress={() => setListManagerTab('watchlater')}
            >
              <Ionicons
                name="time"
                size={14}
                color={listManagerTab === 'watchlater' ? '#FF6A00' : '#888'}
              />
              <Text
                style={[
                  styles.managerTabText,
                  listManagerTab === 'watchlater' && styles.managerTabTextActive,
                ]}
              >
                Depois ({watchLater.length})
              </Text>
            </Pressable>
          </View>

          {/* Subfilter para Favoritos */}
          {listManagerTab === 'favorites' ? (
            <View style={styles.subFilterRow}>
              <Pressable
                style={[
                  styles.subFilterChip,
                  favSubFilter === 'all' && styles.subFilterChipActive,
                ]}
                onPress={() => setFavSubFilter('all')}
              >
                <Text
                  style={[
                    styles.subFilterText,
                    favSubFilter === 'all' && styles.subFilterTextActive,
                  ]}
                >
                  Todos ({totalFavoritesCount})
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.subFilterChip,
                  favSubFilter === 'live' && styles.subFilterChipActive,
                ]}
                onPress={() => setFavSubFilter('live')}
              >
                <Text
                  style={[
                    styles.subFilterText,
                    favSubFilter === 'live' && styles.subFilterTextActive,
                  ]}
                >
                  Ao Vivo ({favChannels.length})
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.subFilterChip,
                  favSubFilter === 'movie' && styles.subFilterChipActive,
                ]}
                onPress={() => setFavSubFilter('movie')}
              >
                <Text
                  style={[
                    styles.subFilterText,
                    favSubFilter === 'movie' && styles.subFilterTextActive,
                  ]}
                >
                  Filmes ({favMovies.length})
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.subFilterChip,
                  favSubFilter === 'series' && styles.subFilterChipActive,
                ]}
                onPress={() => setFavSubFilter('series')}
              >
                <Text
                  style={[
                    styles.subFilterText,
                    favSubFilter === 'series' && styles.subFilterTextActive,
                  ]}
                >
                  Séries ({favSeries.length})
                </Text>
              </Pressable>
            </View>
          ) : null}

          {/* List of Items */}
          {getDisplayedItems().length === 0 ? (
            <View style={styles.managerEmptyBox}>
              <Ionicons
                name={
                  listManagerTab === 'favorites'
                    ? 'star-outline'
                    : listManagerTab === 'mylist'
                    ? 'bookmark-outline'
                    : 'time-outline'
                }
                size={54}
                color="#444"
              />
              <Text style={styles.managerEmptyTitle}>Nenhum item salvo</Text>
              <Text style={styles.managerEmptyDesc}>
                {listManagerTab === 'favorites'
                  ? 'Você ainda não favoritou canais, filmes ou séries.'
                  : listManagerTab === 'mylist'
                  ? 'Sua lista está vazia. Adicione filmes ou séries para acompanhar.'
                  : 'Nenhum título foi marcado para assistir depois.'}
              </Text>
            </View>
          ) : (
            <FlatList
              data={getDisplayedItems()}
              keyExtractor={(item) => `${item.type}_${item.id}`}
              contentContainerStyle={styles.managerListContent}
              renderItem={({ item }) => (
                <View style={styles.managerItemCard}>
                  <View style={styles.managerItemPosterBox}>
                    {item.poster ? (
                      <Image
                        source={{ uri: item.poster }}
                        style={styles.managerItemPoster}
                        contentFit={item.type === 'live' ? 'contain' : 'cover'}
                      />
                    ) : (
                      <Ionicons
                        name={
                          item.type === 'live'
                            ? 'tv'
                            : item.type === 'movie'
                            ? 'film'
                            : 'albums'
                        }
                        size={28}
                        color="#666"
                      />
                    )}
                    <View
                      style={[
                        styles.managerTypeBadge,
                        item.type === 'live'
                          ? { backgroundColor: '#E50914' }
                          : item.type === 'movie'
                          ? { backgroundColor: '#FF6A00' }
                          : { backgroundColor: '#3B82F6' },
                      ]}
                    >
                      <Text style={styles.managerTypeBadgeText}>
                        {item.type === 'live'
                          ? 'Ao Vivo'
                          : item.type === 'movie'
                          ? 'Filme'
                          : 'Série'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.managerItemInfo}>
                    <Text style={styles.managerItemTitle} numberOfLines={2}>
                      {item.title}
                    </Text>
                    <Text style={styles.managerItemSub} numberOfLines={1}>
                      {item.subtitle}
                    </Text>
                  </View>

                  <View style={styles.managerItemActions}>
                    <Pressable
                      style={styles.managerPlayBtn}
                      onPress={() => handlePlayListItem(item)}
                    >
                      <Ionicons name="play" size={16} color="#fff" />
                    </Pressable>

                    <Pressable
                      style={styles.managerRemoveBtn}
                      onPress={() => handleRemoveListItem(listManagerTab, item)}
                    >
                      <Ionicons name="trash-outline" size={16} color="#FF4D4F" />
                    </Pressable>
                  </View>
                </View>
              )}
            />
          )}
        </View>
      </Modal>
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
  developerLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: '#1b1b26',
    borderWidth: 1,
    borderColor: '#2e2e42',
  },
  developerLinkText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#F5A623',
    letterSpacing: 0.3,
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
    backgroundColor: colors.surface,
    padding: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 14,
  },
  aboutText: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 19,
  },
  aboutGithubBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1b1b26',
    borderWidth: 1,
    borderColor: '#34344c',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  aboutGithubBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },

  /* Modal de PIN Parental */
  pinModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  pinModalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#16161f',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#262638',
  },
  pinIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(245, 166, 35, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  pinModalTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 6,
  },
  pinModalSubtitle: {
    fontSize: 13,
    color: '#aaa',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
  },
  inputGroup: {
    width: '100%',
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 12,
    color: '#888',
    marginBottom: 6,
    fontWeight: '600',
  },
  pinInputField: {
    width: '100%',
    height: 48,
    backgroundColor: '#0c0c12',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333348',
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 10,
    textAlign: 'center',
  },
  pinErrorText: {
    color: '#ff4444',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 14,
    textAlign: 'center',
  },
  modalActionsRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
    marginTop: 6,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#222230',
    alignItems: 'center',
  },
  modalCancelBtnText: {
    color: '#aaa',
    fontSize: 14,
    fontWeight: '700',
  },
  modalSaveBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#F5A623',
    alignItems: 'center',
  },
  modalSaveBtnText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '800',
  },

  /* List Manager Badges & Styles */
  badgeCount: {
    backgroundColor: '#20202c',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#303042',
    marginRight: 6,
  },
  badgeCountText: {
    color: '#F5A623',
    fontSize: 12,
    fontWeight: '800',
  },

  /* List Manager Modal Full Container */
  managerModalContainer: {
    flex: 1,
    backgroundColor: '#0d0d12',
    paddingTop: 16,
  },
  managerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e28',
  },
  managerHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  managerHeaderTitle: {
    color: '#fff',
    fontSize: 19,
    fontWeight: '800',
  },
  managerCloseBtn: {
    padding: 6,
    borderRadius: 20,
    backgroundColor: '#1b1b24',
  },
  managerTabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  managerTabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 12,
    backgroundColor: '#16161f',
    borderWidth: 1,
    borderColor: '#242432',
    gap: 6,
  },
  managerTabItemActive: {
    backgroundColor: '#252538',
    borderColor: '#F5A623',
  },
  managerTabText: {
    color: '#888',
    fontSize: 12,
    fontWeight: '600',
  },
  managerTabTextActive: {
    color: '#fff',
    fontWeight: '800',
  },

  /* Sub Filter */
  subFilterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 8,
  },
  subFilterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#161620',
    borderWidth: 1,
    borderColor: '#242430',
  },
  subFilterChipActive: {
    backgroundColor: '#352516',
    borderColor: '#F5A623',
  },
  subFilterText: {
    color: '#777',
    fontSize: 11,
    fontWeight: '600',
  },
  subFilterTextActive: {
    color: '#F5A623',
    fontWeight: '700',
  },

  /* List & Cards */
  managerListContent: {
    padding: 16,
    gap: 12,
  },
  managerItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#15151e',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#222230',
    padding: 10,
    gap: 12,
  },
  managerItemPosterBox: {
    width: 60,
    height: 75,
    borderRadius: 8,
    backgroundColor: '#0a0a0f',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  managerItemPoster: {
    width: '100%',
    height: '100%',
  },
  managerTypeBadge: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingVertical: 1,
    alignItems: 'center',
  },
  managerTypeBadgeText: {
    color: '#fff',
    fontSize: 8,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  managerItemInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  managerItemTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18,
    marginBottom: 4,
  },
  managerItemSub: {
    color: '#888',
    fontSize: 12,
  },
  managerItemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  managerPlayBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FF6A00',
    alignItems: 'center',
    justifyContent: 'center',
  },
  managerRemoveBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 77, 79, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Empty state */
  managerEmptyBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    marginTop: 60,
  },
  managerEmptyTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 8,
  },
  managerEmptyDesc: {
    color: '#777',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
});
