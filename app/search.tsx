import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  Pressable,
  ActivityIndicator,
  Dimensions,
  Modal,
  ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../src/theme/colors';
import { storage } from '../src/services/storage';
import { XtreamClient } from '../src/services/xtreamClient';
import { LiveChannel, VodMovie, SeriesItem, SeriesInfoResponse, SavedAccount } from '../src/types/iptv';
import { FocusableItem } from '../src/components/common/FocusableItem';

const { width } = Dimensions.get('window');
const isLargeScreen = width >= 768;
const NUM_COLUMNS = isLargeScreen ? 5 : 3;
const CARD_WIDTH = (width - 32 - (NUM_COLUMNS - 1) * 10) / NUM_COLUMNS;

type SearchFilterType = 'all' | 'movies' | 'series';

interface SearchResultItem {
  id: string | number;
  name: string;
  type: 'movie' | 'series';
  icon?: string;
  rating?: string;
  extension?: string;
  rawItem: any;
}

export default function SearchScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ initialType?: string; query?: string }>();

  const [query, setQuery] = useState(params.query || '');
  const [filterType, setFilterType] = useState<SearchFilterType>(
    (params.initialType as SearchFilterType) || 'all'
  );

  const [account, setAccount] = useState<SavedAccount | null>(null);
  const [loading, setLoading] = useState(true);

  // Raw data collections for fast instant search
  const [movies, setMovies] = useState<VodMovie[]>([]);
  const [series, setSeries] = useState<SeriesItem[]>([]);

  // Series Detail Modal state
  const [selectedSeries, setSelectedSeries] = useState<SeriesItem | null>(null);
  const [seriesInfo, setSeriesInfo] = useState<SeriesInfoResponse | null>(null);
  const [activeSeason, setActiveSeason] = useState<string>('1');
  const [loadingSeriesInfo, setLoadingSeriesInfo] = useState(false);

  const inputRef = useRef<any>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const active = await storage.getActiveAccount();
      if (!active) {
        router.replace('/login');
        return;
      }
      setAccount(active);

      const client = new XtreamClient(active.serverUrl, active.username, active.password);

      // Carrega simultaneamente os catálogos de filmes e séries
      const [moviesRes, seriesRes] = await Promise.allSettled([
        client.getVodStreams(),
        client.getSeries(),
      ]);

      if (moviesRes.status === 'fulfilled' && Array.isArray(moviesRes.value)) {
        setMovies(moviesRes.value);
      }
      if (seriesRes.status === 'fulfilled' && Array.isArray(seriesRes.value)) {
        setSeries(seriesRes.value);
      }
    } catch (err) {
      console.warn('Erro ao carregar catálogo para busca:', err);
    } finally {
      setLoading(false);
    }
  };

  // Filtragem reativa instantânea conforme o usuário digita ou altera o tipo
  const results = useMemo<SearchResultItem[]>(() => {
    const cleanQuery = query.trim().toLowerCase();

    const formattedMovies: SearchResultItem[] = movies.map((m) => ({
      id: m.stream_id,
      name: m.name,
      type: 'movie',
      icon: m.stream_icon,
      rating: m.rating ? String(m.rating).trim() : undefined,
      extension: m.container_extension || 'mp4',
      rawItem: m,
    }));

    const formattedSeries: SearchResultItem[] = series.map((s) => ({
      id: s.series_id,
      name: s.name,
      type: 'series',
      icon: s.cover,
      rating: s.rating ? String(s.rating).trim() : undefined,
      rawItem: s,
    }));

    let combined: SearchResultItem[] = [];

    if (filterType === 'all') {
      combined = [...formattedMovies, ...formattedSeries];
    } else if (filterType === 'movies') {
      combined = formattedMovies;
    } else if (filterType === 'series') {
      combined = formattedSeries;
    }

    if (!cleanQuery) {
      // Se não digitou nada, mostra os primeiros itens de destaque
      return combined.slice(0, 60);
    }

    return combined.filter((item) => item.name.toLowerCase().includes(cleanQuery));
  }, [query, filterType, movies, series]);

  const handleSelectItem = async (item: SearchResultItem) => {
    if (item.type === 'movie') {
      router.push({
        pathname: '/(tabs)/movies',
        params: {
          movieId: String(item.id),
        },
      });
    } else if (item.type === 'series') {
      router.push({
        pathname: '/(tabs)/series',
        params: {
          seriesId: String(item.id),
        },
      });
    }
  };

  const setSelectedSeriesInfo = async (seriesItem: SeriesItem) => {
    setSeriesInfo(null);
    setLoadingSeriesInfo(true);
    if (!account) return;
    try {
      const client = new XtreamClient(account.serverUrl, account.username, account.password);
      const info = await client.getSeriesInfo(seriesItem.series_id);
      setSeriesInfo(info);
      const firstSeason = Object.keys(info?.episodes || {})[0] || '1';
      setActiveSeason(firstSeason);
    } catch (err) {
      console.warn('Erro ao carregar detalhes da série:', err);
    } finally {
      setLoadingSeriesInfo(false);
    }
  };

  const renderCard = ({ item }: { item: SearchResultItem }) => {
    return (
      <FocusableItem style={styles.cardItem} onPress={() => handleSelectItem(item)}>
        <View style={styles.cardPosterBox}>
          {item.icon ? (
            <Image source={{ uri: item.icon }} style={styles.cardPoster} contentFit="cover" />
          ) : (
            <View style={styles.cardPosterFallback}>
              <Ionicons
                name={item.type === 'movie' ? 'film-outline' : 'albums-outline'}
                size={30}
                color="#555"
              />
            </View>
          )}

          {item.rating && item.rating !== '0' ? (
            <View style={styles.cardRatingBadge}>
              <Ionicons name="star" size={10} color="#FFD700" />
              <Text style={styles.cardRatingText}>{item.rating}</Text>
            </View>
          ) : null}

          {/* Badge sutil do tipo caso esteja filtrando por 'Todos' */}
          {filterType === 'all' && (
            <View style={styles.cardTypeBadge}>
              <Text style={styles.cardTypeText}>
                {item.type === 'movie' ? 'Filme' : 'Série'}
              </Text>
            </View>
          )}
        </View>

        <Text style={styles.cardTitle} numberOfLines={2}>
          {item.name}
        </Text>
      </FocusableItem>
    );
  };

  return (
    <View style={styles.container}>
      {/* Top Header com Botão Voltar, Ícone e Campo de Busca Integrado */}
      <View style={styles.searchHeaderRow}>
        <Pressable style={styles.backButton} onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </Pressable>

        <Ionicons name="tv" size={22} color={colors.primary} style={styles.headerTvIcon} />

        <View style={styles.searchInputBox}>
          <TextInput
            ref={inputRef}
            style={styles.searchInput}
            placeholder="Buscar..."
            placeholderTextColor="#777"
            value={query}
            onChangeText={setQuery}
            autoFocus
            returnKeyType="search"
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} hitSlop={10}>
              <Ionicons name="close" size={18} color="#888" />
            </Pressable>
          )}
        </View>
      </View>

      {/* Abas de Filtro de Conteúdo (Todos | Filmes | Séries) */}
      <View style={styles.filterTabsBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterTabsScroll}
        >
          {/* Todos (Padrão Inicial) */}
          <Pressable
            style={[styles.filterTabItem, filterType === 'all' && styles.filterTabItemActive]}
            onPress={() => setFilterType('all')}
          >
            <Text style={[styles.filterTabText, filterType === 'all' && styles.filterTabTextActive]}>
              Todos
            </Text>
            {filterType === 'all' && <View style={styles.activeTabIndicator} />}
          </Pressable>

          {/* Filmes */}
          <Pressable
            style={[styles.filterTabItem, filterType === 'movies' && styles.filterTabItemActive]}
            onPress={() => setFilterType('movies')}
          >
            <Text style={[styles.filterTabText, filterType === 'movies' && styles.filterTabTextActive]}>
              Filmes
            </Text>
            {filterType === 'movies' && <View style={styles.activeTabIndicator} />}
          </Pressable>

          {/* Séries */}
          <Pressable
            style={[styles.filterTabItem, filterType === 'series' && styles.filterTabItemActive]}
            onPress={() => setFilterType('series')}
          >
            <Text style={[styles.filterTabText, filterType === 'series' && styles.filterTabTextActive]}>
              Séries
            </Text>
            {filterType === 'series' && <View style={styles.activeTabIndicator} />}
          </Pressable>
        </ScrollView>
      </View>

      {/* Contador de Resultados da Busca */}
      <View style={styles.resultsHeaderRow}>
        <Text style={styles.resultsTitle}>
          Resultado da busca <Text style={styles.resultsCount}>({results.length})</Text>
        </Text>
      </View>

      {/* Corpo da Busca */}
      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Preparando catálogo...</Text>
        </View>
      ) : results.length === 0 ? (
        <View style={styles.centerBox}>
          <Ionicons name="search-outline" size={54} color="#444" />
          <Text style={styles.emptyTitle}>Nenhum resultado encontrado</Text>
          <Text style={styles.emptySub}>
            Não encontramos nada para "{query}". Tente buscar por outro termo ou mude o filtro acima.
          </Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => `${item.type}-${item.id}`}
          renderItem={renderCard}
          numColumns={NUM_COLUMNS}
          key={NUM_COLUMNS}
          contentContainerStyle={styles.gridContent}
          columnWrapperStyle={styles.columnWrapper}
          showsVerticalScrollIndicator={false}
          initialNumToRender={15}
          maxToRenderPerBatch={20}
          windowSize={7}
        />
      )}

      {/* Modal de Detalhes da Série / Episódios */}
      <Modal
        visible={Boolean(selectedSeries)}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setSelectedSeries(null)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <FocusableItem style={styles.modalCloseBtn} onPress={() => setSelectedSeries(null)}>
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </FocusableItem>
            <Text style={styles.modalTitle} numberOfLines={1}>
              {selectedSeries?.name || 'Detalhes da Série'}
            </Text>
          </View>

          {loadingSeriesInfo ? (
            <View style={styles.centerBox}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>Carregando episódios...</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.modalContent}>
              <View style={styles.modalInfoCard}>
                {selectedSeries?.cover ? (
                  <Image source={{ uri: selectedSeries.cover }} style={styles.modalPoster} contentFit="cover" />
                ) : null}
                <View style={styles.modalInfoDetails}>
                  <Text style={styles.modalSeriesName}>{selectedSeries?.name || ''}</Text>
                  <Text style={styles.modalPlot}>
                    {seriesInfo?.info?.plot || selectedSeries?.plot || 'Sem sinopse disponível.'}
                  </Text>
                  {selectedSeries?.genre ? (
                    <Text style={styles.modalGenre}>Gênero: {selectedSeries.genre}</Text>
                  ) : null}
                </View>
              </View>

              {seriesInfo?.episodes && Object.keys(seriesInfo.episodes).length > 0 ? (
                <>
                  <Text style={styles.seasonsHeader}>Temporadas</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.seasonsScroll}>
                    {Object.keys(seriesInfo.episodes).map((seasonNum) => {
                      const isActive = activeSeason === seasonNum;
                      return (
                        <FocusableItem
                          key={seasonNum}
                          style={[styles.seasonChip, isActive && styles.seasonChipActive]}
                          onPress={() => setActiveSeason(seasonNum)}
                        >
                          <Text style={[styles.seasonChipText, isActive && styles.seasonChipTextActive]}>
                            Temporada {seasonNum}
                          </Text>
                        </FocusableItem>
                      );
                    })}
                  </ScrollView>

                  <Text style={styles.episodesHeader}>Episódios</Text>
                  {(seriesInfo.episodes[activeSeason] || []).map((ep) => (
                    <FocusableItem
                      key={ep.id}
                      style={styles.episodeCard}
                      onPress={() => {
                        setSelectedSeries(null);
                        router.push({
                          pathname: '/player/[id]',
                          params: {
                            id: ep.id,
                            type: 'series',
                            title: `${selectedSeries?.name || ''} - T${activeSeason}:E${ep.episode_num} ${ep.title || ''}`,
                            extension: ep.container_extension || 'mp4',
                          },
                        });
                      }}
                    >
                      <View style={styles.episodePlayIcon}>
                        <Ionicons name="play" size={18} color="#fff" />
                      </View>
                      <View style={styles.episodeDetails}>
                        <Text style={styles.episodeTitle}>
                          Episódio {ep.episode_num}: {ep.title || 'Episódio'}
                        </Text>
                        {ep.info?.duration ? (
                          <Text style={styles.episodeDuration}>Duração: {ep.info.duration}</Text>
                        ) : null}
                      </View>
                    </FocusableItem>
                  ))}
                </>
              ) : null}
            </ScrollView>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#070709',
    paddingTop: 36,
  },
  searchHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
    backgroundColor: '#070709',
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTvIcon: {
    marginRight: 2,
  },
  searchInputBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16161f',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#262634',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },

  /* Abas de Filtro */
  filterTabsBar: {
    borderBottomWidth: 1,
    borderBottomColor: '#16161f',
    backgroundColor: '#070709',
  },
  filterTabsScroll: {
    paddingHorizontal: 16,
    gap: 24,
    alignItems: 'center',
    height: 44,
  },
  filterTabItem: {
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    paddingHorizontal: 4,
  },
  filterTabItemActive: {},
  filterTabText: {
    color: '#8E8E93',
    fontSize: 14,
    fontWeight: '600',
  },
  filterTabTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  activeTabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2.5,
    backgroundColor: '#FFA000',
    borderRadius: 2,
  },

  /* Resultados */
  resultsHeaderRow: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10,
  },
  resultsTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  resultsCount: {
    color: '#888',
    fontWeight: '700',
  },

  /* Grade */
  gridContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  columnWrapper: {
    gap: 10,
    marginBottom: 16,
  },
  cardItem: {
    width: CARD_WIDTH,
  },
  cardPosterBox: {
    width: CARD_WIDTH,
    height: CARD_WIDTH * 1.48,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#14141b',
    position: 'relative',
    borderWidth: 1,
    borderColor: '#22222e',
  },
  cardPoster: {
    width: '100%',
    height: '100%',
  },
  cardPosterFallback: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#16161f',
  },
  cardRatingBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 3,
  },
  cardRatingText: {
    color: '#FFD700',
    fontSize: 10,
    fontWeight: '800',
  },
  cardTypeBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  cardTypeText: {
    color: '#ddd',
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  cardTitle: {
    color: '#DDD',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 6,
    lineHeight: 15,
  },

  /* Estados */
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
    gap: 12,
  },
  loadingText: {
    color: '#888',
    fontSize: 13,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    marginTop: 8,
  },
  emptySub: {
    color: '#777',
    fontSize: 12,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 16,
  },

  /* Modal de Episódios */
  modalContainer: {
    flex: 1,
    backgroundColor: '#0a0a0c',
    paddingTop: 36,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1c1c26',
    gap: 12,
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#fff',
    flex: 1,
  },
  modalContent: {
    padding: 16,
    paddingBottom: 40,
  },
  modalInfoCard: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 20,
  },
  modalPoster: {
    width: 110,
    height: 160,
    borderRadius: 12,
  },
  modalInfoDetails: {
    flex: 1,
    justifyContent: 'center',
    gap: 6,
  },
  modalSeriesName: {
    fontSize: 17,
    fontWeight: '800',
    color: '#fff',
  },
  modalPlot: {
    fontSize: 12,
    color: '#aaa',
    lineHeight: 16,
  },
  modalGenre: {
    fontSize: 12,
    color: '#FFA000',
    fontWeight: '600',
  },
  seasonsHeader: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 10,
  },
  seasonsScroll: {
    marginBottom: 18,
  },
  seasonChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#161622',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#262638',
  },
  seasonChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  seasonChipText: {
    color: '#888',
    fontSize: 13,
    fontWeight: '600',
  },
  seasonChipTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  episodesHeader: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 10,
  },
  episodeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#121218',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    gap: 12,
    borderWidth: 1,
    borderColor: '#1e1e28',
  },
  episodePlayIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  episodeDetails: {
    flex: 1,
  },
  episodeTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  episodeDuration: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
});
