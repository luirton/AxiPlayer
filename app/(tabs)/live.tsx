import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Pressable,
  Dimensions,
  useWindowDimensions,
  ScrollView,
  Platform,
  PanResponder,
  Modal,
  Alert,
  FlatList,
  RefreshControl,
  StatusBar as RNStatusBar,
} from 'react-native';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView, VideoSource } from 'expo-video';
import * as NavigationBar from 'expo-navigation-bar';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../../src/theme/colors';
import { storage } from '../../src/services/storage';
import { XtreamClient } from '../../src/services/xtreamClient';
import { IptvCategory, LiveChannel, EpgProgram, SavedAccount } from '../../src/types/iptv';
import { FocusableItem } from '../../src/components/common/FocusableItem';
import { uiState } from '../../src/services/uiState';
import { isAdultCategory } from '../../src/services/parentalControl';

const FAVORITES_CAT_ID = 'favorites_category';

export default function LiveScreen() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const params = useLocalSearchParams<{ channelId?: string; autoFullscreen?: string }>();
  const [categories, setCategories] = useState<IptvCategory[]>([]);
  const [channelsByCategory, setChannelsByCategory] = useState<Record<string, LiveChannel[]>>({});
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [drawerCategory, setDrawerCategory] = useState<string | null>(null);
  const [activeChannel, setActiveChannel] = useState<LiveChannel | null>(null);
  const [streamUrl, setStreamUrl] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [allChannels, setAllChannels] = useState<LiveChannel[]>([]);
  const [isSearchingChannels, setIsSearchingChannels] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [loadingCategory, setLoadingCategory] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<number[]>([]);
  const [favoriteChannelsList, setFavoriteChannelsList] = useState<LiveChannel[]>([]);
  const [account, setAccount] = useState<SavedAccount | null>(null);

  // Parental Control (PIN de 4 dígitos para categorias e canais Adulto / XXX - Sempre pede PIN)
  const [pinModalVisible, setPinModalVisible] = useState<boolean>(false);
  const [targetAdultCategory, setTargetAdultCategory] = useState<IptvCategory | null>(null);
  const [targetAdultChannel, setTargetAdultChannel] = useState<LiveChannel | null>(null);
  const [enteredPin, setEnteredPin] = useState<string>('');
  const [pinError, setPinError] = useState<string | null>(null);

  // Fullscreen In-Place Resizing State
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [controlsVisible, setControlsVisible] = useState<boolean>(true);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [aspectRatio, setAspectRatio] = useState<'contain' | 'cover' | 'fill'>('contain');

  // Quick Channels Drawer in Fullscreen
  const [channelDrawerOpen, setChannelDrawerOpen] = useState<boolean>(false);

  // EPG Programação Modal in Fullscreen
  const [epgModalOpen, setEpgModalOpen] = useState<boolean>(false);
  const [epgList, setEpgList] = useState<EpgProgram[]>([]);
  const [currentProgramName, setCurrentProgramName] = useState<string>('Ao vivo · Transmissão em Alta Definição');

  // Gestures: Brightness & Volume
  const [brightness, setBrightness] = useState<number>(1.0); // 0.15 to 1.0
  const [volume, setVolume] = useState<number>(1.0); // 0.0 to 1.0
  const [gestureIndicator, setGestureIndicator] = useState<{
    type: 'brightness' | 'volume';
    value: number;
    visible: boolean;
  }>({ type: 'volume', value: 1.0, visible: false });

  const currentBrightnessRef = useRef(brightness);
  const currentVolumeRef = useRef(volume);
  const gestureStartXRef = useRef(0);
  const gestureStartYValueRef = useRef(0);
  const isDraggingRef = useRef(false);

  currentBrightnessRef.current = brightness;
  currentVolumeRef.current = volume;

  const controlsTimeoutRef = useRef<any>(null);
  const gestureHideTimeoutRef = useRef<any>(null);

  // Format fallback and error recovery refs
  const currentLiveFormatRef = useRef<'m3u8' | 'ts'>('m3u8');
  const liveFallbackAttemptedRef = useRef<boolean>(false);

  // Video Player instance (initialized with null to prevent ExoPlayer empty URI errors)
  const miniPlayer = useVideoPlayer(null, (player) => {
    player.loop = false;
    player.play();
  });

  // Keep track of playing state and automatic format fallback
  useEffect(() => {
    if (!miniPlayer) return;
    const subscription = miniPlayer.addListener('playingChange', (event) => {
      setIsPlaying(event.isPlaying);
    });
    const statusSub = miniPlayer.addListener('statusChange', (event) => {
      if (event.status === 'error' && activeChannel && !liveFallbackAttemptedRef.current) {
        liveFallbackAttemptedRef.current = true;
        const currentFmt = currentLiveFormatRef.current;
        const fallbackFmt = currentFmt === 'm3u8' ? 'ts' : 'm3u8';
        currentLiveFormatRef.current = fallbackFmt;
        if (account) {
          const client = new XtreamClient(account.serverUrl, account.username, account.password);
          const fallbackUrl = client.getLiveStreamUrl(activeChannel.stream_id, fallbackFmt);
          setStreamUrl(fallbackUrl);
        }
      }
    });
    return () => {
      subscription.remove();
      statusSub.remove();
    };
  }, [miniPlayer, activeChannel, account]);

  // Whenever streamUrl changes, replace source in player with IPTV Smarters headers
  useEffect(() => {
    if (miniPlayer && streamUrl) {
      try {
        const source: VideoSource = {
          uri: streamUrl,
          headers: {
            'User-Agent': 'IPTVSmartersPro/1.0.0 (Linux; Android; Mobile; Exoplayer)',
            'Accept': '*/*',
          },
        };
        miniPlayer.replace(source);
        miniPlayer.play();
      } catch (err) {
        console.warn('Error replacing player stream:', err);
      }
    }
  }, [streamUrl, miniPlayer]);

  // Pause stream when user navigates away from this tab (e.g. to Movies or Settings)
  useFocusEffect(
    useCallback(() => {
      return () => {
        // Leaving live tab
        uiState.setFullscreen(false);
        RNStatusBar.setHidden(false, 'none');
        if (miniPlayer) {
          try {
            miniPlayer.pause();
          } catch (e) {}
        }
        if (Platform.OS === 'android') {
          try {
            NavigationBar.setVisibilityAsync('visible');
            NavigationBar.setStyle('light');
          } catch (e) {}
        }
      };
    }, [miniPlayer])
  );

  useEffect(() => {
    initLive();
  }, []);

  useEffect(() => {
    if (params.channelId && account) {
      handleDirectChannelParam(Number(params.channelId));
    }
  }, [params.channelId, account]);

  useEffect(() => {
    if (searchQuery.trim().length > 0 && allChannels.length === 0 && account) {
      setIsSearchingChannels(true);
      const client = new XtreamClient(account.serverUrl, account.username, account.password);
      client.getLiveStreams()
        .then((chs) => {
          if (Array.isArray(chs)) setAllChannels(chs);
        })
        .catch((e) => console.warn('Erro ao carregar canais para busca:', e))
        .finally(() => setIsSearchingChannels(false));
    }
  }, [searchQuery, allChannels, account]);

  const handleDirectChannelParam = async (channelId: number) => {
    if (!account) return;
    try {
      const client = new XtreamClient(account.serverUrl, account.username, account.password);
      const chs = await client.getLiveStreams();
      const found = chs?.find((c) => Number(c.stream_id) === channelId);
      if (found) {
        selectChannelForPlayer(found, account, found.category_id);
        if (params.autoFullscreen === '1') {
          handleOpenFullscreen();
        }
      }
    } catch (e) {}
  };

  const initLive = async (isRefresh: boolean = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setErrorMessage(null);

    try {
      const active = await storage.getActiveAccount();
      if (!active) {
        router.replace('/login');
        return;
      }
      setAccount(active);
      const favs = await storage.getFavorites();
      setFavorites(favs || []);
      const favChs = await storage.getFavoriteChannels();
      setFavoriteChannelsList(favChs || []);

      const client = new XtreamClient(active.serverUrl, active.username, active.password);
      const rawCats = await client.getLiveCategories();
      const cats = rawCats || [];

      // Se houver canais favoritados, injeta a categoria virtual no topo
      let finalCats = [...cats];
      if (favChs && favChs.length > 0) {
        finalCats = [
          { category_id: FAVORITES_CAT_ID, category_name: '⭐ Canais Favoritos' },
          ...cats,
        ];
      }
      setCategories(finalCats);

      // Carrega canais em background para busca instantânea por canais
      client.getLiveStreams().then((allChs) => {
        if (Array.isArray(allChs)) setAllChannels(allChs);
      }).catch(() => {});

      // Preload channels (NUNCA carrega canal ou categoria adulta automaticamente)
      if (favChs && favChs.length > 0) {
        setOpenCategory(FAVORITES_CAT_ID);
        setActiveCategory(FAVORITES_CAT_ID);
        setDrawerCategory(FAVORITES_CAT_ID);
        setChannelsByCategory({ [FAVORITES_CAT_ID]: favChs });
        const safeFav = favChs.find((c) => !isAdultCategory(c.name));
        if (safeFav) {
          selectChannelForPlayer(safeFav, active, FAVORITES_CAT_ID);
        }
      } else if (cats.length > 0) {
        const safeCats = cats.filter((c) => !isAdultCategory(c.category_name));
        const firstSafeCat = safeCats.length > 0 ? safeCats[0] : null;

        if (firstSafeCat) {
          const firstCatId = firstSafeCat.category_id;
          setOpenCategory(firstCatId);
          setActiveCategory(firstCatId);
          setDrawerCategory(firstCatId);
          const chs = await client.getLiveStreams(firstCatId);
          setChannelsByCategory({ [firstCatId]: chs || [] });
          const safeCh = chs?.find((c) => !isAdultCategory(c.name));
          if (safeCh) {
            selectChannelForPlayer(safeCh, active, firstCatId);
          }
        }
      } else {
        setErrorMessage('Nenhuma categoria de canais foi retornada pelo servidor IPTV.');
      }
    } catch (err: any) {
      console.warn('Error loading live screen:', err);
      setErrorMessage(err?.message || 'Falha ao conectar com o servidor IPTV.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const ensureCategoryLoaded = async (catId: string, acc?: SavedAccount) => {
    if (!catId) return;
    if (catId === FAVORITES_CAT_ID) {
      if (!channelsByCategory[FAVORITES_CAT_ID] || channelsByCategory[FAVORITES_CAT_ID].length === 0) {
        const favChs = await storage.getFavoriteChannels();
        setFavoriteChannelsList(favChs);
        setChannelsByCategory((prev) => ({ ...prev, [FAVORITES_CAT_ID]: favChs }));
      }
      return;
    }

    if (!channelsByCategory[catId]) {
      const targetAcc = acc || account;
      if (!targetAcc) return;
      setLoadingCategory(true);
      try {
        const client = new XtreamClient(targetAcc.serverUrl, targetAcc.username, targetAcc.password);
        const chs = await client.getLiveStreams(catId);
        setChannelsByCategory((prev) => ({ ...prev, [catId]: chs || [] }));
      } catch (err) {
        console.warn('Erro ao carregar canais da categoria:', err);
      } finally {
        setLoadingCategory(false);
      }
    }
  };

  const selectChannelForPlayer = async (ch: LiveChannel, acc?: SavedAccount, categoryId?: string) => {
    liveFallbackAttemptedRef.current = false;
    setActiveChannel(ch);
    const targetAccount = acc || account;

    const targetCatId = categoryId || ch.category_id || activeCategory || openCategory;
    if (targetCatId) {
      setActiveCategory(targetCatId);
      setDrawerCategory(targetCatId);
      ensureCategoryLoaded(targetCatId, targetAccount || undefined);
    }

    if (!targetAccount) return;

    try {
      const settings = await storage.getSettings();
      const format = settings.streamFormat || 'm3u8';
      currentLiveFormatRef.current = format;
      const client = new XtreamClient(targetAccount.serverUrl, targetAccount.username, targetAccount.password);
      const url = client.getLiveStreamUrl(ch.stream_id, format);
      setStreamUrl(url);

      // Load EPG for channel
      loadEpg(ch.stream_id, client);
    } catch (e) {
      console.warn('Error selecting channel:', e);
    }
  };

  const loadEpg = async (streamId: number, clientInstance: XtreamClient) => {
    try {
      const listings = await clientInstance.getShortEpg(streamId);
      setEpgList(listings || []);
      if (listings && listings.length > 0 && listings[0].title) {
        setCurrentProgramName(`Ao vivo · ${listings[0].title}`);
      } else {
        setCurrentProgramName('Ao vivo · Transmissão em Alta Definição');
      }
    } catch (e) {
      setCurrentProgramName('Ao vivo · Transmissão em Alta Definição');
    }
  };

  const handleToggleCategory = async (catId: string, categoryItem?: IptvCategory) => {
    if (openCategory === catId) {
      setOpenCategory(null);
      return;
    }

    // Verificação de Controle Parental (Categorias Adulto / XXX)
    // SEMPRE que clicar na categoria, exige o PIN (não mantém liberado)!
    if (categoryItem && isAdultCategory(categoryItem.category_name)) {
      setTargetAdultCategory(categoryItem);
      setTargetAdultChannel(null);
      setEnteredPin('');
      setPinError(null);
      setPinModalVisible(true);
      return;
    }

    openVerifiedCategory(catId);
  };

  const openVerifiedCategory = async (catId: string) => {
    setOpenCategory(catId);
    setActiveCategory(catId);
    setDrawerCategory(catId);
    ensureCategoryLoaded(catId);
  };

  const handleConfirmPin = async () => {
    if (enteredPin.trim().length !== 4) {
      setPinError('Digite o PIN de 4 dígitos.');
      return;
    }

    const isValid = await storage.verifyParentalPin(enteredPin);
    if (isValid) {
      setPinModalVisible(false);
      setEnteredPin('');
      setPinError(null);

      if (targetAdultCategory) {
        const catId = targetAdultCategory.category_id;
        setTargetAdultCategory(null);
        openVerifiedCategory(catId);
      } else if (targetAdultChannel) {
        const ch = targetAdultChannel;
        setTargetAdultChannel(null);
        selectChannelForPlayer(ch);
        handleOpenFullscreen();
      }
    } else {
      setPinError('PIN incorreto. O PIN padrão é 0000.');
    }
  };

  const handleToggleFavorite = async (channelOrId: LiveChannel | number) => {
    let targetChannel: LiveChannel | null = null;

    if (typeof channelOrId === 'object') {
      targetChannel = channelOrId;
    } else {
      // Procura o canal nas listas já carregadas
      if (activeChannel && activeChannel.stream_id === channelOrId) {
        targetChannel = activeChannel;
      } else {
        for (const catChs of Object.values(channelsByCategory)) {
          const found = catChs.find((c) => c.stream_id === channelOrId);
          if (found) {
            targetChannel = found;
            break;
          }
        }
      }
    }

    if (!targetChannel) {
      // Se não encontrou o objeto completo, faz o toggle simples de ID
      const streamId = typeof channelOrId === 'number' ? channelOrId : (channelOrId as any).stream_id;
      const updatedFavs = await storage.toggleFavorite(streamId);
      setFavorites(updatedFavs);
      return;
    }

    const isFavNow = await storage.toggleFavoriteChannel(targetChannel);
    const updatedFavChs = await storage.getFavoriteChannels();
    setFavoriteChannelsList(updatedFavChs);
    setFavorites(updatedFavChs.map((c) => c.stream_id));

    // Atualiza o conteúdo da categoria de favoritos
    setChannelsByCategory((prev) => ({ ...prev, [FAVORITES_CAT_ID]: updatedFavChs }));

    // Garante que a categoria "⭐ Canais Favoritos" apareça no topo se houver itens
    setCategories((prev) => {
      const exists = prev.some((c) => c.category_id === FAVORITES_CAT_ID);
      if (updatedFavChs.length > 0 && !exists) {
        return [{ category_id: FAVORITES_CAT_ID, category_name: '⭐ Canais Favoritos' }, ...prev];
      } else if (updatedFavChs.length === 0 && exists) {
        return prev.filter((c) => c.category_id !== FAVORITES_CAT_ID);
      }
      return prev;
    });
  };

  // Channel Switching (|◀ and ▶|) - Confinado à categoria do canal atualmente em reprodução
  const activeCatId = activeCategory || openCategory || categories[0]?.category_id;
  const currentChannelsList = useMemo(() => {
    if (!activeCatId) return [];
    if (activeCatId === FAVORITES_CAT_ID) return favoriteChannelsList;
    return channelsByCategory[activeCatId] || [];
  }, [activeCatId, favoriteChannelsList, channelsByCategory]);

  // Grade de Canais (Drawer em tela cheia)
  const drawerChannelsList = useMemo(() => {
    const targetCat = drawerCategory || activeCategory || openCategory;
    if (!targetCat) return [];
    if (targetCat === FAVORITES_CAT_ID) return favoriteChannelsList;
    return channelsByCategory[targetCat] || [];
  }, [drawerCategory, activeCategory, openCategory, favoriteChannelsList, channelsByCategory]);

  const handleNextChannel = () => {
    if (currentChannelsList.length === 0 || !activeChannel) return;
    let currentIndex = currentChannelsList.findIndex(
      (c) => Number(c.stream_id) === Number(activeChannel.stream_id)
    );
    if (currentIndex === -1) currentIndex = 0;
    const nextIndex = (currentIndex + 1) % currentChannelsList.length;
    const nextChannel = currentChannelsList[nextIndex];
    if (nextChannel) {
      selectChannelForPlayer(nextChannel, undefined, activeCatId);
    }
    resetControlsTimer();
  };

  const handlePrevChannel = () => {
    if (currentChannelsList.length === 0 || !activeChannel) return;
    let currentIndex = currentChannelsList.findIndex(
      (c) => Number(c.stream_id) === Number(activeChannel.stream_id)
    );
    if (currentIndex === -1) currentIndex = 0;
    const prevIndex = (currentIndex - 1 + currentChannelsList.length) % currentChannelsList.length;
    const prevChannel = currentChannelsList[prevIndex];
    if (prevChannel) {
      selectChannelForPlayer(prevChannel, undefined, activeCatId);
    }
    resetControlsTimer();
  };

  const togglePlayPause = () => {
    if (!miniPlayer) return;
    if (isPlaying) {
      miniPlayer.pause();
    } else {
      miniPlayer.play();
    }
    resetControlsTimer();
  };

  // Fullscreen In-Place Expand / Collapse without interrupting stream
  const handleOpenFullscreen = () => {
    setIsFullscreen(true);
    uiState.setFullscreen(true);
    resetControlsTimer();
    RNStatusBar.setHidden(true, 'none');
    if (Platform.OS === 'android') {
      try {
        NavigationBar.setVisibilityAsync('hidden');
      } catch (e) {}
    }
  };

  const handleCloseFullscreen = () => {
    setIsFullscreen(false);
    uiState.setFullscreen(false);
    setChannelDrawerOpen(false);
    setEpgModalOpen(false);
    RNStatusBar.setHidden(false, 'none');
    if (Platform.OS === 'android') {
      try {
        NavigationBar.setVisibilityAsync('visible');
        NavigationBar.setStyle('light');
      } catch (e) {}
    }
  };

  const handleSelectChannelAndOpenFullscreen = (ch: LiveChannel, catId?: string) => {
    const targetCat = catId || ch.category_id || activeCategory || openCategory;
    // Se o canal for adulto, solicita PIN antes de tocar
    const isAdult =
      isAdultCategory(ch.name) ||
      (targetCat && categories.some((c) => c.category_id === targetCat && isAdultCategory(c.category_name)));

    if (isAdult) {
      setTargetAdultCategory(null);
      setTargetAdultChannel(ch);
      setEnteredPin('');
      setPinError(null);
      setPinModalVisible(true);
      return;
    }

    selectChannelForPlayer(ch, account || undefined, targetCat || undefined);
    handleOpenFullscreen();
  };

  // Auto-hide controls timer
  const resetControlsTimer = () => {
    if (isLocked) return;
    setControlsVisible(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      setControlsVisible(false);
    }, 4500);
  };

  const toggleControls = () => {
    if (isDraggingRef.current) return;
    if (isLocked) {
      setControlsVisible((prev) => !prev);
      return;
    }
    if (controlsVisible) {
      setControlsVisible(false);
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    } else {
      resetControlsTimer();
    }
  };

  const handleToggleAspectRatio = () => {
    setAspectRatio((prev) => (prev === 'contain' ? 'cover' : prev === 'cover' ? 'fill' : 'contain'));
    resetControlsTimer();
  };

  // Gesture Controls: Volume & Brightness
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_, gesture) => {
        return Math.abs(gesture.dy) > 10 && Math.abs(gesture.dy) > Math.abs(gesture.dx);
      },
      onMoveShouldSetPanResponderCapture: (_, gesture) => {
        return Math.abs(gesture.dy) > 10 && Math.abs(gesture.dy) > Math.abs(gesture.dx);
      },
      onPanResponderGrant: (evt) => {
        isDraggingRef.current = true;
        const currentWidth = Dimensions.get('window').width;
        const touchX = evt.nativeEvent.pageX;
        gestureStartXRef.current = touchX;
        if (touchX < currentWidth / 2) {
          gestureStartYValueRef.current = currentBrightnessRef.current;
        } else {
          gestureStartYValueRef.current = currentVolumeRef.current;
        }
      },
      onPanResponderMove: (_, gesture) => {
        const currentWidth = Dimensions.get('window').width;
        const isLeftHalf = gestureStartXRef.current < currentWidth / 2;
        const delta = -gesture.dy / 220; // 220px drag = 100% change
        const initial = gestureStartYValueRef.current;
        const next = Math.max(0, Math.min(1.0, initial + delta));

        if (isLeftHalf) {
          const b = Math.max(0.15, next);
          setBrightness(b);
          currentBrightnessRef.current = b;
          showGestureIndicator('brightness', b);
        } else {
          setVolume(next);
          currentVolumeRef.current = next;
          if (miniPlayer) {
            try {
              miniPlayer.volume = next;
            } catch (e) {}
          }
          showGestureIndicator('volume', next);
        }
      },
      onPanResponderRelease: () => {
        setTimeout(() => {
          isDraggingRef.current = false;
        }, 120);
        hideGestureIndicatorWithDelay();
      },
      onPanResponderTerminate: () => {
        isDraggingRef.current = false;
        hideGestureIndicatorWithDelay();
      },
    })
  ).current;

  const showGestureIndicator = (type: 'brightness' | 'volume', value: number) => {
    if (gestureHideTimeoutRef.current) {
      clearTimeout(gestureHideTimeoutRef.current);
    }
    setGestureIndicator({ type, value, visible: true });
  };

  const hideGestureIndicatorWithDelay = () => {
    gestureHideTimeoutRef.current = setTimeout(() => {
      setGestureIndicator((prev) => ({ ...prev, visible: false }));
    }, 1200);
  };

  const handleCastToTv = () => {
    Alert.alert(
      'Transmitir para TV',
      'Procurando Smart TVs e dispositivos Chromecast na sua rede Wi-Fi...\n\nCertifique-se de que a TV está conectada na mesma rede.',
      [{ text: 'Entendi' }]
    );
  };

  const searchedChannels = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    const pool = allChannels.length > 0
      ? allChannels
      : Object.values(channelsByCategory).flat();
    return pool.filter((ch) => (ch.name || '').toLowerCase().includes(q));
  }, [searchQuery, allChannels, channelsByCategory]);

  return (
    <View style={styles.container}>
      <StatusBar hidden={isFullscreen} style="light" />
      {/* Top Search Bar (Hidden when in Fullscreen) */}
      {!isFullscreen && (
        <View style={styles.searchHeader}>
          <Ionicons name="tv" size={24} color={colors.primary} />
          <View style={styles.searchBox}>
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar canais..."
              placeholderTextColor="#777"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 ? (
              <Pressable onPress={() => setSearchQuery('')} hitSlop={10}>
                <Ionicons name="close-circle" size={18} color="#888" />
              </Pressable>
            ) : (
              <Ionicons name="search" size={20} color="#888" />
            )}
          </View>
        </View>
      )}

      {/* Mini Player Fixo no Topo (Não rola junto com as categorias) */}
      {!isFullscreen && activeChannel ? (
        <View style={styles.miniPlayerContainer}>
          <Pressable
            style={[styles.miniVideoBox, isLandscape && styles.miniVideoBoxLandscape]}
            onPress={handleOpenFullscreen}
          >
            {streamUrl ? (
              <VideoView
                style={styles.video}
                player={miniPlayer}
                contentFit="contain"
                nativeControls={false}
              />
            ) : (
              <ActivityIndicator color={colors.primary} size="large" />
            )}

            {/* Top Video Header Overlay */}
            <View style={styles.videoHeaderOverlay}>
              <View style={styles.liveTag}>
                <Text style={styles.liveTagText}>AO VIVO</Text>
              </View>
              <Text style={styles.videoTitle} numberOfLines={1}>
                {activeChannel.num ? `${activeChannel.num} - ` : ''}{activeChannel.name}
              </Text>
            </View>

            {/* Bottom Mini Player Controls Overlay */}
            <View style={styles.videoControlsOverlay}>
              <Pressable style={styles.miniControlBtn} onPress={handleCastToTv}>
                <Ionicons name="tv-outline" size={20} color="#fff" />
              </Pressable>

              <Pressable
                style={styles.miniControlBtn}
                onPress={() => handleToggleFavorite(activeChannel)}
              >
                <Ionicons
                  name={favorites.includes(activeChannel.stream_id) ? 'star' : 'star-outline'}
                  size={20}
                  color={favorites.includes(activeChannel.stream_id) ? '#FFD700' : '#fff'}
                />
              </Pressable>

              {/* Redimensionar de pequeno para grande in-place! */}
              <Pressable style={styles.fullscreenBtn} onPress={handleOpenFullscreen}>
                <Ionicons name="scan-outline" size={16} color="#fff" />
                <Text style={styles.fullscreenBtnText}>Abrir</Text>
              </Pressable>
            </View>
          </Pressable>
        </View>
      ) : null}

      {/* Rolagem Somente das Categorias / Resultados de Canais */}
      {!isFullscreen && (
        <ScrollView
          style={styles.categoriesScrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => initLive(true)}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
        >
          {searchQuery.trim().length > 0 ? (
            /* Modo Busca por Canais (Item 7) */
            <View style={styles.searchChannelsContainer}>
              <View style={styles.searchChannelsHeader}>
                <Text style={styles.searchChannelsTitle}>Canais encontrados</Text>
                <View style={styles.searchCountBadge}>
                  <Text style={styles.searchCountText}>{searchedChannels.length}</Text>
                </View>
              </View>

              {isSearchingChannels ? (
                <View style={styles.centerBox}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={styles.loadingText}>Pesquisando canais...</Text>
                </View>
              ) : searchedChannels.length === 0 ? (
                <View style={styles.emptyLiveCard}>
                  <Ionicons name="search-outline" size={48} color={colors.textMuted} />
                  <Text style={styles.emptyLiveTitle}>Nenhum canal encontrado</Text>
                  <Text style={styles.emptyLiveDesc}>
                    Nenhum canal corresponde a "{searchQuery}".
                  </Text>
                </View>
              ) : (
                <View style={styles.searchedChannelsList}>
                  {searchedChannels.map((ch, idx) => {
                    const isChannelActive = Number(activeChannel?.stream_id) === Number(ch.stream_id);
                    const isFav = favorites.includes(ch.stream_id);

                    return (
                      <Pressable
                        key={ch.stream_id}
                        style={[styles.channelRow, isChannelActive && styles.channelRowActive]}
                        onPress={() => selectChannelForPlayer(ch, undefined, ch.category_id)}
                      >
                        <Text style={styles.channelNum}>
                          {ch.num || idx + 1}
                        </Text>

                        <View style={styles.channelLogoWrapper}>
                          {ch.stream_icon ? (
                            <Image
                              source={{ uri: ch.stream_icon }}
                              style={styles.channelLogo}
                              contentFit="contain"
                            />
                          ) : (
                            <Ionicons name="tv" size={18} color="#666" />
                          )}
                        </View>

                        <Text
                          style={[styles.channelRowName, isChannelActive && styles.channelRowNameActive]}
                          numberOfLines={1}
                        >
                          {ch.name}
                        </Text>

                        <Pressable
                          style={styles.starBtn}
                          onPress={(e) => {
                            e.stopPropagation();
                            handleToggleFavorite(ch);
                          }}
                          hitSlop={8}
                        >
                          <Ionicons
                            name={isFav ? 'star' : 'star-outline'}
                            size={18}
                            color={isFav ? '#FFD700' : '#666'}
                          />
                        </Pressable>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          ) : loading ? (
            <View style={styles.centerBox}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>Carregando categorias...</Text>
            </View>
          ) : errorMessage && categories.length === 0 ? (
            <View style={styles.emptyLiveCard}>
              <Ionicons name="alert-circle-outline" size={48} color={colors.warning} />
              <Text style={styles.emptyLiveTitle}>Erro ao carregar canais</Text>
              <Text style={styles.emptyLiveDesc}>{errorMessage}</Text>

              <View style={styles.emptyLiveActions}>
                <FocusableItem style={styles.retryLiveBtn} onPress={() => initLive(true)}>
                  <Ionicons name="refresh" size={16} color="#fff" />
                  <Text style={styles.retryLiveBtnText}>Tentar Novamente</Text>
                </FocusableItem>

                <FocusableItem style={styles.changeAccountLiveBtn} onPress={() => router.push('/login')}>
                  <Ionicons name="log-in-outline" size={16} color="#fff" />
                  <Text style={styles.changeAccountLiveBtnText}>Trocar / Reconfigurar Conta</Text>
                </FocusableItem>
              </View>
            </View>
          ) : categories.length === 0 ? (
            <View style={styles.emptyLiveCard}>
              <Ionicons name="tv-outline" size={48} color={colors.textMuted} />
              <Text style={styles.emptyLiveTitle}>Nenhuma categoria encontrada</Text>
              <Text style={styles.emptyLiveDesc}>
                O servidor não retornou categorias de canais.
              </Text>
              <FocusableItem style={styles.retryLiveBtn} onPress={() => initLive(true)}>
                <Ionicons name="refresh" size={16} color="#fff" />
                <Text style={styles.retryLiveBtnText}>Atualizar Lista</Text>
              </FocusableItem>
            </View>
          ) : (
            <View style={styles.accordionContainer}>
              {categories.map((cat) => {
                const isOpen = openCategory === cat.category_id;
                const catChannels = channelsByCategory[cat.category_id] || [];
                const isAdult = isAdultCategory(cat.category_name);
                const isFavCat = cat.category_id === FAVORITES_CAT_ID;

                return (
                  <View key={cat.category_id} style={[styles.accordionItem, isOpen && styles.accordionItemOpen]}>
                    {/* Category Header Row */}
                    <FocusableItem
                      style={styles.categoryHeader}
                      onPress={() => handleToggleCategory(cat.category_id, cat)}
                    >
                      <View style={styles.categoryInfo}>
                        <View style={styles.categoryTitleRow}>
                          {isAdult && (
                            <Ionicons
                              name={isOpen ? 'lock-open-outline' : 'lock-closed'}
                              size={16}
                              color={isOpen ? colors.success : colors.warning}
                              style={{ marginRight: 6 }}
                            />
                          )}
                          <Text
                            style={[
                              styles.categoryTitle,
                              isFavCat && styles.categoryTitleFav,
                              isAdult && styles.categoryTitleAdult,
                            ]}
                          >
                            {cat.category_name}
                          </Text>
                        </View>
                        <Text style={styles.categoryCount}>
                          {isFavCat
                            ? `${favoriteChannelsList.length} canais salvos`
                            : catChannels.length > 0
                            ? `${catChannels.length} canais`
                            : isAdult && !isOpen
                            ? 'Protegido por PIN'
                            : 'Toque para carregar'}
                        </Text>
                      </View>

                      <View style={styles.categoryAction}>
                        <Text style={styles.categoryActionText}>{isOpen ? 'Fechar' : 'Abrir'}</Text>
                        <View style={[styles.chevronCircle, isOpen && styles.chevronCircleOpen]}>
                          <Ionicons
                            name={isOpen ? 'chevron-down' : 'chevron-forward'}
                            size={16}
                            color={isOpen ? '#000' : '#fff'}
                          />
                        </View>
                      </View>
                    </FocusableItem>

                    {/* Expanded Channels List */}
                    {isOpen ? (
                      <View style={styles.channelsExpandedBox}>
                        {loadingCategory && catChannels.length === 0 ? (
                          <View style={styles.loadingChannelsBox}>
                            <ActivityIndicator size="small" color={colors.primary} />
                            <Text style={styles.loadingChannelsText}>Carregando canais...</Text>
                          </View>
                        ) : (
                          catChannels.map((ch, idx) => {
                            const isChannelActive = Number(activeChannel?.stream_id) === Number(ch.stream_id);
                            const isFav = favorites.includes(ch.stream_id);

                            return (
                              <Pressable
                                key={ch.stream_id}
                                style={[styles.channelRow, isChannelActive && styles.channelRowActive]}
                                onPress={() => handleSelectChannelAndOpenFullscreen(ch, cat.category_id)}
                              >
                                <Text style={styles.channelNum}>
                                  {ch.num || idx + 1}
                                </Text>

                                <View style={styles.channelLogoWrapper}>
                                  {ch.stream_icon ? (
                                    <Image
                                      source={{ uri: ch.stream_icon }}
                                      style={styles.channelLogo}
                                      contentFit="contain"
                                    />
                                  ) : (
                                    <Ionicons name="tv" size={18} color="#666" />
                                  )}
                                </View>

                                <Text
                                  style={[styles.channelRowName, isChannelActive && styles.channelRowNameActive]}
                                  numberOfLines={1}
                                >
                                  {ch.name}
                                </Text>

                                <Pressable
                                  style={styles.starBtn}
                                  onPress={(e) => {
                                    e.stopPropagation();
                                    handleToggleFavorite(ch);
                                  }}
                                >
                                  <Ionicons
                                    name={isFav ? 'star' : 'star-outline'}
                                    size={18}
                                    color={isFav ? '#FFD700' : '#555'}
                                  />
                                </Pressable>
                              </Pressable>
                            );
                          })
                        )}
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}

      {/* FULLSCREEN IN-PLACE RESIZED PLAYER (Continuous Video Playback) */}
      {isFullscreen && activeChannel ? (
        <View style={styles.fullscreenContainer}>
          {/* Base Video Component */}
          <VideoView
            style={styles.fullscreenVideo}
            player={miniPlayer}
            contentFit={aspectRatio}
            nativeControls={false}
          />

          {/* Software Brightness Shade Overlay */}
          <View
            style={[
              styles.brightnessOverlay,
              { backgroundColor: `rgba(0,0,0,${(1 - brightness).toFixed(2)})` },
            ]}
            pointerEvents="none"
          />

          {/* Volume / Brightness Gesture HUD Indicator */}
          {gestureIndicator.visible && (
            <View style={styles.gestureIndicatorBox} pointerEvents="none">
              <Ionicons
                name={
                  gestureIndicator.type === 'brightness'
                    ? 'sunny'
                    : gestureIndicator.value === 0
                    ? 'volume-mute'
                    : 'volume-high'
                }
                size={34}
                color={colors.primary}
              />
              <Text style={styles.gestureIndicatorText}>
                {gestureIndicator.type === 'brightness' ? 'Brilho' : 'Volume'}{' '}
                {Math.round(gestureIndicator.value * 100)}%
              </Text>
              <View style={styles.gestureBarBackground}>
                <View
                  style={[
                    styles.gestureBarFill,
                    { width: `${Math.round(gestureIndicator.value * 100)}%` },
                  ]}
                />
              </View>
            </View>
          )}

          {/* Gesture Layer for PanResponder */}
          <View style={styles.gestureLayer} {...panResponder.panHandlers} />

          {/* Tap Detector for showing/hiding controls */}
          <Pressable style={styles.tapDetector} onPress={toggleControls} />

          {/* Screen Locked Discrete Pill Button */}
          {isLocked && controlsVisible ? (
            <View style={styles.lockedPillContainer} pointerEvents="box-none">
              <Pressable
                style={styles.lockedPillBtn}
                onPress={() => {
                  setIsLocked(false);
                  resetControlsTimer();
                }}
              >
                <Ionicons name="lock-closed" size={20} color="#FFD700" />
                <Text style={styles.lockedPillText}>Tela Bloqueada · Toque para Desbloquear</Text>
              </Pressable>
            </View>
          ) : null}

          {/* Left Vertical Brightness Slider (Image 2 & 3) */}
          {controlsVisible && !isLocked ? (
            <View style={styles.leftVerticalSliderBox} pointerEvents="box-none">
              <Ionicons name="sunny-outline" size={20} color="#fff" style={styles.sliderIcon} />
              <View style={styles.verticalTrack}>
                <View
                  style={[
                    styles.verticalFill,
                    { height: `${Math.round(brightness * 100)}%` },
                  ]}
                />
                <View
                  style={[
                    styles.verticalThumb,
                    { bottom: `${Math.min(96, Math.max(0, Math.round(brightness * 100) - 4))}%` },
                  ]}
                />
              </View>
            </View>
          ) : null}

          {/* Right Vertical Volume Slider (Image 2 & 3) */}
          {controlsVisible && !isLocked ? (
            <View style={styles.rightVerticalSliderBox} pointerEvents="box-none">
              <Ionicons
                name={volume === 0 ? 'volume-mute-outline' : 'volume-high-outline'}
                size={20}
                color="#fff"
                style={styles.sliderIcon}
              />
              <View style={styles.verticalTrack}>
                <View
                  style={[
                    styles.verticalFill,
                    { height: `${Math.round(volume * 100)}%` },
                  ]}
                />
                <View
                  style={[
                    styles.verticalThumb,
                    { bottom: `${Math.min(96, Math.max(0, Math.round(volume * 100) - 4))}%` },
                  ]}
                />
              </View>
            </View>
          ) : null}

          {/* Controls Overlay (Matches User Image 2 & 3 Format) */}
          {controlsVisible && !isLocked ? (
            <View style={styles.controlsOverlay} pointerEvents="box-none">
              {/* TOP BAR: Back Button on left, Empty center, 5 Action icons on right */}
              <LinearGradient
                colors={['rgba(0,0,0,0.85)', 'rgba(0,0,0,0.4)', 'transparent']}
                style={styles.topGradient}
              >
                <View style={styles.topRow}>
                  {/* Back Button */}
                  <Pressable
                    style={styles.topIconBtn}
                    onPress={handleCloseFullscreen}
                    hitSlop={12}
                  >
                    <Ionicons name="chevron-back" size={28} color="#fff" />
                  </Pressable>

                  {/* Clean Center (Image 2 & 3 Format) */}
                  <View style={{ flex: 1 }} />

                  {/* Top Right Action Icons: Server, Heart, Lock, Search, AspectRatio */}
                  <View style={styles.topRightIconsRow}>
                    {/* 1. Channels Drawer List */}
                    <Pressable
                      style={styles.topActionIconBtn}
                      onPress={() => {
                        resetControlsTimer();
                        setChannelDrawerOpen(true);
                      }}
                      hitSlop={10}
                    >
                      <Ionicons name="server-outline" size={24} color="#fff" />
                    </Pressable>

                    {/* 2. Favorite Button */}
                    <Pressable
                      style={styles.topActionIconBtn}
                      onPress={() => handleToggleFavorite(activeChannel.stream_id)}
                      hitSlop={10}
                    >
                      <Ionicons
                        name={favorites.includes(activeChannel.stream_id) ? 'heart' : 'heart-outline'}
                        size={24}
                        color={favorites.includes(activeChannel.stream_id) ? '#FF3B30' : '#fff'}
                      />
                    </Pressable>

                    {/* 3. Screen Lock */}
                    <Pressable
                      style={styles.topActionIconBtn}
                      onPress={() => {
                        setIsLocked(true);
                        setControlsVisible(false);
                      }}
                      hitSlop={10}
                    >
                      <Ionicons name="lock-open-outline" size={24} color="#fff" />
                    </Pressable>

                    {/* 4. Search Channels Button */}
                    <Pressable
                      style={styles.topActionIconBtn}
                      onPress={() => {
                        resetControlsTimer();
                        setChannelDrawerOpen(true);
                      }}
                      hitSlop={10}
                    >
                      <Ionicons name="search-outline" size={24} color="#fff" />
                    </Pressable>

                    {/* 5. Aspect Ratio Resize Button */}
                    <Pressable
                      style={styles.topActionIconBtn}
                      onPress={handleToggleAspectRatio}
                      hitSlop={10}
                    >
                      <Ionicons name="scan-outline" size={24} color="#fff" />
                    </Pressable>
                  </View>
                </View>
              </LinearGradient>

              {/* CENTER CONTROLS: |<  Play/Pause  >| */}
              <View style={styles.centerControlsRow} pointerEvents="box-none">
                <Pressable
                  style={styles.seekStepBtn}
                  onPress={handlePrevChannel}
                  hitSlop={14}
                >
                  <Ionicons name="play-skip-back" size={28} color="#fff" />
                </Pressable>

                <Pressable
                  style={styles.playPauseCircle}
                  onPress={togglePlayPause}
                  hitSlop={14}
                >
                  <Ionicons
                    name={isPlaying ? 'pause' : 'play'}
                    size={42}
                    color="#fff"
                  />
                </Pressable>

                <Pressable
                  style={styles.seekStepBtn}
                  onPress={handleNextChannel}
                  hitSlop={14}
                >
                  <Ionicons name="play-skip-forward" size={28} color="#fff" />
                </Pressable>
              </View>

              {/* BOTTOM SECTION (Image 2 & 3: Logo, Channel, Programs, Live Badge & Blue Progress Bar) */}
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.6)', 'rgba(0,0,0,0.95)']}
                style={styles.bottomGradient}
              >
                <View style={styles.liveBottomCard}>
                  <View style={styles.liveBottomContentRow}>
                    {/* Channel Logo in White Rounded Box */}
                    <View style={styles.liveChannelLogoBox}>
                      {activeChannel.stream_icon ? (
                        <Image
                          source={{ uri: activeChannel.stream_icon }}
                          style={styles.liveChannelLogo}
                          contentFit="contain"
                        />
                      ) : (
                        <Ionicons name="tv" size={24} color="#000" />
                      )}
                    </View>

                    {/* Channel Number, Name and Current Program */}
                    <View style={styles.liveChannelInfoBox}>
                      <Text style={styles.liveChannelName} numberOfLines={1}>
                        {activeChannel.num ? `${activeChannel.num} ` : ''}{activeChannel.name}
                      </Text>
                      <Text style={styles.liveProgramTitle} numberOfLines={1}>
                        {epgList && epgList.length > 0 && epgList[0]?.start
                          ? `${epgList[0].start.slice(11, 16)} ${epgList[0].title || ''}`
                          : currentProgramName}
                      </Text>
                    </View>

                    {/* Right Side: Next Program & Live Badge */}
                    <View style={styles.liveStatusBox}>
                      {epgList && epgList.length > 1 && epgList[1]?.title ? (
                        <Text style={styles.liveNextProgramText} numberOfLines={1}>
                          {epgList[1].start ? `${epgList[1].start.slice(11, 16)} ` : ''}
                          {epgList[1].title}
                        </Text>
                      ) : null}
                      <View style={styles.liveBadgeRow}>
                        <View style={styles.liveRedDot} />
                        <Text style={styles.liveBadgeText}>LIVE | 1280x720</Text>
                      </View>
                    </View>
                  </View>

                  {/* Horizontal Blue Progress Bar (Image 2 & 3) */}
                  <View style={styles.liveTimelineTrack}>
                    <View style={styles.liveTimelineFill} />
                  </View>
                </View>
              </LinearGradient>
            </View>
          ) : null}

          {/* Quick Channels Drawer Modal inside Fullscreen */}
          <Modal
            visible={channelDrawerOpen}
            transparent
            animationType="fade"
            onRequestClose={() => setChannelDrawerOpen(false)}
          >
            <View style={styles.drawerBackdrop}>
              <Pressable
                style={styles.drawerDismissArea}
                onPress={() => setChannelDrawerOpen(false)}
              />
              <View style={styles.drawerSheet}>
                <View style={styles.drawerHeader}>
                  <View style={styles.drawerHeaderTitleBox}>
                    <Text style={styles.drawerTitle}>Grade de Canais</Text>
                    <Text style={styles.drawerCategorySub} numberOfLines={1}>
                      {categories.find((c) => c.category_id === (drawerCategory || activeCategory || openCategory))?.category_name || 'Canais'}
                    </Text>
                  </View>
                  <Pressable onPress={() => setChannelDrawerOpen(false)} hitSlop={10}>
                    <Ionicons name="close" size={24} color="#fff" />
                  </Pressable>
                </View>

                {/* Horizontal Category Selector Chips */}
                <View style={styles.drawerCategoryContainer}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.drawerCategoryScroll}
                  >
                    {categories.map((c) => {
                      const isSelected = (drawerCategory || activeCategory || openCategory) === c.category_id;
                      return (
                        <Pressable
                          key={c.category_id}
                          style={[styles.drawerCatChip, isSelected && styles.drawerCatChipActive]}
                          onPress={() => {
                            setDrawerCategory(c.category_id);
                            ensureCategoryLoaded(c.category_id);
                          }}
                        >
                          <Text
                            style={[
                              styles.drawerCatChipText,
                              isSelected && styles.drawerCatChipTextActive,
                            ]}
                            numberOfLines={1}
                          >
                            {c.category_name}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>

                {loadingCategory && drawerChannelsList.length === 0 ? (
                  <View style={styles.drawerLoadingBox}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={styles.drawerLoadingText}>Carregando canais...</Text>
                  </View>
                ) : (
                  <FlatList
                    data={drawerChannelsList}
                    keyExtractor={(item) => String(item.stream_id)}
                    renderItem={({ item, index }) => {
                      const isCur = Number(item.stream_id) === Number(activeChannel.stream_id);
                      return (
                        <Pressable
                          style={[styles.drawerItem, isCur && styles.drawerItemActive]}
                          onPress={() => {
                            selectChannelForPlayer(item, undefined, drawerCategory || activeCategory || openCategory || undefined);
                            setChannelDrawerOpen(false);
                            resetControlsTimer();
                          }}
                        >
                          <Text style={styles.drawerItemNum}>{item.num || index + 1}</Text>
                          <Text style={[styles.drawerItemName, isCur && styles.drawerItemNameActive]} numberOfLines={1}>
                            {item.name}
                          </Text>
                          {isCur && <Ionicons name="volume-high" size={18} color={colors.primary} />}
                        </Pressable>
                      );
                    }}
                  />
                )}
              </View>
            </View>
          </Modal>

          {/* EPG Programação Modal inside Fullscreen */}
          <Modal
            visible={epgModalOpen}
            transparent
            animationType="fade"
            onRequestClose={() => setEpgModalOpen(false)}
          >
            <View style={styles.drawerBackdrop}>
              <Pressable
                style={styles.drawerDismissArea}
                onPress={() => setEpgModalOpen(false)}
              />
              <View style={styles.drawerSheet}>
                <View style={styles.drawerHeader}>
                  <Text style={styles.drawerTitle}>Guia de Programação (EPG)</Text>
                  <Pressable onPress={() => setEpgModalOpen(false)}>
                    <Ionicons name="close" size={24} color="#fff" />
                  </Pressable>
                </View>
                {epgList.length === 0 ? (
                  <View style={styles.epgEmptyBox}>
                    <Ionicons name="calendar-outline" size={36} color="#666" />
                    <Text style={styles.epgEmptyText}>Nenhuma programação disponível no momento para este canal.</Text>
                  </View>
                ) : (
                  <FlatList
                    data={epgList}
                    keyExtractor={(_, index) => String(index)}
                    renderItem={({ item }) => (
                      <View style={styles.epgItem}>
                        <Text style={styles.epgTime}>
                          {item.start} - {item.end}
                        </Text>
                        <Text style={styles.epgTitle}>{item.title}</Text>
                        {item.description ? (
                          <Text style={styles.epgDesc} numberOfLines={2}>
                            {item.description}
                          </Text>
                        ) : null}
                      </View>
                    )}
                  />
                )}
              </View>
            </View>
          </Modal>
        </View>
      ) : null}

      {/* Modal de PIN - Controle Parental para Categorias Adulto / XXX */}
      <Modal
        visible={pinModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setPinModalVisible(false);
          setEnteredPin('');
          setPinError(null);
        }}
      >
        <View style={styles.pinModalBackdrop}>
          <View style={styles.pinModalCard}>
            <View style={styles.pinIconBox}>
              <Ionicons name="lock-closed" size={32} color={colors.primary} />
            </View>

            <Text style={styles.pinModalTitle}>Controle Parental</Text>
            <Text style={styles.pinModalSubtitle}>
              A categoria{' '}
              <Text style={{ color: colors.primary, fontWeight: 'bold' }}>
                {targetAdultCategory?.category_name}
              </Text>{' '}
              é protegida. Digite seu PIN de 4 dígitos para acessar.
            </Text>

            <View style={styles.pinInputRow}>
              <TextInput
                style={[styles.pinTextInput, pinError ? styles.pinInputError : null]}
                value={enteredPin}
                onChangeText={(val) => {
                  setPinError(null);
                  if (val.length <= 4) setEnteredPin(val.replace(/[^0-9]/g, ''));
                }}
                keyboardType="numeric"
                maxLength={4}
                secureTextEntry
                placeholder="••••"
                placeholderTextColor="#666"
                autoFocus
              />
            </View>

            {pinError ? <Text style={styles.pinErrorText}>{pinError}</Text> : null}

            <Text style={styles.pinHintText}>PIN padrão inicial: 0000 • Altere no Perfil</Text>

            <View style={styles.pinActionsRow}>
              <Pressable
                style={styles.pinCancelBtn}
                onPress={() => {
                  setPinModalVisible(false);
                  setEnteredPin('');
                  setPinError(null);
                }}
              >
                <Text style={styles.pinCancelBtnText}>Cancelar</Text>
              </Pressable>

              <Pressable
                style={[
                  styles.pinConfirmBtn,
                  enteredPin.length === 4 ? styles.pinConfirmBtnActive : null,
                ]}
                onPress={handleConfirmPin}
              >
                <Text style={styles.pinConfirmBtnText}>Desbloquear</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: Platform.OS === 'android' ? 36 : 48,
  },
  searchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 12,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#101628',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#1E2845',
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
  },
  scrollContent: {
    paddingBottom: 110,
  },
  categoriesScrollView: {
    flex: 1,
  },
  miniPlayerContainer: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  miniVideoBox: {
    width: '100%',
    height: 210,
    backgroundColor: '#000',
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#222',
  },
  miniVideoBoxLandscape: {
    height: 165,
  },
  searchChannelsContainer: {
    paddingHorizontal: 16,
  },
  searchChannelsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  searchChannelsTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
  },
  searchCountBadge: {
    backgroundColor: '#20202c',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  searchCountText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  searchedChannelsList: {
    backgroundColor: '#121218',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#20202a',
    overflow: 'hidden',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  videoHeaderOverlay: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  liveTag: {
    backgroundColor: '#E52D27',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  liveTagText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '900',
  },
  videoTitle: {
    flex: 1,
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  videoControlsOverlay: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  miniControlBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullscreenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
  },
  fullscreenBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  accordionContainer: {
    paddingHorizontal: 16,
  },
  accordionItem: {
    borderBottomWidth: 1,
    borderBottomColor: '#161F33',
    backgroundColor: colors.background,
  },
  accordionItemOpen: {
    backgroundColor: '#0E1424',
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 8,
  },
  categoryInfo: {
    flex: 1,
  },
  categoryTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  categoryTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  categoryTitleFav: {
    color: '#FFD700',
  },
  categoryTitleAdult: {
    color: colors.secondary,
  },
  categoryCount: {
    fontSize: 12,
    color: '#777',
  },
  categoryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  categoryActionText: {
    fontSize: 12,
    color: '#999',
    fontWeight: '600',
  },
  chevronCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#151C30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevronCircleOpen: {
    backgroundColor: colors.primary,
  },
  channelsExpandedBox: {
    backgroundColor: '#0A0E1A',
    paddingVertical: 6,
  },
  loadingChannelsBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 8,
  },
  loadingChannelsText: {
    color: '#888',
    fontSize: 13,
  },
  channelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#141A2E',
    gap: 12,
  },
  channelRowActive: {
    backgroundColor: '#141D33',
  },
  channelNum: {
    fontSize: 12,
    color: '#666',
    width: 32,
    fontVariant: ['tabular-nums'],
  },
  channelLogoWrapper: {
    width: 38,
    height: 28,
    borderRadius: 4,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
  },
  channelLogo: {
    width: '100%',
    height: '100%',
  },
  channelRowName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#ccc',
  },
  channelRowNameActive: {
    color: colors.primary,
  },
  starBtn: {
    padding: 6,
  },
  centerBox: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 14,
  },

  /* FULLSCREEN PLAYER STYLES */
  fullscreenContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000',
    zIndex: 99999,
  },
  fullscreenVideo: {
    width: '100%',
    height: '100%',
  },
  brightnessOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000',
    zIndex: 1,
  },
  gestureIndicatorBox: {
    position: 'absolute',
    top: '40%',
    alignSelf: 'center',
    backgroundColor: 'rgba(15,15,20,0.88)',
    paddingHorizontal: 22,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    gap: 8,
    zIndex: 10,
    borderWidth: 1,
    borderColor: '#333',
  },
  gestureIndicatorText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  gestureBarBackground: {
    width: 120,
    height: 4,
    backgroundColor: '#333',
    borderRadius: 2,
    overflow: 'hidden',
  },
  gestureBarFill: {
    height: '100%',
    backgroundColor: colors.primary,
  },
  gestureLayer: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    bottom: 80,
    zIndex: 2,
  },
  tapDetector: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 3,
  },
  controlsOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 4,
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: Platform.OS === 'android' ? 20 : 36,
  },
  /* Top Bar (Image 2 & 3 Layout) */
  topGradient: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 16 : 32,
    paddingBottom: 24,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topIconBtn: {
    padding: 6,
  },
  topRightIconsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  topActionIconBtn: {
    padding: 6,
  },

  /* Vertical Sliders (Image 2 & 3) */
  leftVerticalSliderBox: {
    position: 'absolute',
    left: 24,
    top: '32%',
    alignItems: 'center',
    gap: 10,
    zIndex: 12,
  },
  rightVerticalSliderBox: {
    position: 'absolute',
    right: 24,
    top: '32%',
    alignItems: 'center',
    gap: 10,
    zIndex: 12,
  },
  sliderIcon: {
    marginBottom: 4,
  },
  verticalTrack: {
    width: 3,
    height: 140,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
    position: 'relative',
    justifyContent: 'flex-end',
  },
  verticalFill: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 2,
  },
  verticalThumb: {
    position: 'absolute',
    left: -4.5,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#fff',
    elevation: 3,
  },

  /* Center Controls Row */
  centerControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 56,
  },
  seekStepBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playPauseCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
  },

  /* Bottom Section (Image 2 & 3) */
  bottomGradient: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 22,
  },
  liveBottomCard: {
    width: '100%',
    gap: 10,
  },
  liveBottomContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  liveChannelLogoBox: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#fff',
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
  },
  liveChannelLogo: {
    width: '100%',
    height: '100%',
  },
  liveChannelInfoBox: {
    flex: 1,
  },
  liveChannelName: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  liveProgramTitle: {
    color: '#bbb',
    fontSize: 13,
    fontWeight: '500',
    marginTop: 2,
  },
  liveStatusBox: {
    alignItems: 'flex-end',
    gap: 4,
  },
  liveNextProgramText: {
    color: '#bbb',
    fontSize: 13,
    fontWeight: '500',
  },
  liveBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  liveRedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF3B30',
  },
  liveBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  liveTimelineTrack: {
    width: '100%',
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 1.5,
    overflow: 'hidden',
    marginTop: 6,
  },
  liveTimelineFill: {
    width: '40%',
    height: '100%',
    backgroundColor: '#1E88E5',
  },

  /* Screen Locked Pill */
  lockedPillContainer: {
    position: 'absolute',
    top: 40,
    alignSelf: 'center',
    zIndex: 99,
  },
  lockedPillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(20,20,24,0.9)',
    borderWidth: 1.5,
    borderColor: '#FFD700',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 24,
    gap: 8,
  },
  lockedPillText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },

  /* Drawer / Modal Styles */
  drawerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  drawerDismissArea: {
    flex: 1,
  },
  drawerSheet: {
    width: '78%',
    maxWidth: 340,
    backgroundColor: '#121217',
    paddingTop: 40,
    paddingHorizontal: 16,
    borderLeftWidth: 1,
    borderLeftColor: '#242430',
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#202028',
    marginBottom: 8,
  },
  drawerTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  drawerHeaderTitleBox: {
    flex: 1,
  },
  drawerCategorySub: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  drawerCategoryContainer: {
    marginBottom: 10,
    maxHeight: 38,
  },
  drawerCategoryScroll: {
    gap: 8,
    paddingVertical: 2,
  },
  drawerCatChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#1c1b26',
    borderWidth: 1,
    borderColor: '#2e2c3e',
  },
  drawerCatChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  drawerCatChipText: {
    color: '#aaa',
    fontSize: 12,
    fontWeight: '600',
  },
  drawerCatChipTextActive: {
    color: '#000',
    fontWeight: '800',
  },
  drawerLoadingBox: {
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  drawerLoadingText: {
    color: '#888',
    fontSize: 12,
  },
  drawerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#181822',
    gap: 10,
  },
  drawerItemActive: {
    backgroundColor: '#201d2a',
    borderRadius: 8,
  },
  drawerItemNum: {
    color: '#777',
    fontSize: 12,
    width: 28,
  },
  drawerItemName: {
    flex: 1,
    color: '#ddd',
    fontSize: 13,
    fontWeight: '600',
  },
  drawerItemNameActive: {
    color: colors.primary,
    fontWeight: '800',
  },
  epgEmptyBox: {
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  epgEmptyText: {
    color: '#888',
    fontSize: 13,
    textAlign: 'center',
  },
  epgItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e28',
  },
  epgTime: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
  },
  epgTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  epgDesc: {
    color: '#888',
    fontSize: 12,
  },

  /* Empty Live / Error styles */
  emptyLiveCard: {
    backgroundColor: '#121217',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#242432',
    padding: 28,
    alignItems: 'center',
    marginHorizontal: 16,
    marginVertical: 24,
  },
  emptyLiveTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
    marginTop: 14,
    textAlign: 'center',
  },
  emptyLiveDesc: {
    color: '#aaa',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 20,
    lineHeight: 18,
  },
  emptyLiveActions: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  retryLiveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 8,
  },
  retryLiveBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  changeAccountLiveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#20202c',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 8,
  },
  changeAccountLiveBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },

  /* Modal de PIN - Controle Parental */
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
  pinIconBox: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(245, 166, 35, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  pinModalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 8,
  },
  pinModalSubtitle: {
    fontSize: 13,
    color: '#aaa',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
  },
  pinInputRow: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 8,
  },
  pinTextInput: {
    width: 180,
    height: 52,
    backgroundColor: '#0c0c12',
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#333348',
    color: '#fff',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 14,
    textAlign: 'center',
  },
  pinInputError: {
    borderColor: '#ff4444',
  },
  pinErrorText: {
    color: '#ff4444',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 6,
    textAlign: 'center',
  },
  pinHintText: {
    color: '#777',
    fontSize: 11,
    marginTop: 8,
    marginBottom: 20,
    textAlign: 'center',
  },
  pinActionsRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
  },
  pinCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: '#222230',
    alignItems: 'center',
  },
  pinCancelBtnText: {
    color: '#aaa',
    fontSize: 14,
    fontWeight: '700',
  },
  pinConfirmBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: '#44445a',
    alignItems: 'center',
  },
  pinConfirmBtnActive: {
    backgroundColor: colors.primary,
  },
  pinConfirmBtnText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '800',
  },
});
