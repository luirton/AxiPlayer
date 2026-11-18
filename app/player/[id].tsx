import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useVideoPlayer, VideoView, VideoSource } from 'expo-video';
import * as NavigationBar from 'expo-navigation-bar';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { colors } from '../../src/theme/colors';
import { storage, WatchProgressItem } from '../../src/services/storage';
import { XtreamClient } from '../../src/services/xtreamClient';
import { LiveChannel, EpgProgram, SavedAccount } from '../../src/types/iptv';
import { enrichMediaMetadata } from '../../src/services/metadataEnricher';

export default function PlayerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    id: string;
    type?: 'live' | 'movie' | 'series';
    title?: string;
    extension?: string;
    icon?: string;
    categoryName?: string;
    streamUrl?: string;
    startPosition?: string;
    seriesId?: string;
    seriesTitle?: string;
    seasonNum?: string;
    episodeNum?: string;
  }>();

  const isVod = params.type === 'movie' || params.type === 'series';

  const [account, setAccount] = useState<SavedAccount | null>(null);
  const [currentStreamId, setCurrentStreamId] = useState<number>(Number(params.id));
  const [currentTitle, setCurrentTitle] = useState<string>(params.title || '');
  const [currentIcon, setCurrentIcon] = useState<string>(params.icon || '');
  const [currentSubtitle, setCurrentSubtitle] = useState<string>(
    isVod ? 'Reprodução de Vídeo' : 'Ao vivo · Transmissão em Alta Definição'
  );
  const [streamUrl, setStreamUrl] = useState<string>('');
  const [videoSource, setVideoSource] = useState<VideoSource | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [controlsVisible, setControlsVisible] = useState<boolean>(true);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isFavorite, setIsFavorite] = useState<boolean>(false);
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [aspectRatio, setAspectRatio] = useState<'contain' | 'cover' | 'fill'>('contain');

  // VOD Progress & Seeking state
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [isScrubbing, setIsScrubbing] = useState<boolean>(false);
  const [scrubPosition, setScrubPosition] = useState<number>(0); // 0.0 to 1.0

  // Seeking feedback flash (+10s or -10s)
  const [seekFlash, setSeekFlash] = useState<{ type: 'fwd' | 'rwd'; visible: boolean }>({
    type: 'fwd',
    visible: false,
  });
  const seekFlashTimeoutRef = useRef<any>(null);

  // Channels for switching Next/Previous and Channel Drawer (Live Mode)
  const [channelsList, setChannelsList] = useState<LiveChannel[]>([]);
  const [channelsDrawerVisible, setChannelsDrawerVisible] = useState<boolean>(false);
  const [channelSearchQuery, setChannelSearchQuery] = useState<string>('');

  // EPG Programação State
  const [currentProgram, setCurrentProgram] = useState<EpgProgram | null>(null);
  const [nextProgram, setNextProgram] = useState<EpgProgram | null>(null);
  const [epgList, setEpgList] = useState<EpgProgram[]>([]);

  // VOD Details Info Modal (Image 1 Info Icon)
  const [vodInfo, setVodInfo] = useState<any | null>(null);
  const [infoModalVisible, setInfoModalVisible] = useState<boolean>(false);

  // Subtitles & Audio Track Modals (Image 1 Card & Audio Icons)
  const [subtitlesModalVisible, setSubtitlesModalVisible] = useState<boolean>(false);
  const [audioModalVisible, setAudioModalVisible] = useState<boolean>(false);
  const [availableSubtitles, setAvailableSubtitles] = useState<any[]>([]);
  const [selectedSubtitleId, setSelectedSubtitleId] = useState<string | null>(null);
  const [availableAudios, setAvailableAudios] = useState<any[]>([]);
  const [selectedAudioId, setSelectedAudioId] = useState<string | null>(null);

  // Brightness & Volume Gestures state
  const [brightness, setBrightness] = useState<number>(1.0); // 0.15 to 1.0
  const [volume, setVolume] = useState<number>(1.0); // 0.0 to 1.0
  const [gestureIndicator, setGestureIndicator] = useState<{
    type: 'brightness' | 'volume';
    value: number;
    visible: boolean;
  }>({ type: 'volume', value: 1.0, visible: false });

  // Stream format fallback state (e.g. m3u8 <-> ts for live, mp4 <-> mkv for VOD)
  const currentFormatRef = useRef<string>(params.extension || (isVod ? 'mp4' : 'm3u8'));
  const fallbackAttemptedRef = useRef<boolean>(false);
  const loadingWatchdogRef = useRef<any>(null);

  const currentBrightnessRef = useRef(brightness);
  const currentVolumeRef = useRef(volume);
  const gestureStartXRef = useRef(0);
  const gestureStartYValueRef = useRef(0);
  const isDraggingRef = useRef(false);

  currentBrightnessRef.current = brightness;
  currentVolumeRef.current = volume;

  const controlsTimeoutRef = useRef<any>(null);
  const gestureHideTimeoutRef = useRef<any>(null);
  const seekbarWidthRef = useRef<number>(0);
  const seekbarStartLocationXRef = useRef<number>(0);

  // Video Player instance linked to videoSource state (sem p.play() no mount com source null)
  const player = useVideoPlayer(videoSource, (p) => {
    p.loop = false;
    p.timeUpdateEventInterval = 0.5;
  });

  // Track player events
  useEffect(() => {
    if (!player) return;

    const playingSub = player.addListener('playingChange', (event) => {
      setIsPlaying(event.isPlaying);
      if (event.isPlaying) {
        setLoading(false);
        setErrorMessage(null);
        if (loadingWatchdogRef.current) clearTimeout(loadingWatchdogRef.current);
      }
    });

    const timeSub = player.addListener('timeUpdate', (event) => {
      if (event.currentTime > 0) {
        setLoading(false);
        setErrorMessage(null);
        if (loadingWatchdogRef.current) clearTimeout(loadingWatchdogRef.current);
      }
      if (!isScrubbing) {
        setCurrentTime(event.currentTime);
        if (player.duration > 0) {
          setDuration(player.duration);
        }
      }
    });

    const statusSub = player.addListener('statusChange', (event) => {
      if (event.status === 'readyToPlay') {
        setLoading(false);
        setErrorMessage(null);
        if (loadingWatchdogRef.current) clearTimeout(loadingWatchdogRef.current);
        // Refresh available audio and subtitle tracks
        try {
          if (player.availableSubtitleTracks) {
            setAvailableSubtitles(player.availableSubtitleTracks);
          }
          if (player.availableAudioTracks) {
            setAvailableAudios(player.availableAudioTracks);
          }
        } catch (e) {}
      } else if (event.status === 'error') {
        if (!videoSource) return;
        handleStreamErrorFallback();
      }
    });

    return () => {
      playingSub.remove();
      timeSub.remove();
      statusSub.remove();
      if (loadingWatchdogRef.current) clearTimeout(loadingWatchdogRef.current);
    };
  }, [player, isScrubbing]);

  // Fullscreen Immersive Mode: Hides Android status bar and system buttons
  useEffect(() => {
    StatusBar.setHidden(true, 'none');
    if (Platform.OS === 'android') {
      try {
        NavigationBar.setVisibilityAsync('hidden');
      } catch (e) {}
    }
    return () => {
      StatusBar.setHidden(false, 'none');
      if (Platform.OS === 'android') {
        try {
          NavigationBar.setVisibilityAsync('visible');
          NavigationBar.setStyle('light');
        } catch (e) {}
      }
    };
  }, []);

  // Load stream, account, channels list, and favorites on mount
  useEffect(() => {
    fallbackAttemptedRef.current = false;
    initPlayer();
  }, [params.id, params.type]);

  const initPlayer = async () => {
    try {
      setErrorMessage(null);
      const active = await storage.getActiveAccount();
      if (!active) {
        router.replace('/login');
        return;
      }
      setAccount(active);

      // Check favorite status
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

      const client = new XtreamClient(active.serverUrl, active.username, active.password);

      // Start loading stream immediately without blocking on metadata
      loadStream(Number(params.id), active);

      // Concurrently fetch VOD Info in background for exact container extension & details
      if (params.type === 'movie') {
        client.getVodInfo(Number(params.id)).then((info) => {
          if (info) {
            setVodInfo(info);
            const detectedExt = info?.movie_data?.container_extension;
            if (detectedExt && detectedExt !== currentFormatRef.current) {
              currentFormatRef.current = detectedExt;
            }
          }
        }).catch((e) => console.warn('getVodInfo background error:', e));
      }

      // Poster & metadata enrichment fallback if image is missing from IPTV list
      if (isVod && (!params.icon || params.icon.trim() === '')) {
        enrichMediaMetadata(params.title || currentTitle, params.type === 'series' ? 'series' : 'movie').then((meta) => {
          if (meta?.poster) {
            setCurrentIcon(meta.poster);
          }
          if (meta?.plot) {
            setVodInfo((prev: any) => ({
              ...prev,
              info: {
                ...(prev?.info || {}),
                plot: meta.plot,
                genre: meta.genre || prev?.info?.genre,
                rating: meta.rating || prev?.info?.rating,
                releasedate: meta.year || prev?.info?.releasedate,
              },
            }));
          }
        }).catch(() => {});
      }

      // If Live, fetch channels for |◀ and ▶| navigation
      if (params.type === 'live' || !params.type) {
        client.getLiveStreams().then((allChannels) => {
          setChannelsList(allChannels || []);
        }).catch(() => {});
      }

      fetchEpg(Number(params.id), client);
    } catch (err) {
      console.warn('Player init error:', err);
      setErrorMessage('Falha ao inicializar o player.');
      setLoading(false);
    }
  };

  const loadStream = async (streamId: number, targetAccount?: SavedAccount, customExtension?: string) => {
    const acc = targetAccount || account;
    if (!acc) return;
    setLoading(true);
    setErrorMessage(null);

    // Watchdog timer: If loading takes longer than 10 seconds, trigger fallback automatically
    if (loadingWatchdogRef.current) clearTimeout(loadingWatchdogRef.current);
    loadingWatchdogRef.current = setTimeout(() => {
      handleStreamErrorFallback();
    }, 10000);

    try {
      const settings = await storage.getSettings();
      const client = new XtreamClient(acc.serverUrl, acc.username, acc.password);

      let url = params.streamUrl || '';
      let savedProgress: WatchProgressItem | null = null;
      if (isVod) {
        savedProgress = await storage.getWatchProgress(streamId, params.title || currentTitle);
        if (!savedProgress && params.seriesId) {
          savedProgress = await storage.getWatchProgress(params.seriesId, params.seriesTitle || params.title);
        }
        if (!url && savedProgress?.streamUrl) {
          url = savedProgress.streamUrl;
          if (savedProgress.extension) {
            currentFormatRef.current = savedProgress.extension;
          }
        }
      }

      if (!url) {
        if (params.type === 'live' || !params.type) {
          const format = customExtension || settings.streamFormat || 'm3u8';
          currentFormatRef.current = format;
          url = client.getLiveStreamUrl(streamId, format as 'ts' | 'm3u8');
        } else if (params.type === 'movie') {
          const ext = customExtension || currentFormatRef.current || params.extension || 'mp4';
          currentFormatRef.current = ext;
          url = client.getMovieStreamUrl(streamId, ext);
        } else if (params.type === 'series') {
          const ext = customExtension || currentFormatRef.current || params.extension || 'mp4';
          currentFormatRef.current = ext;
          url = client.getEpisodeStreamUrl(streamId, ext);
        }
      }

      setStreamUrl(url);
      setCurrentStreamId(streamId);

      const nextSource: VideoSource = {
        uri: url,
        headers: {
          'User-Agent': 'IPTVSmartersPro/1.0.0 (Linux; Android; Mobile; Exoplayer)',
          'Accept': '*/*',
        },
      };

      setVideoSource(nextSource);

      if (player) {
        try {
          player.replace(nextSource);
          player.play();

          // Restore watch progress for Movies / Series usando startPosition ou progresso salvo
          if (isVod) {
            const targetPos = params.startPosition ? Number(params.startPosition) : (savedProgress?.positionSec || 0);
            if (targetPos > 2) {
              setTimeout(() => {
                try {
                  player.currentTime = targetPos;
                  setCurrentTime(targetPos);
                } catch (e) {}
              }, 400);
            }
          }
        } catch (e) {
          console.warn('Error replacing player source in loadStream:', e);
          handleStreamErrorFallback();
        }
      }
    } catch (err) {
      console.warn('Error resolving stream:', err);
      handleStreamErrorFallback();
    }
  };

  // Automatic Fallback Engine:
  // If Live m3u8 fails, auto-fallback to ts (and vice-versa).
  // If Movie/Series mp4 fails, auto-fallback to mkv (and vice-versa).
  const handleStreamErrorFallback = () => {
    if (fallbackAttemptedRef.current) {
      if (loadingWatchdogRef.current) clearTimeout(loadingWatchdogRef.current);
      setLoading(false);
      setErrorMessage('Não foi possível carregar a transmissão. O link pode estar indisponível no servidor.');
      return;
    }
    fallbackAttemptedRef.current = true;

    if (params.type === 'live' || !params.type) {
      const current = currentFormatRef.current;
      const fallback = current === 'm3u8' ? 'ts' : 'm3u8';
      loadStream(currentStreamId, account || undefined, fallback);
    } else if (isVod) {
      const current = currentFormatRef.current;
      const fallback = current.toLowerCase() === 'mp4' ? 'mkv' : 'mp4';
      loadStream(currentStreamId, account || undefined, fallback);
    }
  };

  const fetchEpg = async (streamId: number, clientInstance?: XtreamClient) => {
    if (params.type !== 'live' && params.type) return;
    try {
      const cl = clientInstance || (account ? new XtreamClient(account.serverUrl, account.username, account.password) : null);
      if (!cl) return;
      const listings = await cl.getShortEpg(streamId);
      setEpgList(listings || []);
      if (listings && listings.length > 0) {
        setCurrentProgram(listings[0]);
        if (listings.length > 1) {
          setNextProgram(listings[1]);
        } else {
          setNextProgram(null);
        }
        setCurrentSubtitle(`Ao vivo · ${listings[0].title || 'Programação Ao Vivo'}`);
      } else {
        setCurrentProgram(null);
        setNextProgram(null);
      }
    } catch (e) {
      // EPG might not be provided for this channel
    }
  };

  // Live Channel Switching (|◀ and ▶| - Image 2 Style)
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
    fallbackAttemptedRef.current = false;
    setCurrentTitle(channel.name);
    setCurrentIcon(channel.stream_icon || '');
    setCurrentSubtitle('Ao vivo · Transmissão em Alta Definição');
    setCurrentStreamId(channel.stream_id);
    resetControlsTimer();

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

  // VOD Seek Controls (-10s, +10s, and Scrubber - Image 1 Style)
  const handleRewind10 = () => {
    if (!player) return;
    const cur = player.currentTime || currentTime || 0;
    const target = Math.max(0, cur - 10);
    player.currentTime = target;
    setCurrentTime(target);
    triggerSeekFlash('rwd');
    resetControlsTimer();
  };

  const handleForward10 = () => {
    if (!player) return;
    const cur = player.currentTime || currentTime || 0;
    const dur = player.duration || duration || 0;
    const target = Math.min(dur > 0 ? dur : cur + 10, cur + 10);
    player.currentTime = target;
    setCurrentTime(target);
    triggerSeekFlash('fwd');
    resetControlsTimer();
  };

  const triggerSeekFlash = (type: 'fwd' | 'rwd') => {
    if (seekFlashTimeoutRef.current) clearTimeout(seekFlashTimeoutRef.current);
    setSeekFlash({ type, visible: true });
    seekFlashTimeoutRef.current = setTimeout(() => {
      setSeekFlash((prev) => ({ ...prev, visible: false }));
    }, 700);
  };

  // Seekbar PanResponder for touch & drag seeking
  const seekbarPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderGrant: (evt) => {
        isDraggingRef.current = true;
        setIsScrubbing(true);
        resetControlsTimer();
        const startX = evt.nativeEvent.locationX;
        seekbarStartLocationXRef.current = startX;
        updateScrubFromLocation(startX);
      },
      onPanResponderMove: (_, gesture) => {
        const currentX = seekbarStartLocationXRef.current + gesture.dx;
        updateScrubFromLocation(currentX);
      },
      onPanResponderRelease: (_, gesture) => {
        const totalDuration = player?.duration || duration || 0;
        if (seekbarWidthRef.current > 0 && totalDuration > 0) {
          const currentX = seekbarStartLocationXRef.current + gesture.dx;
          const ratio = Math.max(0, Math.min(1.0, currentX / seekbarWidthRef.current));
          const targetTime = ratio * totalDuration;
          if (player) {
            try {
              player.currentTime = targetTime;
            } catch (e) {}
          }
          setCurrentTime(targetTime);
        }
        setIsScrubbing(false);
        setTimeout(() => {
          isDraggingRef.current = false;
        }, 120);
        resetControlsTimer();
      },
      onPanResponderTerminate: () => {
        setIsScrubbing(false);
        isDraggingRef.current = false;
      },
    })
  ).current;

  const updateScrubFromLocation = (x: number) => {
    if (seekbarWidthRef.current <= 0) return;
    const ratio = Math.max(0, Math.min(1.0, x / seekbarWidthRef.current));
    setScrubPosition(ratio);
    const totalDuration = player?.duration || duration || 0;
    setCurrentTime(ratio * totalDuration);
  };

  // Aspect Ratio Toggle: Cycles contain -> cover -> fill -> contain
  const handleToggleAspectRatio = () => {
    setAspectRatio((prev) => {
      if (prev === 'contain') return 'cover';
      if (prev === 'cover') return 'fill';
      return 'contain';
    });
    resetControlsTimer();
  };

  // Subtitle Selection
  const handleSelectSubtitle = (subTrack: any | null) => {
    if (!player) return;
    try {
      player.subtitleTrack = subTrack;
      setSelectedSubtitleId(subTrack?.id || null);
    } catch (e) {}
    setSubtitlesModalVisible(false);
  };

  // Audio Track Selection
  const handleSelectAudio = (audioTrack: any) => {
    if (!player) return;
    try {
      player.audioTrack = audioTrack;
      setSelectedAudioId(audioTrack?.id || null);
    } catch (e) {}
    setAudioModalVisible(false);
  };

  // Favorite Toggle
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

  // Save Watch Progress for Movies & Series com o link que deu certo
  useEffect(() => {
    if (!isVod) return;

    const saveCurrentProgress = () => {
      if (player && player.currentTime > 5 && player.duration > 0) {
        storage.saveWatchProgress({
          id: currentStreamId,
          title: currentTitle,
          poster: currentIcon || params.icon,
          type: params.type || 'movie',
          positionSec: Math.floor(player.currentTime),
          durationSec: Math.floor(player.duration),
          extension: currentFormatRef.current || params.extension,
          streamUrl: streamUrl || undefined,
          seriesId: params.seriesId ? String(params.seriesId) : undefined,
          seriesTitle: params.seriesTitle || undefined,
          seasonNum: params.seasonNum ? Number(params.seasonNum) : undefined,
          episodeNum: params.episodeNum ? Number(params.episodeNum) : undefined,
        });
      }
    };

    const interval = setInterval(saveCurrentProgress, 5000);
    return () => {
      clearInterval(interval);
      saveCurrentProgress();
    };
  }, [player, currentStreamId, currentTitle, isVod, streamUrl, params]);

  // Controls Visibility Auto-hide Timer
  const resetControlsTimer = () => {
    if (isLocked) return;
    setControlsVisible(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      setControlsVisible(false);
    }, 5000);
  };

  const toggleControls = () => {
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

  useEffect(() => {
    resetControlsTimer();
    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, [isLocked]);

  const togglePlayPause = () => {
    if (!player) return;
    if (isPlaying) {
      player.pause();
    } else {
      player.play();
    }
    resetControlsTimer();
  };

  // Screen Gesture PanResponder (vertical swipe for brightness/volume)
  const screenPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_, gesture) => {
        if (isLocked) return false;
        return Math.abs(gesture.dy) > 15 && Math.abs(gesture.dy) > Math.abs(gesture.dx);
      },
      onMoveShouldSetPanResponderCapture: (_, gesture) => {
        if (isLocked) return false;
        return Math.abs(gesture.dy) > 15 && Math.abs(gesture.dy) > Math.abs(gesture.dx);
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

  // Time format helper (00:28 or 01:46:44)
  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds) || seconds < 0) return '00:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hrs > 0) {
      return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Calculate seekbar percentage for VOD
  const effectiveDuration = player?.duration || duration || 0;
  const currentProgressPercent = effectiveDuration > 0
    ? (isScrubbing ? scrubPosition : Math.max(0, Math.min(1.0, currentTime / effectiveDuration))) * 100
    : 0;

  // Filter channels in Live drawer
  const filteredChannels = channelsList.filter((c) =>
    (c.name || '').toLowerCase().includes(channelSearchQuery.toLowerCase())
  );

  return (
    <View style={styles.container} {...screenPanResponder.panHandlers}>
      <ExpoStatusBar hidden={true} style="light" />

      {/* Video Surface */}
      {videoSource ? (
        <VideoView
          style={styles.video}
          player={player}
          contentFit={aspectRatio}
          nativeControls={false}
          allowsPictureInPicture
        />
      ) : null}

      {/* Full-screen tap detector - Always allows bringing controls back */}
      <Pressable style={StyleSheet.absoluteFill} onPress={toggleControls} />

      {/* Brightness Dimmer Overlay */}
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
            color={colors.primary}
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

      {/* Seek Flash Feedback (+10s or -10s) */}
      {seekFlash.visible ? (
        <View pointerEvents="none" style={styles.seekFlashBox}>
          <Ionicons
            name={seekFlash.type === 'fwd' ? 'arrow-redo' : 'arrow-undo'}
            size={40}
            color="#fff"
          />
          <Text style={styles.seekFlashText}>
            {seekFlash.type === 'fwd' ? '+10s' : '-10s'}
          </Text>
        </View>
      ) : null}

      {/* Loading Spinner - Non-blocking pointerEvents so taps always pass through */}
      {loading ? (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>
            {isVod ? 'Carregando vídeo...' : 'Conectando ao canal...'}
          </Text>
        </View>
      ) : null}

      {/* Error Overlay with Retry and Back buttons */}
      {errorMessage ? (
        <View style={styles.errorOverlay}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.warning} />
          <Text style={styles.errorTitle}>Não foi possível reproduzir</Text>
          <Text style={styles.errorSub}>{errorMessage}</Text>
          <View style={styles.errorActionsRow}>
            <Pressable
              style={styles.errorRetryBtn}
              onPress={() => {
                fallbackAttemptedRef.current = false;
                initPlayer();
              }}
            >
              <Ionicons name="refresh" size={18} color="#000" />
              <Text style={styles.errorRetryText}>Tentar Novamente</Text>
            </Pressable>
            <Pressable
              style={styles.errorBackBtn}
              onPress={() => router.back()}
            >
              <Text style={styles.errorBackText}>Voltar</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

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

      {/* Interactive Controls Overlay */}
      {controlsVisible && !isLocked ? (
        <View style={styles.controlsOverlay} pointerEvents="box-none">
          {/* Top Bar (Image 1 for VOD, Image 2 for Live) */}
          <LinearGradient
            colors={['rgba(0,0,0,0.85)', 'rgba(0,0,0,0.4)', 'transparent']}
            style={styles.topGradient}
          >
            <View style={styles.topRow}>
              {/* Back Button */}
              <Pressable
                style={styles.topIconBtn}
                onPress={() => {
                  if (player) player.pause();
                  router.back();
                }}
                hitSlop={12}
              >
                <Ionicons name="chevron-back" size={28} color="#fff" />
              </Pressable>

              {/* Title Header */}
              {isVod ? (
                /* VOD: Title centered cleanly (Image 1 Style) */
                <View style={styles.vodTitleContainer}>
                  <Text style={styles.vodTitleText} numberOfLines={1}>
                    {currentTitle || params.title || 'Filme'}
                  </Text>
                </View>
              ) : (
                /* Live: Center is completely empty per Image 2 & 3 layout */
                <View style={{ flex: 1 }} />
              )}

              {/* Top Right Action Icons */}
              <View style={styles.topRightIconsRow}>
                {isVod ? (
                  /* VOD Mode Icons (Image 1: Info, Heart, Card/CC, Audio, AspectRatio) */
                  <>
                    {/* 1. Info Button */}
                    <Pressable
                      style={styles.topActionIconBtn}
                      onPress={() => {
                        resetControlsTimer();
                        setInfoModalVisible(true);
                      }}
                      hitSlop={10}
                    >
                      <Ionicons name="information-circle-outline" size={24} color="#fff" />
                    </Pressable>

                    {/* 2. Favorite Button */}
                    <Pressable
                      style={styles.topActionIconBtn}
                      onPress={handleToggleFavorite}
                      hitSlop={10}
                    >
                      <Ionicons
                        name={isFavorite ? 'heart' : 'heart-outline'}
                        size={24}
                        color={isFavorite ? '#FF3B30' : '#fff'}
                      />
                    </Pressable>

                    {/* 3. Subtitles / CC Button (Card outline icon from Image 1) */}
                    <Pressable
                      style={styles.topActionIconBtn}
                      onPress={() => {
                        resetControlsTimer();
                        setSubtitlesModalVisible(true);
                      }}
                      hitSlop={10}
                    >
                      <Ionicons name="card-outline" size={23} color="#fff" />
                    </Pressable>

                    {/* 4. Audio Track Button */}
                    <Pressable
                      style={styles.topActionIconBtn}
                      onPress={() => {
                        resetControlsTimer();
                        setAudioModalVisible(true);
                      }}
                      hitSlop={10}
                    >
                      <Ionicons name="musical-notes-outline" size={23} color="#fff" />
                    </Pressable>

                    {/* 5. Aspect Ratio Resize Button */}
                    <Pressable
                      style={styles.topActionIconBtn}
                      onPress={handleToggleAspectRatio}
                      hitSlop={10}
                    >
                      <Ionicons name="scan-outline" size={23} color="#fff" />
                    </Pressable>
                  </>
                ) : (
                  /* Live Mode Icons (Image 2 & 3: Channels Server, Heart, Lock, Search, AspectRatio) */
                  <>
                    {/* 1. Channels Drawer List */}
                    <Pressable
                      style={styles.topActionIconBtn}
                      onPress={() => {
                        resetControlsTimer();
                        setChannelsDrawerVisible(true);
                      }}
                      hitSlop={10}
                    >
                      <Ionicons name="server-outline" size={24} color="#fff" />
                    </Pressable>

                    {/* 2. Favorite Button */}
                    <Pressable
                      style={styles.topActionIconBtn}
                      onPress={handleToggleFavorite}
                      hitSlop={10}
                    >
                      <Ionicons
                        name={isFavorite ? 'heart' : 'heart-outline'}
                        size={24}
                        color={isFavorite ? '#FF3B30' : '#fff'}
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

                    {/* 4. Search Channel Button (Image 2 & 3) */}
                    <Pressable
                      style={styles.topActionIconBtn}
                      onPress={() => {
                        resetControlsTimer();
                        setChannelsDrawerVisible(true);
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
                  </>
                )}
              </View>
            </View>
          </LinearGradient>

          {/* Left Vertical Brightness Slider (Image 1 & 2 Style) */}
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

          {/* Right Vertical Volume Slider (Image 1 & 2 Style) */}
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

          {/* Center Playback Controls (Image 1: -10s, ⏸/▶, +10s | Image 2: |◀, ⏸/▶, ▶|) */}
          <View style={styles.centerControlsRow} pointerEvents="box-none">
            {isVod ? (
              /* VOD: Rewind 10s (Image 1) */
              <Pressable style={styles.seekStepBtn} onPress={handleRewind10} hitSlop={12}>
                <Ionicons name="arrow-undo" size={28} color="#fff" />
                <Text style={styles.seekStepText}>10</Text>
              </Pressable>
            ) : (
              /* Live: Previous Channel (Image 2) */
              <Pressable style={styles.seekStepBtn} onPress={handlePrevChannel} hitSlop={12}>
                <Ionicons name="play-skip-back" size={28} color="#fff" />
              </Pressable>
            )}

            {/* Large Center Play / Pause Button */}
            <Pressable style={styles.playPauseCircle} onPress={togglePlayPause} hitSlop={12}>
              <Ionicons name={isPlaying ? 'pause' : 'play'} size={42} color="#fff" />
            </Pressable>

            {isVod ? (
              /* VOD: Forward 10s (Image 1) */
              <Pressable style={styles.seekStepBtn} onPress={handleForward10} hitSlop={12}>
                <Ionicons name="arrow-redo" size={28} color="#fff" />
                <Text style={styles.seekStepText}>10</Text>
              </Pressable>
            ) : (
              /* Live: Next Channel (Image 2) */
              <Pressable style={styles.seekStepBtn} onPress={handleNextChannel} hitSlop={12}>
                <Ionicons name="play-skip-forward" size={28} color="#fff" />
              </Pressable>
            )}
          </View>

          {/* Bottom Bar: VOD Seekbar (Image 1) vs Live TV Info Card (Image 2) */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.6)', 'rgba(0,0,0,0.95)']}
            style={styles.bottomGradient}
          >
            {isVod ? (
              /* Image 1: VOD Seekbar with Current Time and Total Duration */
              <View style={styles.vodSeekbarContainer}>
                {/* Current Timestamp */}
                <Text style={styles.timeText}>{formatTime(currentTime)}</Text>

                {/* Interactive Seekbar / Scrubber Slider */}
                <View
                  style={styles.seekbarTrackBox}
                  onLayout={(e) => {
                    seekbarWidthRef.current = e.nativeEvent.layout.width;
                  }}
                  {...seekbarPanResponder.panHandlers}
                >
                  <View style={styles.seekbarBackgroundTrack}>
                    <View
                      style={[
                        styles.seekbarProgressFill,
                        { width: `${currentProgressPercent}%` },
                      ]}
                    />
                  </View>
                  {/* Distinct Thumb Knob (Blue/Cyan dot - Image 1 Style) */}
                  <View
                    style={[
                      styles.seekbarThumb,
                      { left: `${Math.max(0, Math.min(98, currentProgressPercent - 1))}%` },
                    ]}
                  />
                </View>

                {/* Total Duration Timestamp */}
                <Text style={styles.timeText}>
                  {formatTime(effectiveDuration)}
                </Text>
              </View>
            ) : (
              /* Image 2 & 3: Live Channel Information Card with EPG & Status */
              <View style={styles.liveBottomCard}>
                <View style={styles.liveBottomContentRow}>
                  {/* Channel Logo in White Box (Image 2 & 3) */}
                  <View style={styles.liveChannelLogoBox}>
                    {currentIcon ? (
                      <Image
                        source={{ uri: currentIcon }}
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
                      {currentTitle}
                    </Text>
                    {currentProgram ? (
                      <Text style={styles.liveProgramTitle} numberOfLines={1}>
                        {currentProgram.start ? currentProgram.start.slice(11, 16) + ' ' : ''}
                        {currentProgram.title}
                      </Text>
                    ) : (
                      <Text style={styles.liveProgramTitle} numberOfLines={1}>
                        {currentSubtitle}
                      </Text>
                    )}
                  </View>

                  {/* Right Side: Next Program & Live Badge */}
                  <View style={styles.liveStatusBox}>
                    {nextProgram ? (
                      <Text style={styles.liveNextProgramText} numberOfLines={1}>
                        {nextProgram.start ? nextProgram.start.slice(11, 16) + ' ' : ''}
                        {nextProgram.title}
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
            )}
          </LinearGradient>
        </View>
      ) : null}

      {/* VOD Movie/Series Details Modal (Image 1 Info Icon) */}
      <Modal
        visible={infoModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setInfoModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle} numberOfLines={1}>
                {vodInfo?.movie_data?.name || currentTitle}
              </Text>
              <Pressable onPress={() => setInfoModalVisible(false)} hitSlop={8}>
                <Ionicons name="close" size={24} color="#fff" />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={styles.modalScrollView}>
              <View style={styles.modalMetaRow}>
                {vodInfo?.info?.rating ? (
                  <View style={styles.modalBadge}>
                    <Ionicons name="star" size={12} color="#FFD700" />
                    <Text style={styles.modalBadgeText}>{vodInfo.info.rating}</Text>
                  </View>
                ) : null}
                {vodInfo?.info?.releasedate ? (
                  <Text style={styles.modalMetaText}>
                    {vodInfo.info.releasedate.slice(0, 4)}
                  </Text>
                ) : null}
                {vodInfo?.info?.genre ? (
                  <Text style={styles.modalMetaText}>{vodInfo.info.genre}</Text>
                ) : null}
                {vodInfo?.info?.duration ? (
                  <Text style={styles.modalMetaText}>{vodInfo.info.duration}</Text>
                ) : null}
              </View>

              <Text style={styles.modalPlotText}>
                {vodInfo?.info?.plot ||
                  vodInfo?.movie_data?.plot ||
                  'Nenhuma sinopse disponível para este título.'}
              </Text>

              {vodInfo?.info?.cast ? (
                <Text style={styles.modalCreditsText}>
                  <Text style={styles.creditsBold}>Elenco: </Text>
                  {vodInfo.info.cast}
                </Text>
              ) : null}

              {vodInfo?.info?.director ? (
                <Text style={styles.modalCreditsText}>
                  <Text style={styles.creditsBold}>Direção: </Text>
                  {vodInfo.info.director}
                </Text>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Subtitles Selection Modal (Image 1 Subtitle Icon) */}
      <Modal
        visible={subtitlesModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSubtitlesModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCardSmall}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Legendas</Text>
              <Pressable onPress={() => setSubtitlesModalVisible(false)} hitSlop={8}>
                <Ionicons name="close" size={24} color="#fff" />
              </Pressable>
            </View>

            <Pressable
              style={[
                styles.modalOptionItem,
                !selectedSubtitleId && styles.modalOptionItemActive,
              ]}
              onPress={() => handleSelectSubtitle(null)}
            >
              <Text style={styles.modalOptionText}>Desativar Legendas</Text>
              {!selectedSubtitleId ? (
                <Ionicons name="checkmark" size={20} color={colors.primary} />
              ) : null}
            </Pressable>

            {availableSubtitles.length === 0 ? (
              <Text style={styles.modalEmptyText}>
                Nenhuma faixa de legenda adicional detectada nesta mídia.
              </Text>
            ) : (
              availableSubtitles.map((sub, idx) => (
                <Pressable
                  key={sub.id || String(idx)}
                  style={[
                    styles.modalOptionItem,
                    selectedSubtitleId === sub.id && styles.modalOptionItemActive,
                  ]}
                  onPress={() => handleSelectSubtitle(sub)}
                >
                  <Text style={styles.modalOptionText}>
                    {sub.label || sub.language || `Legenda ${idx + 1}`}
                  </Text>
                  {selectedSubtitleId === sub.id ? (
                    <Ionicons name="checkmark" size={20} color={colors.primary} />
                  ) : null}
                </Pressable>
              ))
            )}
          </View>
        </View>
      </Modal>

      {/* Audio Track Selection Modal (Image 1 Audio Icon) */}
      <Modal
        visible={audioModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setAudioModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCardSmall}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Áudio / Idioma</Text>
              <Pressable onPress={() => setAudioModalVisible(false)} hitSlop={8}>
                <Ionicons name="close" size={24} color="#fff" />
              </Pressable>
            </View>

            {availableAudios.length === 0 ? (
              <Text style={styles.modalEmptyText}>
                Áudio padrão em reprodução (faixa única).
              </Text>
            ) : (
              availableAudios.map((aud, idx) => (
                <Pressable
                  key={aud.id || String(idx)}
                  style={[
                    styles.modalOptionItem,
                    selectedAudioId === aud.id && styles.modalOptionItemActive,
                  ]}
                  onPress={() => handleSelectAudio(aud)}
                >
                  <Text style={styles.modalOptionText}>
                    {aud.label || aud.language || `Áudio ${idx + 1}`}
                  </Text>
                  {selectedAudioId === aud.id ? (
                    <Ionicons name="checkmark" size={20} color={colors.primary} />
                  ) : null}
                </Pressable>
              ))
            )}
          </View>
        </View>
      </Modal>

      {/* Live Channels Drawer (Image 2 Server/List Icon) */}
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
                hitSlop={8}
              >
                <Ionicons name="close" size={22} color="#fff" />
              </Pressable>
            </View>

            {/* Quick search inside drawer */}
            <View style={styles.drawerSearchBox}>
              <Ionicons name="search" size={16} color="#777" />
              <Pressable style={{ flex: 1 }}>
                <Text style={styles.drawerSearchPlaceholder}>
                  {filteredChannels.length} canais disponíveis
                </Text>
              </Pressable>
            </View>

            <FlatList
              data={filteredChannels}
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
    left: '38%',
    width: 150,
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
    fontSize: 13,
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
    backgroundColor: colors.primary,
  },
  gestureIndicatorPercent: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '800',
  },
  seekFlashBox: {
    position: 'absolute',
    top: '40%',
    left: '42%',
    padding: 18,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 98,
  },
  seekFlashText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
    marginTop: 4,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.65)',
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
  errorOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
    zIndex: 99,
  },
  errorTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
  },
  errorSub: {
    color: '#aaa',
    fontSize: 13,
    textAlign: 'center',
    maxWidth: 420,
    lineHeight: 18,
  },
  errorActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
  },
  errorRetryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#00E5FF',
    borderRadius: 24,
  },
  errorRetryText: {
    color: '#000',
    fontSize: 13,
    fontWeight: '800',
  },
  errorBackBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#222',
    borderRadius: 24,
  },
  errorBackText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  lockedPillContainer: {
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center',
    zIndex: 50,
  },
  lockedPillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.85)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#FFD700',
  },
  lockedPillText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
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
    paddingBottom: 28,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topIconBtn: {
    padding: 6,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 20,
  },
  vodTitleContainer: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  vodTitleText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  liveTitleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
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
  liveChannelTitleText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    flex: 1,
  },
  topRightIconsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  topActionIconBtn: {
    padding: 4,
  },
  /* Vertical Sliders (Image 1 & Image 2) */
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
    position: 'relative',
  },
  seekStepText: {
    position: 'absolute',
    color: '#fff',
    fontSize: 10,
    fontWeight: '900',
    bottom: 8,
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
  /* Bottom Bar */
  bottomGradient: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 22,
  },
  /* VOD Seekbar Container (Image 1 Style) */
  vodSeekbarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    width: '100%',
  },
  timeText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    minWidth: 46,
    textAlign: 'center',
  },
  seekbarTrackBox: {
    flex: 1,
    height: 36,
    justifyContent: 'center',
    position: 'relative',
  },
  seekbarBackgroundTrack: {
    width: '100%',
    height: 3.5,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  seekbarProgressFill: {
    height: '100%',
    backgroundColor: '#fff',
  },
  seekbarThumb: {
    position: 'absolute',
    top: 12,
    width: 13,
    height: 13,
    borderRadius: 6.5,
    backgroundColor: '#00E5FF',
    elevation: 4,
  },
  /* Live TV Bottom Card (Image 2 & 3 Style) */
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
  /* Modals */
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '80%',
    backgroundColor: '#13131a',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#262632',
  },
  modalCardSmall: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#13131a',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#262632',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#222230',
    marginBottom: 12,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    flex: 1,
  },
  modalScrollView: {
    maxHeight: 340,
  },
  modalMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  modalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#222',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  modalBadgeText: {
    color: '#FFD700',
    fontSize: 11,
    fontWeight: '800',
  },
  modalMetaText: {
    color: '#888',
    fontSize: 12,
    fontWeight: '600',
  },
  modalPlotText: {
    color: '#ddd',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 14,
  },
  modalCreditsText: {
    color: '#999',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  creditsBold: {
    color: '#fff',
    fontWeight: '700',
  },
  modalOptionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1c1c26',
  },
  modalOptionItemActive: {
    backgroundColor: '#1c2233',
    borderRadius: 8,
  },
  modalOptionText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  modalEmptyText: {
    color: '#777',
    fontSize: 13,
    paddingVertical: 16,
    textAlign: 'center',
  },
  /* Drawer */
  drawerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  drawerContent: {
    width: 320,
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
  drawerSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#181822',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 12,
  },
  drawerSearchPlaceholder: {
    color: '#666',
    fontSize: 12,
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
    backgroundColor: '#162035',
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
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
    color: colors.primary,
    fontWeight: '800',
  },
});
