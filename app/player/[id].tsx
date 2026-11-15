import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  StatusBar,
  Dimensions,
  PanResponder,
  FlatList,
  Pressable,
  Modal,
  Alert,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as NavigationBar from 'expo-navigation-bar';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../../src/theme/colors';
import { storage } from '../../src/services/storage';
import { XtreamClient } from '../../src/services/xtreamClient';
import { LiveChannel, EpgProgram, SavedAccount } from '../../src/types/iptv';

export default function PlayerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    id: string;
    type: 'live' | 'movie' | 'series';
    title?: string;
    extension?: string;
    icon?: string;
  }>();

  const [account, setAccount] = useState<SavedAccount | null>(null);
  const [currentStreamId, setCurrentStreamId] = useState<number>(Number(params.id));
  const [currentTitle, setCurrentTitle] = useState<string>(params.title || '');
  const [currentSubtitle, setCurrentSubtitle] = useState<string>('Ao vivo · Transmissão em Alta Definição');
  const [streamUrl, setStreamUrl] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [controlsVisible, setControlsVisible] = useState<boolean>(true);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isFavorite, setIsFavorite] = useState<boolean>(false);

  // Channels for switching Next/Previous and Channel Drawer
  const [channelsList, setChannelsList] = useState<LiveChannel[]>([]);
  const [channelsDrawerVisible, setChannelsDrawerVisible] = useState<boolean>(false);

  // EPG Programação Modal
  const [epgList, setEpgList] = useState<EpgProgram[]>([]);
  const [epgModalVisible, setEpgModalVisible] = useState<boolean>(false);

  // Brightness & Volume Gestures state
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
  const player = useVideoPlayer(streamUrl, (p) => {
    p.loop = false;
    p.play();
  });

  // Whenever streamUrl changes, replace stream source in the player immediately
  useEffect(() => {
    if (player && streamUrl) {
      try {
        player.replace(streamUrl);
        player.play();
      } catch (err) {
        console.warn('Error replacing player stream:', err);
      }
    }
  }, [streamUrl, player]);

  useEffect(() => {
    if (!player) return;
    const subscription = player.addListener('playingChange', (event) => {
      setIsPlaying(event.isPlaying);
    });
    return () => {
      subscription.remove();
    };
  }, [player]);

  // Fullscreen Immersive Mode: Hides Android status bar and system buttons (Back/Home/Recents)
  useEffect(() => {
    if (Platform.OS === 'android') {
      try {
        NavigationBar.setVisibilityAsync('hidden');
      } catch (e) {}
    }
    return () => {
      if (Platform.OS === 'android') {
        try {
          NavigationBar.setVisibilityAsync('visible');
          NavigationBar.setStyle('light');
        } catch (e) {}
      }
    };
  }, []);

  // Load stream, channels list, and favorites on mount
  useEffect(() => {
    initPlayer();
  }, [params.id, params.type]);

  const initPlayer = async () => {
    try {
      const active = await storage.getActiveAccount();
      if (!active) {
        router.replace('/login');
        return;
      }
      setAccount(active);

      if (params.type === 'movie') {
        const favs = await storage.getMovieFavorites();
        setIsFavorite(favs.includes(Number(params.id)));
      } else if (params.type === 'series') {
        const favs = await storage.getSeriesFavorites();
        setIsFavorite(favs.includes(Number(params.id)));
      } else {
        const favs = await storage.getFavorites();
        setIsFavorite(favs.includes(Number(params.id)));
      }

      // Check saved progress for resuming playback
      if (params.type === 'movie' || params.type === 'series') {
        const saved = await storage.getWatchProgress(params.id);
        if (saved && saved.positionSec > 10 && player) {
          try {
            player.currentTime = saved.positionSec;
          } catch (e) {}
        }
      }

      const client = new XtreamClient(active.serverUrl, active.username, active.password);

      // If Live, fetch channels for |< and >| navigation
      if (params.type === 'live' || !params.type) {
        const allChannels = await client.getLiveStreams();
        setChannelsList(allChannels || []);
      }

      loadStream(Number(params.id), active);
      fetchEpg(Number(params.id), client);
    } catch (err) {
      console.warn('Player init error:', err);
    }
  };

  const loadStream = async (streamId: number, targetAccount?: SavedAccount) => {
    const acc = targetAccount || account;
    if (!acc) return;
    setLoading(true);

    try {
      const settings = await storage.getSettings();
      const client = new XtreamClient(acc.serverUrl, acc.username, acc.password);

      let url = '';
      if (params.type === 'live' || !params.type) {
        url = client.getLiveStreamUrl(streamId, settings.streamFormat);
      } else if (params.type === 'movie') {
        url = client.getMovieStreamUrl(streamId, params.extension || 'mp4');
      } else if (params.type === 'series') {
        url = client.getEpisodeStreamUrl(streamId, params.extension || 'mp4');
      }

      setStreamUrl(url);
      setCurrentStreamId(streamId);

      if (player && url) {
        try {
          player.replace(url);
          player.play();
        } catch (e) {
          console.warn('Error replacing player source in loadStream:', e);
        }
      }
    } catch (err) {
      console.warn('Error resolving stream:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchEpg = async (streamId: number, clientInstance?: XtreamClient) => {
    if (params.type !== 'live') return;
    try {
      const cl = clientInstance || (account ? new XtreamClient(account.serverUrl, account.username, account.password) : null);
      if (!cl) return;
      const listings = await cl.getShortEpg(streamId);
      setEpgList(listings || []);
      if (listings && listings.length > 0) {
        setCurrentSubtitle(`Ao vivo · ${listings[0].title || 'Programação Ao Vivo'}`);
      }
    } catch (e) {
      // EPG might not be provided for this channel
    }
  };

  // Next / Previous Channel Switching (|◀ and ▶|)
  const handleNextChannel = () => {
    if (!channelsList || channelsList.length === 0) return;
    let currentIndex = channelsList.findIndex((c) => Number(c.stream_id) === Number(currentStreamId));
    if (currentIndex === -1) currentIndex = 0;
    const nextIndex = (currentIndex + 1) % channelsList.length;
    const nextChannel = channelsList[nextIndex];
    if (nextChannel) {
      switchToChannel(nextChannel);
    }
  };

  const handlePrevChannel = () => {
    if (!channelsList || channelsList.length === 0) return;
    let currentIndex = channelsList.findIndex((c) => Number(c.stream_id) === Number(currentStreamId));
    if (currentIndex === -1) currentIndex = 0;
    const prevIndex = (currentIndex - 1 + channelsList.length) % channelsList.length;
    const prevChannel = channelsList[prevIndex];
    if (prevChannel) {
      switchToChannel(prevChannel);
    }
  };

  const switchToChannel = async (channel: LiveChannel) => {
    setCurrentTitle(channel.name);
    setCurrentSubtitle('Ao vivo · Transmissão em Alta Definição');
    setCurrentStreamId(channel.stream_id);
    resetControlsTimer();

    // Check favorite state
    try {
      const favs = await storage.getFavorites();
      setIsFavorite(favs.includes(Number(channel.stream_id)));
    } catch (e) {}

    loadStream(channel.stream_id);

    if (account) {
      const client = new XtreamClient(account.serverUrl, account.username, account.password);
      fetchEpg(channel.stream_id, client);
    }
  };

  const handleToggleFavorite = async () => {
    if (params.type === 'movie') {
      const updated = await storage.toggleMovieFavorite(currentStreamId);
      setIsFavorite(updated.includes(currentStreamId));
    } else if (params.type === 'series') {
      const updated = await storage.toggleSeriesFavorite(currentStreamId);
      setIsFavorite(updated.includes(currentStreamId));
    } else {
      const updated = await storage.toggleFavorite(currentStreamId);
      setIsFavorite(updated.includes(currentStreamId));
    }
    resetControlsTimer();
  };

  // Salva periodicamente o progresso de reprodução para Filmes e Séries
  useEffect(() => {
    if (params.type !== 'movie' && params.type !== 'series') return;

    const saveCurrentProgress = () => {
      if (player && player.currentTime > 5 && player.duration > 0) {
        storage.saveWatchProgress({
          id: currentStreamId,
          title: currentTitle,
          poster: params.icon,
          type: params.type,
          positionSec: Math.floor(player.currentTime),
          durationSec: Math.floor(player.duration),
          extension: params.extension,
        });
      }
    };

    const interval = setInterval(saveCurrentProgress, 5000);

    return () => {
      clearInterval(interval);
      saveCurrentProgress();
    };
  }, [player, currentStreamId, currentTitle]);

  // Controls Visibility Timer
  const resetControlsTimer = () => {
    setControlsVisible(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      setControlsVisible(false);
    }, 5000);
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

  useEffect(() => {
    resetControlsTimer();
    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, []);

  const togglePlayPause = () => {
    if (!player) return;
    if (isPlaying) {
      player.pause();
    } else {
      player.play();
    }
    resetControlsTimer();
  };

  // Volume & Brightness PanResponder (ONLY vertical drags, NEVER blocks taps)
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
        const delta = -gesture.dy / 200; // 200px drag = 100% change
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
          if (player) {
            try {
              player.volume = next;
            } catch (e) {}
          }
          showGestureIndicator('volume', next);
        }
      },
      onPanResponderRelease: () => {
        setTimeout(() => {
          isDraggingRef.current = false;
        }, 100);
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

  return (
    <View style={styles.container} {...panResponder.panHandlers}>
      <StatusBar hidden={true} />

      {/* Video Surface */}
      {streamUrl ? (
        <VideoView
          style={styles.video}
          player={player}
          contentFit="contain"
          nativeControls={false}
          allowsPictureInPicture
        />
      ) : null}

      {/* Tap anywhere on screen to show/hide controls */}
      <Pressable style={styles.tapDetector} onPress={toggleControls} />

      {/* Brightness Dimmer Overlay (Gesture Control) */}
      <View
        pointerEvents="none"
        style={[
          styles.brightnessOverlay,
          { backgroundColor: `rgba(0,0,0,${(1 - brightness).toFixed(2)})` },
        ]}
      />

      {/* Floating Gesture HUD Indicator */}
      {gestureIndicator.visible ? (
        <View pointerEvents="none" style={styles.gestureIndicatorBox}>
          <Ionicons
            name={
              gestureIndicator.type === 'brightness'
                ? 'sunny'
                : gestureIndicator.value === 0
                ? 'volume-mute'
                : 'volume-high'
            }
            size={36}
            color="#FFA000"
          />
          <Text style={styles.gestureIndicatorText}>
            {gestureIndicator.type === 'brightness' ? 'Brilho' : 'Volume'}
          </Text>
          <View style={styles.gestureProgressBarTrack}>
            <View
              style={[
                styles.gestureProgressBarFill,
                { width: `${Math.round(gestureIndicator.value * 100)}%` },
              ]}
            />
          </View>
          <Text style={styles.gestureIndicatorPercent}>
            {Math.round(gestureIndicator.value * 100)}%
          </Text>
        </View>
      ) : null}

      {/* Loading Spinner */}
      {loading ? (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Conectando ao canal...</Text>
        </View>
      ) : null}

      {/* Interactive Controls Overlay - Matching Image 1 */}
      {controlsVisible ? (
        <View style={styles.controlsOverlay} pointerEvents="box-none">
          {/* Top Bar (Image 1 Style) */}
          <LinearGradient
            colors={['rgba(0,0,0,0.88)', 'rgba(0,0,0,0.5)', 'transparent']}
            style={styles.topGradient}
          >
            <View style={styles.topRow}>
              {/* Back button */}
              <Pressable
                style={styles.backBtn}
                onPress={() => {
                  if (player) player.pause();
                  router.back();
                }}
              >
                <Ionicons name="chevron-back" size={28} color="#fff" />
              </Pressable>

              {/* Channel Title & Live Subtitle */}
              <View style={styles.titleWrapper}>
                <View style={styles.titleLiveRow}>
                  <View style={styles.liveTag}>
                    <Text style={styles.liveTagText}>LIVE</Text>
                  </View>
                  <Text style={styles.channelTitle} numberOfLines={1}>
                    {currentTitle}
                  </Text>
                </View>
                <Text style={styles.channelSubtitle} numberOfLines={1}>
                  {currentSubtitle}
                </Text>
              </View>

              {/* Cast to TV Icon Button */}
              <Pressable
                style={styles.castBtn}
                onPress={() => {
                  resetControlsTimer();
                  Alert.alert(
                    'Transmitir para TV',
                    'Buscando dispositivos Chromecast e Smart TV na mesma rede Wi-Fi...'
                  );
                }}
              >
                <Ionicons name="tv-outline" size={24} color="#fff" />
              </Pressable>
            </View>
          </LinearGradient>

          {/* Center Controls (|◀, ⏸, ▶| - Image 1 Style) */}
          <View style={styles.centerControlsRow} pointerEvents="box-none">
            <Pressable style={styles.navChannelBtn} onPress={handlePrevChannel}>
              <Ionicons name="play-skip-back" size={32} color="#fff" />
            </Pressable>

            <Pressable style={styles.playPauseCircle} onPress={togglePlayPause}>
              <Ionicons name={isPlaying ? 'pause' : 'play'} size={44} color="#fff" />
            </Pressable>

            <Pressable style={styles.navChannelBtn} onPress={handleNextChannel}>
              <Ionicons name="play-skip-forward" size={32} color="#fff" />
            </Pressable>
          </View>

          {/* Bottom Bar (Image 1 Style: Yellow timeline + Canais, Programação, Favoritar) */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.6)', 'rgba(0,0,0,0.94)']}
            style={styles.bottomGradient}
          >
            {/* Yellow Timeline Bar */}
            <View style={styles.timelineRow}>
              <View style={styles.timelineBar}>
                <View style={styles.timelineFill} />
              </View>
              <Text style={styles.liveIndicatorText}>Ao vivo</Text>
            </View>

            {/* Bottom Action Buttons */}
            <View style={styles.bottomActionsRow}>
              {/* Canais Drawer Toggle */}
              <Pressable
                style={styles.actionBtn}
                onPress={() => {
                  resetControlsTimer();
                  setChannelsDrawerVisible(true);
                }}
              >
                <Ionicons name="list" size={18} color="#fff" />
                <Text style={styles.actionBtnText}>Canais</Text>
              </Pressable>

              {/* Programação (EPG) */}
              <Pressable
                style={styles.actionBtn}
                onPress={() => {
                  resetControlsTimer();
                  setEpgModalVisible(true);
                }}
              >
                <Ionicons name="calendar-outline" size={18} color="#fff" />
                <Text style={styles.actionBtnText}>Programação</Text>
              </Pressable>

              {/* Favoritar */}
              <Pressable style={styles.actionBtn} onPress={handleToggleFavorite}>
                <Ionicons
                  name={isFavorite ? 'star' : 'star-outline'}
                  size={18}
                  color={isFavorite ? '#FFD700' : '#fff'}
                />
                <Text style={styles.actionBtnText}>
                  {isFavorite ? 'Favoritado' : 'Favoritar'}
                </Text>
              </Pressable>
            </View>
          </LinearGradient>
        </View>
      ) : null}

      {/* Side Channels Drawer Modal */}
      <Modal
        visible={channelsDrawerVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setChannelsDrawerVisible(false)}
      >
        <View style={styles.drawerBackdrop}>
          <View style={styles.drawerContent}>
            <View style={styles.drawerHeader}>
              <Text style={styles.drawerTitle}>Lista de Canais</Text>
              <Pressable
                style={styles.drawerCloseBtn}
                onPress={() => setChannelsDrawerVisible(false)}
              >
                <Ionicons name="close" size={22} color="#fff" />
              </Pressable>
            </View>

            <FlatList
              data={channelsList}
              keyExtractor={(item) => String(item.stream_id)}
              renderItem={({ item }) => {
                const isActive = item.stream_id === currentStreamId;
                return (
                  <Pressable
                    style={[styles.drawerItem, isActive && styles.drawerItemActive]}
                    onPress={() => {
                      switchToChannel(item);
                      setChannelsDrawerVisible(false);
                    }}
                  >
                    <Text style={styles.drawerItemNum}>{item.num || item.stream_id}</Text>
                    <Text
                      style={[styles.drawerItemName, isActive && styles.drawerItemNameActive]}
                      numberOfLines={1}
                    >
                      {item.name}
                    </Text>
                  </Pressable>
                );
              }}
            />
          </View>
        </View>
      </Modal>

      {/* EPG Programação Modal */}
      <Modal
        visible={epgModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setEpgModalVisible(false)}
      >
        <View style={styles.epgModalBackdrop}>
          <View style={styles.epgModalContent}>
            <View style={styles.epgModalHeader}>
              <Text style={styles.epgModalTitle}>Guia de Programação</Text>
              <Pressable
                style={styles.drawerCloseBtn}
                onPress={() => setEpgModalVisible(false)}
              >
                <Ionicons name="close" size={22} color="#fff" />
              </Pressable>
            </View>

            {epgList.length === 0 ? (
              <View style={styles.epgEmptyBox}>
                <Ionicons name="information-circle-outline" size={32} color="#777" />
                <Text style={styles.epgEmptyText}>Nenhum guia EPG disponível para este canal.</Text>
              </View>
            ) : (
              <FlatList
                data={epgList}
                keyExtractor={(item, index) => item.id || String(index)}
                renderItem={({ item }) => (
                  <View style={styles.epgItem}>
                    <Text style={styles.epgTime}>
                      {item.start ? item.start.slice(11, 16) : ''} - {item.end ? item.end.slice(11, 16) : ''}
                    </Text>
                    <Text style={styles.epgTitle}>{item.title}</Text>
                    {item.description ? (
                      <Text style={styles.epgDesc}>{item.description}</Text>
                    ) : null}
                  </View>
                )}
              />
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    position: 'relative',
  },
  video: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  tapDetector: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1,
  },
  brightnessOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 2,
  },
  gestureIndicatorBox: {
    position: 'absolute',
    top: '35%',
    left: '40%',
    width: 140,
    padding: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#333',
    zIndex: 99,
  },
  gestureIndicatorText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  gestureProgressBarTrack: {
    width: '100%',
    height: 6,
    backgroundColor: '#333',
    borderRadius: 3,
    overflow: 'hidden',
  },
  gestureProgressBarFill: {
    height: '100%',
    backgroundColor: '#FFA000',
  },
  gestureIndicatorPercent: {
    color: '#FFA000',
    fontSize: 13,
    fontWeight: '800',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    zIndex: 3,
  },
  loadingText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  controlsOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'space-between',
    zIndex: 10,
  },
  topGradient: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 30,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backBtn: {
    padding: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
  },
  titleWrapper: {
    flex: 1,
  },
  titleLiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liveTag: {
    backgroundColor: '#E52D27',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  liveTagText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '900',
  },
  channelTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  channelSubtitle: {
    color: '#FFA000',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  castBtn: {
    padding: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
  },
  centerControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 48,
  },
  navChannelBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playPauseCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  bottomGradient: {
    paddingHorizontal: 24,
    paddingTop: 10,
    paddingBottom: 20,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  timelineBar: {
    flex: 1,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  timelineFill: {
    width: '100%',
    height: '100%',
    backgroundColor: '#FFA000',
  },
  liveIndicatorText: {
    color: '#FFA000',
    fontSize: 11,
    fontWeight: '800',
  },
  bottomActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 28,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 20,
  },
  actionBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  drawerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  drawerContent: {
    width: 300,
    height: '100%',
    backgroundColor: '#121218',
    padding: 16,
    borderRightWidth: 1,
    borderRightColor: '#262632',
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#20202c',
    marginBottom: 10,
  },
  drawerTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  drawerCloseBtn: {
    padding: 4,
  },
  drawerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#181822',
    gap: 12,
  },
  drawerItemActive: {
    backgroundColor: '#221b18',
    borderLeftWidth: 3,
    borderLeftColor: '#FFA000',
  },
  drawerItemNum: {
    color: '#777',
    fontSize: 12,
    width: 30,
  },
  drawerItemName: {
    color: '#ccc',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  drawerItemNameActive: {
    color: '#FFA000',
    fontWeight: '800',
  },
  epgModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  epgModalContent: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '80%',
    backgroundColor: '#14141c',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#262632',
  },
  epgModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#20202c',
    marginBottom: 10,
  },
  epgModalTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  epgEmptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    gap: 8,
  },
  epgEmptyText: {
    color: '#888',
    fontSize: 13,
  },
  epgItem: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e28',
  },
  epgTime: {
    color: '#FFA000',
    fontSize: 11,
    fontWeight: '700',
  },
  epgTitle: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  epgDesc: {
    color: '#888',
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
});
