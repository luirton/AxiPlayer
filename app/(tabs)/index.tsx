import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  useWindowDimensions,
  ActivityIndicator,
  Pressable,
  FlatList,
  Modal,
  RefreshControl,
  Platform,
  Alert,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { storage, WatchProgressItem, MediaListItem } from '../../src/services/storage';
import { XtreamClient } from '../../src/services/xtreamClient';
import { SavedAccount, LiveChannel, VodMovie, IptvCategory } from '../../src/types/iptv';
import { FocusableItem } from '../../src/components/common/FocusableItem';
import { HomeCategories } from '../../src/components/home/HomeCategories';
import { isAdultCategory } from '../../src/services/parentalControl';
import { EnrichedPosterImage } from '../../src/components/common/EnrichedPosterImage';

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const [account, setAccount] = useState<SavedAccount | null>(null);
  const [vodCategories, setVodCategories] = useState<IptvCategory[]>([]);
  const [seriesCategories, setSeriesCategories] = useState<IptvCategory[]>([]);
  const [heroItem, setHeroItem] = useState<VodMovie | null>(null);
  const [todayChannels, setTodayChannels] = useState<LiveChannel[]>([]);
  const [favoriteChannels, setFavoriteChannels] = useState<LiveChannel[]>([]);
  const [continueWatching, setContinueWatching] = useState<WatchProgressItem[]>([]);
  const [watchLaterList, setWatchLaterList] = useState<MediaListItem[]>([]);
  const [recentMovies, setRecentMovies] = useState<VodMovie[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    loadHomeData();
  }, []);

  // Recarrega favoritos e histórico sempre que a tela ganha foco, ou recarrega a Home se a conta mudou
  useFocusEffect(
    useCallback(() => {
      storage.getActiveAccount().then((active) => {
        if (active && (!account || active.id !== account.id)) {
          setAccount(active);
          loadHomeData();
        } else {
          loadFavoritesAndProgress();
        }
      });
    }, [account])
  );

  const loadFavoritesAndProgress = async () => {
    try {
      const favChs = await storage.getFavoriteChannels();
      setFavoriteChannels(favChs);
      const progress = await storage.getAllWatchProgress();
      setContinueWatching(progress);
      const wl = await storage.getWatchLater();
      setWatchLaterList(wl);
    } catch (e) {
      console.warn('Erro ao carregar favoritos e histórico:', e);
    }
  };

  const loadHomeData = async (isRefresh: boolean = false) => {
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

      const client = new XtreamClient(active.serverUrl, active.username, active.password);

      // Usar Promise.allSettled para carregar canais ao vivo e categorias rapidamente
      const [channelsRes, vodCatsRes, seriesCatsRes] = await Promise.allSettled([
        client.getLiveStreams(),
        client.getVodCategories(),
        client.getSeriesCategories(),
      ]);

      if (vodCatsRes.status === 'fulfilled' && Array.isArray(vodCatsRes.value)) {
        const safeVodCats = vodCatsRes.value.filter((c) => !isAdultCategory(c.category_name));
        setVodCategories(safeVodCats);
      }

      if (seriesCatsRes.status === 'fulfilled' && Array.isArray(seriesCatsRes.value)) {
        const safeSeriesCats = seriesCatsRes.value.filter((c) => !isAdultCategory(c.category_name));
        setSeriesCategories(safeSeriesCats);
      }

      let moviesData: VodMovie[] = [];
      const firstCatId =
        vodCatsRes.status === 'fulfilled' && Array.isArray(vodCatsRes.value) && vodCatsRes.value.length > 0
          ? vodCatsRes.value[0].category_id
          : undefined;

      try {
        const vods = firstCatId
          ? await client.getVodStreams(firstCatId)
          : await client.getVodStreams();
        if (Array.isArray(vods)) moviesData = vods;
      } catch (e) {
        console.warn('Erro ao carregar filmes na Home:', e);
      }

      let hasAnySuccess = false;

      if (channelsRes.status === 'fulfilled' && Array.isArray(channelsRes.value) && channelsRes.value.length > 0) {
        setTodayChannels(channelsRes.value.slice(0, 15));
        hasAnySuccess = true;
      }

      if (moviesData.length > 0) {
        // Seleção aleatória de destaque entre os títulos
        const validMovies = moviesData.filter((m) => m && m.name);
        const poolSize = Math.min(validMovies.length, 30);
        const randomIndex = Math.floor(Math.random() * poolSize);
        const chosenHero = validMovies[randomIndex] || validMovies[0];
        setHeroItem(chosenHero);

        const remaining = validMovies.filter((m) => m.stream_id !== chosenHero.stream_id);
        setRecentMovies(remaining.slice(0, 20));
        hasAnySuccess = true;
      }

      if (hasAnySuccess) {
        storage.markPlaylistReloaded().catch(() => {});
      }

      if (!hasAnySuccess) {
        const errorDetail =
          channelsRes.status === 'rejected'
            ? channelsRes.reason?.message
            : null;

        if (errorDetail) {
          setErrorMessage(errorDetail);
        } else {
          setErrorMessage('Nenhum canal ou filme foi retornado pelo servidor IPTV.');
        }
      }
    } catch (err: any) {
      console.warn('Could not load home data:', err);
      setErrorMessage(err?.message || 'Erro de conexão com o servidor IPTV.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleSelectVodCategory = (cat: IptvCategory) => {
    router.push({
      pathname: '/(tabs)/movies',
      params: {
        categoryId: cat.category_id,
        categoryName: cat.category_name,
      },
    });
  };

  const handleSelectSeriesCategory = (cat: IptvCategory) => {
    router.push({
      pathname: '/(tabs)/series',
      params: {
        categoryId: cat.category_id,
        categoryName: cat.category_name,
      },
    });
  };

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, 12) }]}>
      {/* Top Header - Image 3 Style */}
      <View style={styles.topHeader}>
        <View style={styles.brandBox}>
          <Ionicons name="tv" size={26} color={colors.primary} />
          <Text style={styles.headerTitle}>Início</Text>
        </View>

        <FocusableItem
          style={styles.searchIconButton}
          onPress={() => router.push('/search')}
        >
          <Ionicons name="search" size={22} color="#fff" />
        </FocusableItem>
      </View>

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Carregando destaques...</Text>
        </View>
      ) : errorMessage && !heroItem && todayChannels.length === 0 ? (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.emptyContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadHomeData(true)}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
        >
          <View style={styles.emptyCard}>
            <Ionicons name="cloud-offline-outline" size={56} color={colors.warning} />
            <Text style={styles.emptyTitle}>Não foi possível carregar a lista</Text>
            <Text style={styles.emptyDesc}>{errorMessage}</Text>
            
            <View style={styles.emptyActionsRow}>
              <FocusableItem
                style={styles.retryButton}
                onPress={() => loadHomeData(true)}
              >
                <Ionicons name="refresh" size={18} color="#fff" />
                <Text style={styles.retryButtonText}>Tentar Novamente</Text>
              </FocusableItem>

              <FocusableItem
                style={styles.secondaryButton}
                onPress={() => router.push('/(tabs)/live')}
              >
                <Ionicons name="tv-outline" size={18} color="#fff" />
                <Text style={styles.secondaryButtonText}>Ir para TV Ao Vivo</Text>
              </FocusableItem>
            </View>

            <FocusableItem
              style={styles.changeAccountLink}
              onPress={() => router.push('/login')}
            >
              <Text style={styles.changeAccountText}>Trocar ou reconfigurar dados da conta</Text>
            </FocusableItem>
          </View>
        </ScrollView>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadHomeData(true)}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
        >
          {/* Main Hero Banner */}
          {heroItem ? (
            <View style={styles.heroWrapper}>
              {isLandscape ? (
                <View style={styles.heroCardLandscape}>
                  {/* Pôster estilo Filmes Recentes no lado esquerdo */}
                  <View style={styles.heroLandscapePosterBox}>
                    <EnrichedPosterImage
                      sourceUri={heroItem.stream_icon}
                      title={heroItem.name}
                      type="movie"
                      style={styles.heroLandscapePoster}
                      contentFit="cover"
                    />
                    {heroItem.rating && String(heroItem.rating) !== '0' ? (
                      <View style={styles.heroLandscapeRatingBadge}>
                        <Ionicons name="star" size={11} color="#FFD700" />
                        <Text style={styles.heroLandscapeRatingText}>{String(heroItem.rating)}</Text>
                      </View>
                    ) : null}
                  </View>

                  {/* Informações detalhadas e Ação no lado direito */}
                  <View style={styles.heroLandscapeInfo}>
                    <Text style={styles.heroLandscapeTitle} numberOfLines={2}>
                      {heroItem.name}
                    </Text>

                    <View style={styles.heroLandscapeMetaRow}>
                      {heroItem.name?.match(/\((\d{4})\)/) ? (
                        <View style={styles.heroLandscapeYearBadge}>
                          <Text style={styles.heroLandscapeYearText}>
                            {heroItem.name.match(/\((\d{4})\)/)?.[1]}
                          </Text>
                        </View>
                      ) : null}
                      <View style={styles.heroLandscapeTypeBadge}>
                        <Text style={styles.heroLandscapeTypeText}>Destaque VOD</Text>
                      </View>
                    </View>

                    <FocusableItem
                      style={styles.watchNowButtonLandscape}
                      onPress={() => {
                        router.push({
                          pathname: '/(tabs)/movies',
                          params: {
                            movieId: String(heroItem.stream_id),
                          },
                        });
                      }}
                    >
                      <LinearGradient
                        colors={['#00E5FF', '#A855F7']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.watchNowGradient}
                      >
                        <Ionicons name="play" size={16} color="#000" />
                        <Text style={styles.watchNowText}>Assistir agora</Text>
                      </LinearGradient>
                    </FocusableItem>
                  </View>
                </View>
              ) : (
                <View style={styles.heroCard}>
                  <EnrichedPosterImage
                    sourceUri={heroItem.stream_icon}
                    title={heroItem.name}
                    type="movie"
                    style={styles.heroImage}
                    contentFit="cover"
                  />

                  <LinearGradient
                    colors={['transparent', 'rgba(0,0,0,0.4)', 'rgba(10,10,12,0.95)']}
                    style={styles.heroGradient}
                  >
                    <Text style={styles.heroTitle} numberOfLines={2}>
                      {heroItem.name}
                    </Text>

                    <FocusableItem
                      style={styles.watchNowButton}
                      onPress={() => {
                        router.push({
                          pathname: '/(tabs)/movies',
                          params: {
                            movieId: String(heroItem.stream_id),
                          },
                        });
                      }}
                    >
                      <LinearGradient
                        colors={['#00E5FF', '#A855F7']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.watchNowGradient}
                      >
                        <Ionicons name="play" size={16} color="#000" />
                        <Text style={styles.watchNowText}>Assistir agora</Text>
                      </LinearGradient>
                    </FocusableItem>
                  </LinearGradient>
                </View>
              )}
            </View>
          ) : null}

          {/* Categorias de Filmes e Séries */}
          <HomeCategories
            vodCategories={vodCategories}
            seriesCategories={seriesCategories}
            onSelectVodCategory={handleSelectVodCategory}
            onSelectSeriesCategory={handleSelectSeriesCategory}
          />

          {/* Section: Continuar Assistindo (Se houver progresso salvo) */}
          {continueWatching.length > 0 ? (
            <View style={styles.sectionContainer}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="time-outline" size={18} color={colors.primary} />
                <Text style={styles.sectionTitleWithIcon}>Continuar Assistindo</Text>
              </View>
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={continueWatching}
                keyExtractor={(item) => String(item.id)}
                contentContainerStyle={styles.horizontalList}
                renderItem={({ item }) => {
                  const progressPct =
                    item.durationSec > 0
                      ? Math.min(Math.max((item.positionSec / item.durationSec) * 100, 5), 100)
                      : 20;

                  return (
                    <FocusableItem
                      style={styles.continueCardItem}
                      onLongPress={() => {
                        Alert.alert(
                          'Remover do Histórico',
                          `Deseja remover "${item.title}" de Continuar Assistindo?`,
                          [
                            { text: 'Cancelar', style: 'cancel' },
                            {
                              text: 'Remover',
                              style: 'destructive',
                              onPress: async () => {
                                await storage.removeWatchProgress(item.id);
                                loadFavoritesAndProgress();
                              },
                            },
                          ]
                        );
                      }}
                      onPress={() => {
                        // Continua assistindo diretamente no player usando o link que deu certo
                        router.push({
                          pathname: '/player/[id]',
                          params: {
                            id: String(item.id),
                            type: item.type,
                            title: item.title,
                            extension: item.extension || 'mp4',
                            icon: item.poster || '',
                            streamUrl: item.streamUrl || '',
                            startPosition: String(item.positionSec || 0),
                            seriesId: item.seriesId ? String(item.seriesId) : undefined,
                            seriesTitle: item.seriesTitle || undefined,
                            seasonNum: item.seasonNum ? String(item.seasonNum) : undefined,
                            episodeNum: item.episodeNum ? String(item.episodeNum) : undefined,
                          },
                        });
                      }}
                    >
                      <View style={styles.continuePosterBox}>
                        <EnrichedPosterImage
                          sourceUri={item.poster}
                          title={item.title}
                          type={item.type === 'series' ? 'series' : 'movie'}
                          style={styles.continuePoster}
                          contentFit="cover"
                          fallbackIcon={item.type === 'series' ? 'albums-outline' : 'play-circle-outline'}
                        />
                        {/* Botão de excluir direto no card */}
                        <Pressable
                          style={styles.continueDeleteBtn}
                          hitSlop={8}
                          onPress={() => {
                            Alert.alert(
                              'Remover do Histórico',
                              `Deseja remover "${item.title}" de Continuar Assistindo?`,
                              [
                                { text: 'Cancelar', style: 'cancel' },
                                {
                                  text: 'Remover',
                                  style: 'destructive',
                                  onPress: async () => {
                                    await storage.removeWatchProgress(item.id);
                                    loadFavoritesAndProgress();
                                  },
                                },
                              ]
                            );
                          }}
                        >
                          <Ionicons name="close" size={13} color="#fff" />
                        </Pressable>
                        <View style={styles.playFloatingIcon}>
                          <Ionicons name="play" size={14} color="#000" />
                        </View>
                        {/* Barra de Progresso Visual na base do card */}
                        <View style={styles.progressBarTrack}>
                          <View style={[styles.progressBarFill, { width: `${progressPct}%` }]} />
                        </View>
                      </View>
                      <Text style={styles.continueItemName} numberOfLines={1}>
                        {item.title}
                      </Text>
                    </FocusableItem>
                  );
                }}
              />
            </View>
          ) : null}

          {/* Section: Assistir Depois (Filmes e Séries salvos) */}
          {watchLaterList.length > 0 ? (
            <View style={styles.sectionContainer}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="time" size={18} color={colors.primary} />
                <Text style={styles.sectionTitleWithIcon}>Assistir Depois</Text>
                <Text style={styles.sectionBadge}>({watchLaterList.length})</Text>
              </View>
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={watchLaterList}
                keyExtractor={(item) => String(item.id)}
                contentContainerStyle={styles.horizontalList}
                renderItem={({ item }) => (
                  <FocusableItem
                    style={styles.movieCardItem}
                    onPress={() => {
                      if (item.type === 'movie') {
                        router.push({
                          pathname: '/(tabs)/movies',
                          params: { movieId: String(item.id) },
                        });
                      } else {
                        router.push({
                          pathname: '/(tabs)/series',
                          params: { seriesId: String(item.id) },
                        });
                      }
                    }}
                  >
                    <View style={styles.moviePosterBox}>
                      <EnrichedPosterImage
                        sourceUri={item.poster}
                        title={item.title}
                        type={item.type === 'series' ? 'series' : 'movie'}
                        style={styles.moviePoster}
                        contentFit="cover"
                        fallbackIcon={item.type === 'series' ? 'albums-outline' : 'film-outline'}
                      />
                      <View style={styles.watchLaterTypeBadge}>
                        <Text style={styles.watchLaterTypeText}>
                          {item.type === 'movie' ? 'Filme' : 'Série'}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.movieItemName} numberOfLines={1}>
                      {item.title}
                    </Text>
                  </FocusableItem>
                )}
              />
            </View>
          ) : null}

          {/* Section: Canais Favoritos (Se houver) ou Canais em Destaque */}
          {favoriteChannels.length > 0 ? (
            <View style={styles.sectionContainer}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="star" size={18} color="#FFD700" />
                <Text style={styles.sectionTitleWithIcon}>Canais Favoritos</Text>
                <Text style={styles.sectionBadge}>({favoriteChannels.length})</Text>
              </View>
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={favoriteChannels}
                keyExtractor={(item) => String(item.stream_id)}
                contentContainerStyle={styles.horizontalList}
                renderItem={({ item }) => (
                  <FocusableItem
                    style={styles.channelCardItem}
                    onPress={() => {
                      router.push({
                        pathname: '/(tabs)/live',
                        params: {
                          channelId: item.stream_id,
                          autoFullscreen: '1',
                        },
                      });
                    }}
                  >
                    <View style={styles.channelPosterBox}>
                      {item.stream_icon ? (
                        <Image
                          source={{ uri: item.stream_icon }}
                          style={styles.channelPoster}
                          contentFit="contain"
                        />
                      ) : (
                        <Ionicons name="tv" size={36} color={colors.textMuted} />
                      )}
                    </View>
                    <Text style={styles.channelItemName} numberOfLines={1}>
                      {item.name}
                    </Text>
                  </FocusableItem>
                )}
              />
            </View>
          ) : todayChannels.length > 0 ? (
            <View style={styles.sectionContainer}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="radio-outline" size={18} color={colors.primary} />
                <Text style={styles.sectionTitleWithIcon}>TV Ao Vivo • Sugestões</Text>
              </View>
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={todayChannels}
                keyExtractor={(item) => String(item.stream_id)}
                contentContainerStyle={styles.horizontalList}
                renderItem={({ item }) => (
                  <FocusableItem
                    style={styles.channelCardItem}
                    onPress={() => {
                      router.push({
                        pathname: '/(tabs)/live',
                        params: {
                          channelId: item.stream_id,
                          autoFullscreen: '1',
                        },
                      });
                    }}
                  >
                    <View style={styles.channelPosterBox}>
                      {item.stream_icon ? (
                        <Image
                          source={{ uri: item.stream_icon }}
                          style={styles.channelPoster}
                          contentFit="contain"
                        />
                      ) : (
                        <Ionicons name="tv" size={36} color={colors.textMuted} />
                      )}
                    </View>
                    <Text style={styles.channelItemName} numberOfLines={1}>
                      {item.name}
                    </Text>
                  </FocusableItem>
                )}
              />
            </View>
          ) : null}

          {/* Section: Filmes Recentes */}
          {recentMovies.length > 0 ? (
            <View style={styles.sectionContainer}>
              <Text style={styles.sectionTitle}>Filmes Recentes</Text>
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={recentMovies}
                keyExtractor={(item) => String(item.stream_id)}
                contentContainerStyle={styles.horizontalList}
                renderItem={({ item }) => (
                  <FocusableItem
                    style={styles.movieCardItem}
                    onPress={() => {
                      router.push({
                        pathname: '/(tabs)/movies',
                        params: {
                          movieId: String(item.stream_id),
                        },
                      });
                    }}
                  >
                    <View style={styles.moviePosterBox}>
                      <EnrichedPosterImage
                        sourceUri={item.stream_icon}
                        title={item.name}
                        type="movie"
                        style={styles.moviePoster}
                        contentFit="cover"
                        fallbackIcon="film-outline"
                      />
                    </View>
                    <Text style={styles.movieItemName} numberOfLines={1}>
                      {item.name}
                    </Text>
                  </FocusableItem>
                )}
              />
            </View>
          ) : null}
        </ScrollView>
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  brandBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.5,
  },
  searchIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#101628',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#1E2845',
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 110,
  },
  heroWrapper: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  heroCard: {
    height: 380,
    borderRadius: 20,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#111',
  },
  heroCardLandscape: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#14141c',
    borderRadius: 20,
    padding: 16,
    gap: 20,
    borderWidth: 1,
    borderColor: '#242430',
  },
  heroLandscapePosterBox: {
    width: 140,
    height: 200,
    borderRadius: 14,
    backgroundColor: '#181822',
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  heroLandscapePoster: {
    width: '100%',
    height: '100%',
  },
  heroLandscapeRatingBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  heroLandscapeRatingText: {
    color: '#FFD700',
    fontSize: 11,
    fontWeight: '700',
  },
  heroLandscapeInfo: {
    flex: 1,
    justifyContent: 'center',
    gap: 10,
  },
  heroLandscapeTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#fff',
    lineHeight: 26,
  },
  heroLandscapeMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  heroLandscapeYearBadge: {
    backgroundColor: '#262638',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  heroLandscapeYearText: {
    color: '#ccc',
    fontSize: 12,
    fontWeight: '600',
  },
  heroLandscapeTypeBadge: {
    backgroundColor: 'rgba(255, 106, 0, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 106, 0, 0.3)',
  },
  heroLandscapeTypeText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  watchNowButtonLandscape: {
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#16161d',
  },
  heroGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingBottom: 24,
    paddingTop: 80,
    justifyContent: 'flex-end',
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#fff',
    marginBottom: 16,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  watchNowButton: {
    alignSelf: 'flex-start',
    borderRadius: 24,
    overflow: 'hidden',
  },
  watchNowGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  watchNowText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '800',
  },
  sectionContainer: {
    marginBottom: 24,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 12,
    gap: 8,
  },
  sectionTitleWithIcon: {
    fontSize: 17,
    fontWeight: '800',
    color: '#fff',
  },
  sectionBadge: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F5A623',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#fff',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  horizontalList: {
    paddingHorizontal: 20,
    gap: 14,
  },
  continueCardItem: {
    width: 140,
  },
  continuePosterBox: {
    width: 140,
    height: 90,
    borderRadius: 12,
    backgroundColor: '#181822',
    borderWidth: 1,
    borderColor: '#242430',
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 8,
  },
  continuePoster: {
    width: '100%',
    height: '100%',
  },
  continuePosterFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#16161f',
  },
  continueDeleteBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  playFloatingIcon: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressBarTrack: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.primary,
  },
  continueItemName: {
    color: '#bbb',
    fontSize: 12,
    fontWeight: '600',
  },
  channelCardItem: {
    width: 140,
  },
  channelPosterBox: {
    width: 140,
    height: 90,
    borderRadius: 12,
    backgroundColor: '#181822',
    borderWidth: 1,
    borderColor: '#242430',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: 8,
  },
  channelPoster: {
    width: '80%',
    height: '80%',
  },
  channelItemName: {
    color: '#bbb',
    fontSize: 12,
    fontWeight: '600',
  },
  movieCardItem: {
    width: 120,
  },
  moviePosterBox: {
    width: 120,
    height: 180,
    borderRadius: 12,
    backgroundColor: '#181822',
    borderWidth: 1,
    borderColor: '#242430',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: 8,
  },
  moviePoster: {
    width: '100%',
    height: '100%',
  },
  movieItemName: {
    color: '#bbb',
    fontSize: 12,
    fontWeight: '600',
  },
  watchLaterTypeBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  watchLaterTypeText: {
    color: colors.primary,
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
  },

  /* Empty / Error state styles */
  emptyContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyCard: {
    backgroundColor: '#121217',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#242432',
    padding: 28,
    alignItems: 'center',
    maxWidth: 480,
    width: '100%',
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    marginTop: 16,
    textAlign: 'center',
  },
  emptyDesc: {
    color: '#aaa',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 24,
    lineHeight: 18,
  },
  emptyActionsRow: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
    justifyContent: 'center',
    width: '100%',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#20202c',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  secondaryButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  changeAccountLink: {
    marginTop: 20,
    padding: 8,
  },
  changeAccountText: {
    color: colors.primaryAmber,
    fontSize: 13,
    textDecorationLine: 'underline',
  },
});
