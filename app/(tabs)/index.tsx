import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Dimensions,
  ActivityIndicator,
  Pressable,
  FlatList,
  Modal,
  RefreshControl,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { storage, WatchProgressItem, MediaListItem } from '../../src/services/storage';
import { XtreamClient } from '../../src/services/xtreamClient';
import { SavedAccount, LiveChannel, VodMovie } from '../../src/types/iptv';
import { FocusableItem } from '../../src/components/common/FocusableItem';
import { StreamingBrandsRow, StreamingBrand } from '../../src/components/home/StreamingBrands';

const { width } = Dimensions.get('window');

export default function HomeScreen() {
  const router = useRouter();
  const [account, setAccount] = useState<SavedAccount | null>(null);
  const [activeFilter, setActiveFilter] = useState<'tudo' | 'series' | 'filmes' | 'aovivo'>('tudo');
  const [heroItem, setHeroItem] = useState<VodMovie | null>(null);
  const [todayChannels, setTodayChannels] = useState<LiveChannel[]>([]);
  const [favoriteChannels, setFavoriteChannels] = useState<LiveChannel[]>([]);
  const [continueWatching, setContinueWatching] = useState<WatchProgressItem[]>([]);
  const [watchLaterList, setWatchLaterList] = useState<MediaListItem[]>([]);
  const [recentMovies, setRecentMovies] = useState<VodMovie[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Streaming Brand Selection Modal
  const [selectedBrand, setSelectedBrand] = useState<StreamingBrand | null>(null);
  const [brandModalVisible, setBrandModalVisible] = useState(false);

  useEffect(() => {
    loadHomeData();
  }, []);

  // Recarrega favoritos e histórico sempre que a tela ganha foco
  useFocusEffect(
    useCallback(() => {
      loadFavoritesAndProgress();
    }, [])
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

      // Usar Promise.allSettled para que a falha de um não impeça o outro
      const [channelsRes, moviesRes] = await Promise.allSettled([
        client.getLiveStreams(),
        client.getVodStreams(),
      ]);

      let hasAnySuccess = false;

      if (channelsRes.status === 'fulfilled' && Array.isArray(channelsRes.value) && channelsRes.value.length > 0) {
        setTodayChannels(channelsRes.value.slice(0, 15));
        hasAnySuccess = true;
      }

      if (moviesRes.status === 'fulfilled' && Array.isArray(moviesRes.value) && moviesRes.value.length > 0) {
        setHeroItem(moviesRes.value[0]);
        setRecentMovies(moviesRes.value.slice(1, 15));
        hasAnySuccess = true;
      }

      if (!hasAnySuccess) {
        const errorDetail =
          channelsRes.status === 'rejected'
            ? channelsRes.reason?.message
            : moviesRes.status === 'rejected'
            ? moviesRes.reason?.message
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

  const handleSelectBrand = (brand: StreamingBrand) => {
    setSelectedBrand(brand);
    setBrandModalVisible(true);
  };

  const navigateToBrandContent = (type: 'movies' | 'series') => {
    if (!selectedBrand) return;
    setBrandModalVisible(false);

    if (type === 'movies') {
      router.push({
        pathname: '/(tabs)/movies',
        params: {
          brand: selectedBrand.id,
          brandName: selectedBrand.name,
        },
      });
    } else {
      router.push({
        pathname: '/(tabs)/series',
        params: {
          brand: selectedBrand.id,
          brandName: selectedBrand.name,
        },
      });
    }
  };

  return (
    <View style={styles.container}>
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

      {/* Filter Chips Bar */}
      <View style={styles.filterBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {/* 1. Tudo */}
          <Pressable
            style={[styles.filterChip, activeFilter === 'tudo' && styles.filterChipActive]}
            onPress={() => setActiveFilter('tudo')}
          >
            <Text style={[styles.filterText, activeFilter === 'tudo' && styles.filterTextActive]}>
              Tudo
            </Text>
          </Pressable>

          {/* 2. Ao vivo (Logo após Tudo) */}
          <Pressable
            style={[styles.filterChip, activeFilter === 'aovivo' && styles.filterChipActive]}
            onPress={() => {
              setActiveFilter('aovivo');
              router.push('/(tabs)/live');
            }}
          >
            <Text style={[styles.filterText, activeFilter === 'aovivo' && styles.filterTextActive]}>
              Ao vivo
            </Text>
          </Pressable>

          {/* 3. Séries */}
          <Pressable
            style={[styles.filterChip, activeFilter === 'series' && styles.filterChipActive]}
            onPress={() => {
              setActiveFilter('series');
              router.push('/(tabs)/series');
            }}
          >
            <Text style={[styles.filterText, activeFilter === 'series' && styles.filterTextActive]}>
              Séries
            </Text>
          </Pressable>

          {/* 4. Filmes */}
          <Pressable
            style={[styles.filterChip, activeFilter === 'filmes' && styles.filterChipActive]}
            onPress={() => {
              setActiveFilter('filmes');
              router.push('/(tabs)/movies');
            }}
          >
            <Text style={[styles.filterText, activeFilter === 'filmes' && styles.filterTextActive]}>
              Filmes
            </Text>
          </Pressable>
        </ScrollView>
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
          {/* Main Hero Banner - Image 3 Style */}
          {heroItem ? (
            <View style={styles.heroWrapper}>
              <View style={styles.heroCard}>
                {heroItem.stream_icon ? (
                  <Image
                    source={{ uri: heroItem.stream_icon }}
                    style={styles.heroImage}
                    contentFit="cover"
                  />
                ) : (
                  <View style={styles.heroFallback}>
                    <Ionicons name="film" size={64} color="#333" />
                  </View>
                )}

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
                        pathname: '/player/[id]',
                        params: {
                          id: heroItem.stream_id,
                          type: 'movie',
                          title: heroItem.name,
                          extension: heroItem.container_extension || 'mp4',
                        },
                      });
                    }}
                  >
                    <LinearGradient
                      colors={['#FF6A00', '#FFA000']}
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
            </View>
          ) : null}

          {/* Streaming Brands Row (Netflix, Prime Video, Disney+, Max, etc.) */}
          <StreamingBrandsRow onSelectBrand={handleSelectBrand} />

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
                      onPress={() => {
                        if (item.type === 'movie') {
                          router.push({
                            pathname: '/(tabs)/movies',
                            params: { movieId: String(item.id) },
                          });
                        } else if (item.type === 'series') {
                          router.push({
                            pathname: '/(tabs)/series',
                            params: { seriesId: String(item.id) },
                          });
                        } else {
                          router.push({
                            pathname: '/(tabs)/live',
                            params: { channelId: item.id, autoFullscreen: '1' },
                          });
                        }
                      }}
                    >
                      <View style={styles.continuePosterBox}>
                        {item.poster ? (
                          <Image
                            source={{ uri: item.poster }}
                            style={styles.continuePoster}
                            contentFit="cover"
                          />
                        ) : (
                          <View style={styles.continuePosterFallback}>
                            <Ionicons name="play-circle-outline" size={36} color={colors.primary} />
                          </View>
                        )}
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
                <Ionicons name="time" size={18} color="#FF6A00" />
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
                      {item.poster ? (
                        <Image
                          source={{ uri: item.poster }}
                          style={styles.moviePoster}
                          contentFit="cover"
                        />
                      ) : (
                        <Ionicons
                          name={item.type === 'movie' ? 'film-outline' : 'albums-outline'}
                          size={36}
                          color={colors.textMuted}
                        />
                      )}
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
                      {item.stream_icon ? (
                        <Image
                          source={{ uri: item.stream_icon }}
                          style={styles.moviePoster}
                          contentFit="cover"
                        />
                      ) : (
                        <Ionicons name="film-outline" size={36} color={colors.textMuted} />
                      )}
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

      {/* Modal: Escolha entre Filmes e Séries da Marca Selecionada */}
      <Modal
        visible={brandModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setBrandModalVisible(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setBrandModalVisible(false)}>
          <View style={styles.brandModalSheet}>
            {selectedBrand ? (
              <>
                <View style={styles.modalHandle} />
                <Text style={[styles.brandModalTitle, { color: selectedBrand.borderColor }]}>
                  {selectedBrand.name}
                </Text>
                <Text style={styles.brandModalSubtitle}>
                  O que você gostaria de explorar hoje?
                </Text>

                <View style={styles.brandModalButtonsRow}>
                  <Pressable
                    style={styles.brandChoiceCard}
                    onPress={() => navigateToBrandContent('movies')}
                  >
                    <LinearGradient
                      colors={['#1c1c24', '#121217']}
                      style={styles.brandChoiceGradient}
                    >
                      <Ionicons name="film" size={32} color="#FFA000" />
                      <Text style={styles.brandChoiceTitle}>Filmes</Text>
                      <Text style={styles.brandChoiceDesc}>Ver catálogo de filmes</Text>
                    </LinearGradient>
                  </Pressable>

                  <Pressable
                    style={styles.brandChoiceCard}
                    onPress={() => navigateToBrandContent('series')}
                  >
                    <LinearGradient
                      colors={['#1c1c24', '#121217']}
                      style={styles.brandChoiceGradient}
                    >
                      <Ionicons name="tv" size={32} color="#FFA000" />
                      <Text style={styles.brandChoiceTitle}>Séries</Text>
                      <Text style={styles.brandChoiceDesc}>Ver temporadas e episódios</Text>
                    </LinearGradient>
                  </Pressable>
                </View>

                <Pressable
                  style={styles.closeModalBtn}
                  onPress={() => setBrandModalVisible(false)}
                >
                  <Text style={styles.closeModalBtnText}>Fechar</Text>
                </Pressable>
              </>
            ) : null}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0c',
    paddingTop: 36,
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
    backgroundColor: '#16161d',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#22222d',
  },
  filterBar: {
    marginBottom: 14,
  },
  filterScroll: {
    paddingHorizontal: 20,
    gap: 10,
  },
  filterChip: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#181820',
  },
  filterChipActive: {
    backgroundColor: '#F5A623',
  },
  filterText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#888',
  },
  filterTextActive: {
    color: '#000',
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
  playFloatingIcon: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#F5A623',
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
    backgroundColor: '#FF6A00',
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
    color: '#FF6A00',
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
  },

  /* Brand Modal Styles */
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  brandModalSheet: {
    backgroundColor: '#121217',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    borderTopWidth: 1,
    borderTopColor: '#242432',
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#333',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  brandModalTitle: {
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  brandModalSubtitle: {
    fontSize: 13,
    color: '#888',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 20,
  },
  brandModalButtonsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 20,
  },
  brandChoiceCard: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  brandChoiceGradient: {
    padding: 18,
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#242434',
    gap: 8,
  },
  brandChoiceTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  brandChoiceDesc: {
    color: '#777',
    fontSize: 11,
    textAlign: 'center',
  },
  closeModalBtn: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  closeModalBtnText: {
    color: '#666',
    fontSize: 14,
    fontWeight: '600',
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
