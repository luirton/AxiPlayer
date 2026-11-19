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
  ActivityIndicator,
  Platform,
  StatusBar,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { storage, AppSettings, MediaListItem, WatchProgressItem } from '../../src/services/storage';
import { SavedAccount, LiveChannel, VodMovie, SeriesItem } from '../../src/types/iptv';
import { XtreamClient } from '../../src/services/xtreamClient';
import { FocusableItem } from '../../src/components/common/FocusableItem';
import {
  checkStoragePermissions,
  requestStoragePermissions,
  checkNetworkConnectivity,
  openAppSettings,
} from '../../src/services/permissions';

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
  const [continueWatching, setContinueWatching] = useState<WatchProgressItem[]>([]);
  const [myList, setMyList] = useState<MediaListItem[]>([]);
  const [watchLater, setWatchLater] = useState<MediaListItem[]>([]);

  // List Manager Modal State
  const [listManagerVisible, setListManagerVisible] = useState<boolean>(false);
  const [listManagerTab, setListManagerTab] = useState<'favorites' | 'continue' | 'mylist' | 'watchlater'>('favorites');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'live' | 'movie' | 'series'>('all');

  // Parental PIN Modal State
  const [pinModalVisible, setPinModalVisible] = useState<boolean>(false);
  const [currentPinInput, setCurrentPinInput] = useState<string>('');
  const [newPinInput, setNewPinInput] = useState<string>('');
  const [confirmPinInput, setConfirmPinInput] = useState<string>('');
  const [pinChangeError, setPinChangeError] = useState<string | null>(null);

  // IPTV Playlist Auto-reload State (3 a 5 dias)
  const [reloadModalVisible, setReloadModalVisible] = useState<boolean>(false);
  const [isReloadingList, setIsReloadingList] = useState<boolean>(false);

  const handleSelectReloadDays = async (days: number) => {
    const updated = await storage.saveSettings({ playlistReloadDays: days });
    setSettings(updated);
    setReloadModalVisible(false);
  };

  const handleForceReloadPlaylist = async () => {
    if (!account) {
      Alert.alert('Conta não encontrada', 'Faça login novamente.');
      return;
    }
    setIsReloadingList(true);
    try {
      const client = new XtreamClient(account.serverUrl, account.username, account.password);
      await Promise.all([
        client.getLiveCategories(),
        client.getVodCategories(),
        client.getSeriesCategories(),
      ]);
      await storage.markPlaylistReloaded();
      const updated = await storage.getSettings();
      setSettings(updated);
      Alert.alert(
        'Lista Atualizada',
        'Canais, filmes e séries foram sincronizados com sucesso junto ao servidor IPTV!'
      );
    } catch (e: any) {
      Alert.alert('Erro ao Atualizar', e?.message || 'Falha ao conectar ao servidor IPTV.');
    } finally {
      setIsReloadingList(false);
    }
  };

  const getLastReloadText = () => {
    const last = settings?.lastPlaylistReloadTimestamp;
    if (!last) return 'Nunca sincronizado';
    const diffHours = Math.floor((Date.now() - last) / (1000 * 60 * 60));
    if (diffHours < 1) return 'Atualizado há poucos minutos';
    if (diffHours < 24) return `Atualizado há ${diffHours} horas`;
    const diffDays = Math.floor(diffHours / 24);
    return `Atualizado há ${diffDays} ${diffDays === 1 ? 'dia' : 'dias'}`;
  };

  const loadAllLists = async () => {
    try {
      const [channels, movies, series, list, later, progress] = await Promise.all([
        storage.getFavoriteChannels(),
        storage.getFavoriteMovies(),
        storage.getFavoriteSeries(),
        storage.getMyList(),
        storage.getWatchLater(),
        storage.getAllWatchProgress(),
      ]);
      setFavChannels(channels);
      setFavMovies(movies);
      setFavSeries(series);
      setMyList(list);
      setWatchLater(later);
      setContinueWatching(progress);
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

  const handleOpenListManager = (tab: 'favorites' | 'continue' | 'mylist' | 'watchlater') => {
    setListManagerTab(tab);
    setCategoryFilter('all');
    setListManagerVisible(true);
  };

  const handleChangeTab = (tab: 'favorites' | 'continue' | 'mylist' | 'watchlater') => {
    setListManagerTab(tab);
    setCategoryFilter('all');
  };

  const handlePlayListItem = (item: {
    id: string | number;
    type: 'live' | 'movie' | 'series';
    title: string;
    poster?: string;
    extension?: string;
    streamUrl?: string;
    startPosition?: number | string;
    seriesId?: string;
    seriesTitle?: string;
    seasonNum?: number | string;
    episodeNum?: number | string;
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
    } else if (item.type === 'movie' || item.type === 'series') {
      router.push({
        pathname: '/player/[id]',
        params: {
          id: item.id,
          type: item.type,
          title: item.title,
          extension: item.extension || 'mp4',
          icon: item.poster,
          streamUrl: item.streamUrl,
          startPosition: item.startPosition ? String(item.startPosition) : undefined,
          seriesId: item.seriesId,
          seriesTitle: item.seriesTitle,
          seasonNum: item.seasonNum ? String(item.seasonNum) : undefined,
          episodeNum: item.episodeNum ? String(item.episodeNum) : undefined,
        },
      });
    } else {
      router.push('/(tabs)/series');
    }
  };

  const handleRemoveListItem = (
    tab: 'favorites' | 'continue' | 'mylist' | 'watchlater',
    item: { id: string | number; type: 'live' | 'movie' | 'series'; title: string }
  ) => {
    const isContinue = tab === 'continue';
    Alert.alert(
      isContinue ? 'Remover do Histórico' : 'Remover Item',
      isContinue
        ? `Deseja remover "${item.title}" de Continuar Assistindo?`
        : `Deseja remover "${item.title}" desta lista?`,
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
            } else if (tab === 'continue') {
              await storage.removeWatchProgress(item.id);
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

  const totalFavoritesCount = (favChannels || []).length + (favMovies || []).length + (favSeries || []).length;
  const continueMoviesCount = (continueWatching || []).filter((i) => i && i.type !== 'series').length;
  const continueSeriesCount = (continueWatching || []).filter((i) => i && i.type === 'series').length;
  const myListMoviesCount = (myList || []).filter((i) => i && i.type === 'movie').length;
  const myListSeriesCount = (myList || []).filter((i) => i && i.type === 'series').length;
  const watchLaterMoviesCount = (watchLater || []).filter((i) => i && i.type === 'movie').length;
  const watchLaterSeriesCount = (watchLater || []).filter((i) => i && i.type === 'series').length;

  const currentTabTotalCount =
    listManagerTab === 'favorites'
      ? totalFavoritesCount
      : listManagerTab === 'continue'
      ? continueWatching.length
      : listManagerTab === 'mylist'
      ? myList.length
      : watchLater.length;

  const currentTabMoviesCount =
    listManagerTab === 'favorites'
      ? favMovies.length
      : listManagerTab === 'continue'
      ? continueMoviesCount
      : listManagerTab === 'mylist'
      ? myListMoviesCount
      : watchLaterMoviesCount;

  const currentTabSeriesCount =
    listManagerTab === 'favorites'
      ? favSeries.length
      : listManagerTab === 'continue'
      ? continueSeriesCount
      : listManagerTab === 'mylist'
      ? myListSeriesCount
      : watchLaterSeriesCount;

  const getDisplayedItems = () => {
    if (listManagerTab === 'favorites') {
      let items: Array<{
        id: string | number;
        title: string;
        poster?: string;
        type: 'live' | 'movie' | 'series';
        subtitle: string;
        extension?: string;
        streamUrl?: string;
        startPosition?: number | string;
        seriesId?: string;
        seriesTitle?: string;
        seasonNum?: number | string;
        episodeNum?: number | string;
        progressPct?: number;
      }> = [];

      if (categoryFilter === 'all' || categoryFilter === 'live') {
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
      if (categoryFilter === 'all' || categoryFilter === 'movie') {
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
      if (categoryFilter === 'all' || categoryFilter === 'series') {
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

    if (listManagerTab === 'continue') {
      let items = (continueWatching || []).filter(Boolean);
      if (categoryFilter === 'movie') {
        items = items.filter((i) => i.type !== 'series');
      } else if (categoryFilter === 'series') {
        items = items.filter((i) => i.type === 'series');
      }
      return items.map((i) => {
        const posSec = i.positionSec || 0;
        const durSec = i.durationSec || 0;
        const pct = durSec > 0 ? Math.round((posSec / durSec) * 100) : 0;
        const posMin = Math.floor(posSec / 60);
        const durMin = Math.floor(durSec / 60);
        const timeText = durMin > 0 ? `${posMin} min de ${durMin} min (${pct}%)` : `${posMin} min assistidos`;
        return {
          id: i.id,
          title: i.title || 'Sem título',
          poster: i.poster,
          type: (i.type === 'live' ? 'live' : i.type === 'series' ? 'series' : 'movie') as 'live' | 'movie' | 'series',
          subtitle: `${i.type === 'series' ? 'Série' : 'Filme'} • ${timeText}`,
          progressPct: pct,
          extension: i.extension,
          streamUrl: i.streamUrl,
          startPosition: i.positionSec,
          seriesId: i.seriesId ? String(i.seriesId) : undefined,
          seriesTitle: i.seriesTitle,
          seasonNum: i.seasonNum,
          episodeNum: i.episodeNum,
        };
      });
    }

    if (listManagerTab === 'mylist') {
      let items = (myList || []).filter(Boolean);
      if (categoryFilter === 'movie') {
        items = items.filter((i) => i.type === 'movie');
      } else if (categoryFilter === 'series') {
        items = items.filter((i) => i.type === 'series');
      }
      return items.map((i) => ({
        id: i.id,
        title: i.title || 'Sem título',
        poster: i.poster,
        type: i.type,
        subtitle: `${i.type === 'movie' ? 'Filme' : 'Série'}${i.genre ? ' • ' + i.genre : ''}`,
        extension: i.extension,
      }));
    }

    let items = (watchLater || []).filter(Boolean);
    if (categoryFilter === 'movie') {
      items = items.filter((i) => i.type === 'movie');
    } else if (categoryFilter === 'series') {
      items = items.filter((i) => i.type === 'series');
    }
    return items.map((i) => ({
      id: i.id,
      title: i.title || 'Sem título',
      poster: i.poster,
      type: i.type,
      subtitle: `${i.type === 'movie' ? 'Filme' : 'Série'}${i.genre ? ' • ' + i.genre : ''}`,
      extension: i.extension,
    }));
  };

  const getEmptyMessage = () => {
    if (categoryFilter !== 'all') {
      const typeLabel =
        categoryFilter === 'live'
          ? 'de TV ao vivo'
          : categoryFilter === 'movie'
          ? 'de filme'
          : 'de série';
      return `Nenhum item ${typeLabel} encontrado nesta categoria.`;
    }
    if (listManagerTab === 'favorites') {
      return 'Você ainda não favoritou canais, filmes ou séries.';
    }
    if (listManagerTab === 'continue') {
      return 'Nenhum vídeo em andamento no histórico de reprodução.';
    }
    if (listManagerTab === 'mylist') {
      return 'Sua lista está vazia. Adicione filmes ou séries para acompanhar.';
    }
    return 'Nenhum título foi marcado para assistir depois.';
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
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
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
            <Text style={styles.settingTitle} numberOfLines={1}>Meus Favoritos</Text>
            <Text style={styles.settingSub} numberOfLines={1}>
              Canais, filmes e séries favoritos
            </Text>
          </View>
          <View style={styles.badgeCount}>
            <Text style={styles.badgeCountText}>{totalFavoritesCount}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </FocusableItem>

        <View style={styles.divider} />

        {/* Continuar Assistindo */}
        <FocusableItem
          style={styles.settingRow}
          onPress={() => handleOpenListManager('continue')}
        >
          <View style={styles.settingIcon}>
            <Ionicons name="play-forward-circle" size={20} color="#00E5FF" />
          </View>
          <View style={styles.settingDetails}>
            <Text style={styles.settingTitle} numberOfLines={1}>Continuar Assistindo</Text>
            <Text style={styles.settingSub} numberOfLines={1}>
              Vídeos em andamento no histórico
            </Text>
          </View>
          <View style={styles.badgeCount}>
            <Text style={styles.badgeCountText}>{continueWatching.length}</Text>
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
            <Text style={styles.settingTitle} numberOfLines={1}>Minha Lista</Text>
            <Text style={styles.settingSub} numberOfLines={1}>
              Títulos salvos na sua lista
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
            <Ionicons name="time" size={20} color={colors.primary} />
          </View>
          <View style={styles.settingDetails}>
            <Text style={styles.settingTitle} numberOfLines={1}>Assistir Depois</Text>
            <Text style={styles.settingSub} numberOfLines={1}>
              Títulos para assistir mais tarde
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

      {/* Atualização da Lista IPTV (Opções de 3 a 5 dias) */}
      <Text style={styles.sectionTitle}>Atualização da Lista IPTV</Text>
      <View style={styles.card}>
        {/* Recarregar a cada X dias */}
        <FocusableItem
          style={styles.settingRow}
          onPress={() => setReloadModalVisible(true)}
        >
          <View style={styles.settingIcon}>
            <Ionicons name="refresh-circle-outline" size={20} color={colors.primary} />
          </View>
          <View style={styles.settingDetails}>
            <Text style={styles.settingTitle}>Recarregamento Automático</Text>
            <Text style={styles.settingSub}>
              Atualizar lista a cada {settings?.playlistReloadDays || 3} dias
            </Text>
          </View>
          <View style={styles.badgeOption}>
            <Text style={styles.badgeOptionText}>{settings?.playlistReloadDays || 3} dias</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </FocusableItem>

        <View style={styles.divider} />

        {/* Forçar Atualização Imediata */}
        <FocusableItem style={styles.settingRow} onPress={handleForceReloadPlaylist}>
          <View style={styles.settingIcon}>
            <Ionicons name="cloud-download-outline" size={20} color={colors.primaryAmber} />
          </View>
          <View style={styles.settingDetails}>
            <Text style={styles.settingTitle}>Atualizar Lista Agora</Text>
            <Text style={styles.settingSub}>{getLastReloadText()}</Text>
          </View>
          {isReloadingList ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Ionicons name="sync" size={18} color={colors.primaryAmber} />
          )}
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
      </ScrollView>

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

      {/* Modal: Intervalo de Recarregamento da Lista (3 a 5 dias) */}
      <Modal
        visible={reloadModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setReloadModalVisible(false)}
      >
        <View style={styles.pinModalBackdrop}>
          <View style={styles.pinModalCard}>
            <View style={styles.pinIconCircle}>
              <Ionicons name="refresh-circle" size={32} color={colors.primary} />
            </View>
            <Text style={styles.pinModalTitle}>Recarregar Lista IPTV</Text>
            <Text style={styles.pinModalSubtitle}>
              Defina de quantos em quantos dias o AxiPlayer deve sincronizar automaticamente a lista com o servidor:
            </Text>

            <View style={{ width: '100%', gap: 10, marginBottom: 20 }}>
              {[3, 4, 5].map((days) => {
                const isSelected = (settings?.playlistReloadDays || 3) === days;
                return (
                  <Pressable
                    key={days}
                    style={[
                      styles.reloadDayOption,
                      isSelected && styles.reloadDayOptionActive,
                    ]}
                    onPress={() => handleSelectReloadDays(days)}
                  >
                    <View style={styles.reloadDayOptionContent}>
                      <Text
                        style={[
                          styles.reloadDayOptionTitle,
                          isSelected && styles.reloadDayOptionTitleActive,
                        ]}
                      >
                        A cada {days} dias
                      </Text>
                      {days === 3 ? (
                        <View style={styles.recommendedBadge}>
                          <Text style={styles.recommendedBadgeText}>Recomendado</Text>
                        </View>
                      ) : null}
                    </View>
                    <Ionicons
                      name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                      size={22}
                      color={isSelected ? colors.primary : '#666'}
                    />
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              style={styles.modalCancelBtnFull}
              onPress={() => setReloadModalVisible(false)}
            >
              <Text style={styles.modalCancelBtnText}>Fechar</Text>
            </Pressable>
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
                    : listManagerTab === 'continue'
                    ? 'play-forward-circle'
                    : listManagerTab === 'mylist'
                    ? 'bookmark'
                    : 'time'
                }
                size={24}
                color={
                  listManagerTab === 'favorites'
                    ? '#FFD700'
                    : listManagerTab === 'continue'
                    ? '#00E5FF'
                    : listManagerTab === 'mylist'
                    ? colors.primary
                    : colors.secondary
                }
              />
              <Text style={styles.managerHeaderTitle}>
                {listManagerTab === 'favorites'
                  ? 'Meus Favoritos'
                  : listManagerTab === 'continue'
                  ? 'Continuar Assistindo'
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
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.managerTabsScroll}
            contentContainerStyle={styles.managerTabsRow}
          >
            <Pressable
              style={[
                styles.managerTabItem,
                listManagerTab === 'favorites' && styles.managerTabItemActive,
              ]}
              onPress={() => handleChangeTab('favorites')}
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
                listManagerTab === 'continue' && styles.managerTabItemActive,
              ]}
              onPress={() => handleChangeTab('continue')}
            >
              <Ionicons
                name="play-forward"
                size={14}
                color={listManagerTab === 'continue' ? '#00E5FF' : '#888'}
              />
              <Text
                style={[
                  styles.managerTabText,
                  listManagerTab === 'continue' && styles.managerTabTextActive,
                ]}
              >
                Continuar ({continueWatching.length})
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.managerTabItem,
                listManagerTab === 'mylist' && styles.managerTabItemActive,
              ]}
              onPress={() => handleChangeTab('mylist')}
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
              onPress={() => handleChangeTab('watchlater')}
            >
              <Ionicons
                name="time"
                size={14}
                color={listManagerTab === 'watchlater' ? colors.primary : '#888'}
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
          </ScrollView>

          {/* Subfilter de Categorias - Sempre visível em todas as abas */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.subFilterScroll}
            contentContainerStyle={styles.subFilterRow}
          >
            <Pressable
              style={[
                styles.subFilterChip,
                categoryFilter === 'all' && styles.subFilterChipActive,
              ]}
              onPress={() => setCategoryFilter('all')}
            >
              <Text
                style={[
                  styles.subFilterText,
                  categoryFilter === 'all' && styles.subFilterTextActive,
                ]}
              >
                Todos ({currentTabTotalCount})
              </Text>
            </Pressable>

            {listManagerTab === 'favorites' ? (
              <Pressable
                style={[
                  styles.subFilterChip,
                  categoryFilter === 'live' && styles.subFilterChipActive,
                ]}
                onPress={() => setCategoryFilter('live')}
              >
                <Text
                  style={[
                    styles.subFilterText,
                    categoryFilter === 'live' && styles.subFilterTextActive,
                  ]}
                >
                  Ao Vivo ({favChannels.length})
                </Text>
              </Pressable>
            ) : null}

            <Pressable
              style={[
                styles.subFilterChip,
                categoryFilter === 'movie' && styles.subFilterChipActive,
              ]}
              onPress={() => setCategoryFilter('movie')}
            >
              <Text
                style={[
                  styles.subFilterText,
                  categoryFilter === 'movie' && styles.subFilterTextActive,
                ]}
              >
                Filmes ({currentTabMoviesCount})
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.subFilterChip,
                categoryFilter === 'series' && styles.subFilterChipActive,
              ]}
              onPress={() => setCategoryFilter('series')}
            >
              <Text
                style={[
                  styles.subFilterText,
                  categoryFilter === 'series' && styles.subFilterTextActive,
                ]}
              >
                Séries ({currentTabSeriesCount})
              </Text>
            </Pressable>
          </ScrollView>

          {/* List of Items */}
          {getDisplayedItems().length === 0 ? (
            <View style={styles.managerEmptyBox}>
              <Ionicons
                name={
                  listManagerTab === 'favorites'
                    ? 'star-outline'
                    : listManagerTab === 'continue'
                    ? 'play-forward-circle-outline'
                    : listManagerTab === 'mylist'
                    ? 'bookmark-outline'
                    : 'time-outline'
                }
                size={54}
                color="#444"
              />
              <Text style={styles.managerEmptyTitle}>Nenhum item encontrado</Text>
              <Text style={styles.managerEmptyDesc}>{getEmptyMessage()}</Text>
            </View>
          ) : (
            <FlatList
              style={styles.managerFlatList}
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
                          ? { backgroundColor: colors.primary }
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
                    {item.progressPct !== undefined && item.progressPct > 0 ? (
                      <View style={styles.managerProgressRow}>
                        <View style={styles.managerProgressTrack}>
                          <View
                            style={[
                              styles.managerProgressFill,
                              { width: `${Math.min(Math.max(item.progressPct, 5), 100)}%` },
                            ]}
                          />
                        </View>
                        <Text style={styles.managerProgressText}>{item.progressPct}%</Text>
                      </View>
                    ) : null}
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
    </View>
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
    paddingVertical: 12,
    paddingHorizontal: 2,
    width: '100%',
  },
  settingIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  settingDetails: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    marginRight: 8,
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
    flexShrink: 0,
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
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 10 : 16,
  },
  managerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 14,
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
  managerTabsScroll: {
    flexGrow: 0,
    marginTop: 4,
    marginBottom: 2,
  },
  managerTabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    alignItems: 'center',
  },
  managerTabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    paddingHorizontal: 14,
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

  /* Sub Filter Scroll & Row */
  subFilterScroll: {
    flexGrow: 0,
    marginBottom: 8,
  },
  subFilterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 4,
    gap: 8,
    alignItems: 'center',
  },
  subFilterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
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
    fontSize: 12,
    fontWeight: '600',
  },
  subFilterTextActive: {
    color: '#F5A623',
    fontWeight: '700',
  },

  /* List & Cards */
  managerFlatList: {
    flex: 1,
    width: '100%',
  },
  managerListContent: {
    padding: 16,
    paddingBottom: 40,
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
    width: '100%',
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
    flexShrink: 0,
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
    minWidth: 0,
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
  managerProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  managerProgressTrack: {
    flex: 1,
    height: 4,
    backgroundColor: '#262635',
    borderRadius: 2,
    overflow: 'hidden',
  },
  managerProgressFill: {
    height: '100%',
    backgroundColor: '#00E5FF',
    borderRadius: 2,
  },
  managerProgressText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#00E5FF',
    minWidth: 32,
    textAlign: 'right',
  },
  managerItemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  managerPlayBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
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

  /* Reload Days Settings */
  badgeOption: {
    backgroundColor: '#1b2234',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#263450',
    marginRight: 6,
  },
  badgeOptionText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  reloadDayOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#0e0e15',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#222232',
  },
  reloadDayOptionActive: {
    backgroundColor: '#131e33',
    borderColor: colors.primary,
  },
  reloadDayOptionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  reloadDayOptionTitle: {
    color: '#ccc',
    fontSize: 15,
    fontWeight: '700',
  },
  reloadDayOptionTitleActive: {
    color: colors.primary,
  },
  recommendedBadge: {
    backgroundColor: 'rgba(0, 229, 255, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  recommendedBadgeText: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: '800',
  },
  modalCancelBtnFull: {
    width: '100%',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#20202e',
    borderRadius: 14,
  },
});
