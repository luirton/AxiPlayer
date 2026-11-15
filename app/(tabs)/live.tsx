import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Pressable,
  Dimensions,
  ScrollView,
  Platform,
  PanResponder,
  Modal,
  Alert,
  FlatList,
} from 'react-native';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as NavigationBar from 'expo-navigation-bar';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { storage } from '../../src/services/storage';
import { XtreamClient } from '../../src/services/xtreamClient';
import { IptvCategory, LiveChannel, EpgProgram, SavedAccount } from '../../src/types/iptv';
import { FocusableItem } from '../../src/components/common/FocusableItem';
import { uiState } from '../../src/services/uiState';

const { width, height } = Dimensions.get('window');

export default function LiveScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ channelId?: string; autoFullscreen?: string }>();
  const [categories, setCategories] = useState<IptvCategory[]>([]);
  const [channelsByCategory, setChannelsByCategory] = useState<Record<string, LiveChannel[]>>({});
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const [activeChannel, setActiveChannel] = useState<LiveChannel | null>(null);
  const [streamUrl, setStreamUrl] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingCategory, setLoadingCategory] = useState(false);
  const [favorites, setFavorites] = useState<number[]>([]);
  const [account, setAccount] = useState<SavedAccount | null>(null);

  // Fullscreen In-Place Resizing State
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [controlsVisible, setControlsVisible] = useState<boolean>(true);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);

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

  // Video Player instance
  const miniPlayer = useVideoPlayer(streamUrl, (player) => {
    player.loop = false;
    player.play();
  });

  // Keep track of playing state
  useEffect(() => {
    if (!miniPlayer) return;
    const subscription = miniPlayer.addListener('playingChange', (event) => {
      setIsPlaying(event.isPlaying);
    });
    return () => {
      subscription.remove();
    };
  }, [miniPlayer]);

  // Whenever streamUrl changes, replace source in player without remounting
  useEffect(() => {
    if (miniPlayer && streamUrl) {
      try {
        miniPlayer.replace(streamUrl);
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

  const handleDirectChannelParam = async (channelId: number) => {
    if (!account) return;
    try {
      const client = new XtreamClient(account.serverUrl, account.username, account.password);
      const chs = await client.getLiveStreams();
      const found = chs?.find((c) => Number(c.stream_id) === channelId);
      if (found) {
        selectChannelForPlayer(found);
        if (params.autoFullscreen === '1') {
          handleOpenFullscreen();
        }
      }
    } catch (e) {}
  };

  const initLive = async () => {
    try {
      const active = await storage.getActiveAccount();
      if (!active) {
        router.replace('/login');
        return;
      }
      setAccount(active);
      const favs = await storage.getFavorites();
      setFavorites(favs || []);

      const client = new XtreamClient(active.serverUrl, active.username, active.password);
      const cats = await client.getLiveCategories();
      setCategories(cats || []);

      // Preload first category channels so player starts playing
      if (cats && cats.length > 0) {
        const firstCatId = cats[0].category_id;
        setOpenCategory(firstCatId);
        const chs = await client.getLiveStreams(firstCatId);
        setChannelsByCategory({ [firstCatId]: chs || [] });
        if (chs && chs.length > 0) {
          selectChannelForPlayer(chs[0], active);
        }
      }
    } catch (err) {
      console.warn('Error loading live screen:', err);
    } finally {
      setLoading(false);
    }
  };

  const selectChannelForPlayer = async (ch: LiveChannel, acc?: SavedAccount) => {
    setActiveChannel(ch);
    const targetAccount = acc || account;
    if (!targetAccount) return;

    try {
      const settings = await storage.getSettings();
      const client = new XtreamClient(targetAccount.serverUrl, targetAccount.username, targetAccount.password);
      const url = client.getLiveStreamUrl(ch.stream_id, settings.streamFormat);
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

  const handleToggleCategory = async (catId: string) => {
    if (openCategory === catId) {
      setOpenCategory(null);
      return;
    }

    setOpenCategory(catId);
    if (!channelsByCategory[catId] && account) {
      setLoadingCategory(true);
      try {
        const client = new XtreamClient(account.serverUrl, account.username, account.password);
        const chs = await client.getLiveStreams(catId);
        setChannelsByCategory((prev) => ({ ...prev, [catId]: chs || [] }));
      } catch (err) {
        console.warn(err);
      } finally {
        setLoadingCategory(false);
      }
    }
  };

  const handleToggleFavorite = async (streamId: number) => {
    const isFav = await storage.toggleFavorite(streamId);
    setFavorites((prev) => (isFav ? [...prev, streamId] : prev.filter((id) => id !== streamId)));
  };

  // Channel Switching (|◀ and ▶|)
  const currentChannelsList = openCategory ? channelsByCategory[openCategory] || [] : [];

  const handleNextChannel = () => {
    if (currentChannelsList.length === 0 || !activeChannel) return;
    const currentIndex = currentChannelsList.findIndex((c) => c.stream_id === activeChannel.stream_id);
    const nextIndex = (currentIndex + 1) % currentChannelsList.length;
    const nextChannel = currentChannelsList[nextIndex];
    if (nextChannel) {
      selectChannelForPlayer(nextChannel);
    }
    resetControlsTimer();
  };

  const handlePrevChannel = () => {
    if (currentChannelsList.length === 0 || !activeChannel) return;
    const currentIndex = currentChannelsList.findIndex((c) => c.stream_id === activeChannel.stream_id);
    const prevIndex = (currentIndex - 1 + currentChannelsList.length) % currentChannelsList.length;
    const prevChannel = currentChannelsList[prevIndex];
    if (prevChannel) {
      selectChannelForPlayer(prevChannel);
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
    if (Platform.OS === 'android') {
      try {
        NavigationBar.setVisibilityAsync('visible');
        NavigationBar.setStyle('light');
      } catch (e) {}
    }
  };

  const handleSelectChannelAndOpenFullscreen = (ch: LiveChannel) => {
    selectChannelForPlayer(ch);
    handleOpenFullscreen();
  };

  // Auto-hide controls timer
  const resetControlsTimer = () => {
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
    if (controlsVisible) {
      setControlsVisible(false);
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    } else {
      resetControlsTimer();
    }
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

  const filteredCategories = categories.filter((cat) =>
    (cat.category_name || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <View style={styles.container}>
      {/* Top Search Bar (Hidden when in Fullscreen) */}
      {!isFullscreen && (
        <View style={styles.searchHeader}>
          <Ionicons name="tv" size={24} color={colors.primary} />
          <View style={styles.searchBox}>
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar canais"
              placeholderTextColor="#777"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            <Ionicons name="search" size={20} color="#888" />
          </View>
        </View>
      )}

      {/* Accordion Categories List (Hidden when in Fullscreen) */}
      {!isFullscreen && (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Mini Player Section on Top */}
          {activeChannel ? (
            <View style={styles.miniPlayerContainer}>
              <Pressable style={styles.miniVideoBox} onPress={handleOpenFullscreen}>
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
                    onPress={() => handleToggleFavorite(activeChannel.stream_id)}
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

          {/* Expandable Accordion Categories List */}
          {loading ? (
            <View style={styles.centerBox}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>Carregando categorias...</Text>
            </View>
          ) : (
            <View style={styles.accordionContainer}>
              {filteredCategories.map((cat) => {
                const isOpen = openCategory === cat.category_id;
                const catChannels = channelsByCategory[cat.category_id] || [];

                return (
                  <View key={cat.category_id} style={[styles.accordionItem, isOpen && styles.accordionItemOpen]}>
                    {/* Category Header Row */}
                    <FocusableItem
                      style={styles.categoryHeader}
                      onPress={() => handleToggleCategory(cat.category_id)}
                    >
                      <View style={styles.categoryInfo}>
                        <Text style={styles.categoryTitle}>{cat.category_name}</Text>
                        <Text style={styles.categoryCount}>
                          {catChannels.length > 0 ? `${catChannels.length} canais` : 'Toque para carregar'}
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
                            const isChannelActive = activeChannel?.stream_id === ch.stream_id;
                            const isFav = favorites.includes(ch.stream_id);

                            return (
                              <Pressable
                                key={ch.stream_id}
                                style={[styles.channelRow, isChannelActive && styles.channelRowActive]}
                                onPress={() => handleSelectChannelAndOpenFullscreen(ch)}
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
                                    handleToggleFavorite(ch.stream_id);
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
            contentFit="contain"
            nativeControls={false}
          />

          {/* Software Brightness Shade Overlay */}
          <View
            style={[
              styles.brightnessOverlay,
              { opacity: Math.max(0, 1 - brightness) * 0.8 },
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
                color="#FFA000"
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

          {/* Controls Overlay (Matches User Image 1 Exactly) */}
          {controlsVisible && (
            <View style={styles.controlsOverlay} pointerEvents="box-none">
              {/* TOP BAR */}
              <View style={styles.fsTopBar}>
                {/* Back Button: shrinks back to mini player without stopping video! */}
                <Pressable
                  style={styles.fsBackBtn}
                  onPress={handleCloseFullscreen}
                  hitSlop={15}
                >
                  <Ionicons name="chevron-back" size={28} color="#fff" />
                </Pressable>

                <View style={styles.fsTitleBox}>
                  <Text style={styles.fsChannelName} numberOfLines={1}>
                    {activeChannel.name}
                  </Text>
                  <Text style={styles.fsProgramName} numberOfLines={1}>
                    {currentProgramName}
                  </Text>
                </View>

                {/* Cast to TV button */}
                <Pressable
                  style={styles.fsTopCastBtn}
                  onPress={handleCastToTv}
                  hitSlop={15}
                >
                  <Ionicons name="tv-outline" size={24} color="#fff" />
                </Pressable>
              </View>

              {/* CENTER CONTROLS: |<  Play/Pause  >| */}
              <View style={styles.fsCenterControls}>
                <Pressable
                  style={styles.fsNavBtn}
                  onPress={handlePrevChannel}
                  hitSlop={15}
                >
                  <Ionicons name="play-skip-back-outline" size={32} color="#fff" />
                </Pressable>

                <Pressable
                  style={styles.fsPlayBtn}
                  onPress={togglePlayPause}
                  hitSlop={15}
                >
                  <Ionicons
                    name={isPlaying ? 'pause' : 'play'}
                    size={42}
                    color="#fff"
                  />
                </Pressable>

                <Pressable
                  style={styles.fsNavBtn}
                  onPress={handleNextChannel}
                  hitSlop={15}
                >
                  <Ionicons name="play-skip-forward-outline" size={32} color="#fff" />
                </Pressable>
              </View>

              {/* BOTTOM SECTION */}
              <View style={styles.fsBottomSection}>
                {/* Yellow Live Timeline Bar */}
                <View style={styles.fsTimelineContainer}>
                  <View style={styles.fsTimelineBar} />
                  <Text style={styles.fsLiveTagRight}>Ao vivo</Text>
                </View>

                {/* Bottom Action Pills: Canais, Programação, Favoritar */}
                <View style={styles.fsActionPillsRow}>
                  <Pressable
                    style={styles.fsActionPill}
                    onPress={() => setChannelDrawerOpen(true)}
                  >
                    <Ionicons name="list" size={18} color="#fff" />
                    <Text style={styles.fsActionPillText}>Canais</Text>
                  </Pressable>

                  <Pressable
                    style={styles.fsActionPill}
                    onPress={() => setEpgModalOpen(true)}
                  >
                    <Ionicons name="calendar-outline" size={18} color="#fff" />
                    <Text style={styles.fsActionPillText}>Programação</Text>
                  </Pressable>

                  <Pressable
                    style={styles.fsActionPill}
                    onPress={() => handleToggleFavorite(activeChannel.stream_id)}
                  >
                    <Ionicons
                      name={favorites.includes(activeChannel.stream_id) ? 'star' : 'star-outline'}
                      size={18}
                      color={favorites.includes(activeChannel.stream_id) ? '#FFD700' : '#fff'}
                    />
                    <Text
                      style={[
                        styles.fsActionPillText,
                        favorites.includes(activeChannel.stream_id) && { color: '#FFD700' },
                      ]}
                    >
                      {favorites.includes(activeChannel.stream_id) ? 'Favoritado' : 'Favoritar'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          )}

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
                  <Text style={styles.drawerTitle}>Trocar Canal</Text>
                  <Pressable onPress={() => setChannelDrawerOpen(false)}>
                    <Ionicons name="close" size={24} color="#fff" />
                  </Pressable>
                </View>
                <FlatList
                  data={currentChannelsList}
                  keyExtractor={(item) => String(item.stream_id)}
                  renderItem={({ item, index }) => {
                    const isCur = item.stream_id === activeChannel.stream_id;
                    return (
                      <Pressable
                        style={[styles.drawerItem, isCur && styles.drawerItemActive]}
                        onPress={() => {
                          selectChannelForPlayer(item);
                          setChannelDrawerOpen(false);
                          resetControlsTimer();
                        }}
                      >
                        <Text style={styles.drawerItemNum}>{item.num || index + 1}</Text>
                        <Text style={[styles.drawerItemName, isCur && styles.drawerItemNameActive]} numberOfLines={1}>
                          {item.name}
                        </Text>
                        {isCur && <Ionicons name="volume-high" size={18} color="#FFA000" />}
                      </Pressable>
                    );
                  }}
                />
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0c',
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
    backgroundColor: '#16161d',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#242430',
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
  },
  scrollContent: {
    paddingBottom: 110,
  },
  miniPlayerContainer: {
    paddingHorizontal: 16,
    marginBottom: 16,
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
    borderBottomColor: '#16161e',
    backgroundColor: '#0a0a0c',
  },
  accordionItemOpen: {
    backgroundColor: '#121217',
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
  categoryTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
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
    backgroundColor: '#202028',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevronCircleOpen: {
    backgroundColor: '#F5A623',
  },
  channelsExpandedBox: {
    backgroundColor: '#0e0e13',
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
    borderBottomColor: '#14141c',
    gap: 12,
  },
  channelRowActive: {
    backgroundColor: '#1e1c24',
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
    color: '#F5A623',
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
    backgroundColor: '#FFA000',
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
  fsTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  fsBackBtn: {
    padding: 6,
  },
  fsTitleBox: {
    flex: 1,
  },
  fsChannelName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  fsProgramName: {
    color: '#FFA000',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  fsTopCastBtn: {
    padding: 8,
  },
  fsCenterControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 48,
  },
  fsNavBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fsPlayBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  fsBottomSection: {
    gap: 14,
  },
  fsTimelineContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  fsTimelineBar: {
    flex: 1,
    height: 3,
    backgroundColor: '#FFA000',
    borderRadius: 2,
  },
  fsLiveTagRight: {
    color: '#FFA000',
    fontSize: 12,
    fontWeight: '800',
  },
  fsActionPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 28,
  },
  fsActionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(20,20,26,0.7)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  fsActionPillText: {
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
    width: Math.min(320, width * 0.8),
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
    color: '#FFA000',
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
    color: '#FFA000',
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
});
