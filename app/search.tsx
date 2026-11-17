import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  Pressable,
  ActivityIndicator,
  useWindowDimensions,
  Modal,
  ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../src/theme/colors';
import { storage, MediaListItem } from '../src/services/storage';
import { XtreamClient } from '../src/services/xtreamClient';
import { LiveChannel, VodMovie, SeriesItem, SeriesInfoResponse, SavedAccount, IptvCategory } from '../src/types/iptv';
import { FocusableItem } from '../src/components/common/FocusableItem';
import { EnrichedPosterImage } from '../src/components/common/EnrichedPosterImage';

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
  const params = useLocalSearchParams<{
    initialType?: string;
    query?: string;
    categoryId?: string;
    categoryName?: string;
  }>();
  const { width } = useWindowDimensions();
  const isLandscape = width > 500;
  const numColumns = width >= 768 ? 5 : isLandscape ? 4 : 3;
  const cardWidth = (width - 32 - (numColumns - 1) * 10) / numColumns;

  const [query, setQuery] = useState(params.query || '');
  const [filterType, setFilterType] = useState<SearchFilterType>(
    (params.initialType as SearchFilterType) || 'all'
  );
  const [selectedCategory, setSelectedCategory] = useState<string>(params.categoryId || 'all');
  const [displayLimit, setDisplayLimit] = useState<number>(24);

  const [account, setAccount] = useState<SavedAccount | null>(null);
  const [loading, setLoading] = useState(true);

  // Raw data collections for fast instant search
  const [movies, setMovies] = useState<VodMovie[]>([]);
  const [series, setSeries] = useState<SeriesItem[]>([]);
  const [vodCategories, setVodCategories] = useState<IptvCategory[]>([]);
  const [seriesCategories, setSeriesCategories] = useState<IptvCategory[]>([]);

  // Movie Detail Modal state
  const [selectedMovie, setSelectedMovie] = useState<VodMovie | null>(null);
  const [movieDetails, setMovieDetails] = useState<any | null>(null);
  const [loadingMovieDetails, setLoadingMovieDetails] = useState(false);
  const [isMoviePlotExpanded, setIsMoviePlotExpanded] = useState(false);
  const [isMovieInList, setIsMovieInList] = useState(false);
  const [isMovieWatchLater, setIsMovieWatchLater] = useState(false);
  const [movieFavorites, setMovieFavorites] = useState<number[]>([]);

  // Series Detail Modal state
  const [selectedSeries, setSelectedSeries] = useState<SeriesItem | null>(null);
  const [seriesInfo, setSeriesInfo] = useState<SeriesInfoResponse | null>(null);
  const [activeSeason, setActiveSeason] = useState<string>('1');
  const [loadingSeriesInfo, setLoadingSeriesInfo] = useState(false);

  const inputRef = useRef<any>(null);

  // Redefine paginação ao mudar qualquer filtro
  useEffect(() => {
    setDisplayLimit(24);
  }, [query, filterType, selectedCategory]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async (targetType?: SearchFilterType) => {
    const typeToLoad = targetType || filterType;
    setLoading(true);
    try {
      const active = await storage.getActiveAccount();
      if (!active) {
        router.replace('/login');
        return;
      }
      setAccount(active);

      const favs = await storage.getMovieFavorites();
      setMovieFavorites(favs || []);

      const client = new XtreamClient(active.serverUrl, active.username, active.password);

      if (typeToLoad === 'movies') {
        // Carrega categorias e catálogo de filmes de forma focada e rápida
        const [catsRes, vodsRes] = await Promise.allSettled([
          client.getVodCategories(),
          selectedCategory && selectedCategory !== 'all'
            ? client.getVodStreams(selectedCategory)
            : client.getVodStreams(),
        ]);
        if (catsRes.status === 'fulfilled' && Array.isArray(catsRes.value)) {
          setVodCategories(catsRes.value);
        }
        if (vodsRes.status === 'fulfilled' && Array.isArray(vodsRes.value)) {
          setMovies(vodsRes.value);
        }
      } else if (typeToLoad === 'series') {
        // Carrega categorias e catálogo de séries
        const [catsRes, seriesRes] = await Promise.allSettled([
          client.getSeriesCategories(),
          selectedCategory && selectedCategory !== 'all'
            ? client.getSeries(selectedCategory)
            : client.getSeries(),
        ]);
        let loadedCats: IptvCategory[] = [];
        if (catsRes.status === 'fulfilled' && Array.isArray(catsRes.value)) {
          loadedCats = catsRes.value;
          setSeriesCategories(loadedCats);
        }
        if (seriesRes.status === 'fulfilled' && Array.isArray(seriesRes.value) && seriesRes.value.length > 0) {
          setSeries(seriesRes.value);
        } else if (loadedCats.length > 0) {
          // Fallback seguro caso o servidor rejeite get_series geral: carrega primeira categoria
          try {
            const firstCatSeries = await client.getSeries(loadedCats[0].category_id);
            if (Array.isArray(firstCatSeries)) setSeries(firstCatSeries);
          } catch (e) {
            console.warn('Erro ao carregar fallback de séries:', e);
          }
        }
      } else {
        // 'all': Carrega categorias primeiro, e em seguida filmes e séries sem bloquear mutuamente
        const [vodCatsRes, seriesCatsRes] = await Promise.allSettled([
          client.getVodCategories(),
          client.getSeriesCategories(),
        ]);
        if (vodCatsRes.status === 'fulfilled' && Array.isArray(vodCatsRes.value)) {
          setVodCategories(vodCatsRes.value);
        }
        let sCats: IptvCategory[] = [];
        if (seriesCatsRes.status === 'fulfilled' && Array.isArray(seriesCatsRes.value)) {
          sCats = seriesCatsRes.value;
          setSeriesCategories(sCats);
        }

        try {
          const vods = await client.getVodStreams();
          if (Array.isArray(vods)) setMovies(vods);
        } catch (e) {
          console.warn('Erro ao carregar filmes em all:', e);
        }

        try {
          const s = await client.getSeries();
          if (Array.isArray(s) && s.length > 0) {
            setSeries(s);
          } else if (sCats.length > 0) {
            const firstCatSeries = await client.getSeries(sCats[0].category_id);
            if (Array.isArray(firstCatSeries)) setSeries(firstCatSeries);
          }
        } catch (e) {
          console.warn('Erro ao carregar séries em all:', e);
          if (sCats.length > 0) {
            try {
              const fallback = await client.getSeries(sCats[0].category_id);
              if (Array.isArray(fallback)) setSeries(fallback);
            } catch (_) {}
          }
        }
      }
    } catch (err) {
      console.warn('Erro ao carregar catálogo para busca:', err);
    } finally {
      setLoading(false);
    }
  };

  const availableCategories = useMemo(() => {
    if (filterType === 'movies') return vodCategories;
    if (filterType === 'series') return seriesCategories;
    return vodCategories;
  }, [filterType, vodCategories, seriesCategories]);

  // Filtragem reativa instantânea conforme o usuário digita ou altera filtros
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

    // 1. Filtro por Categoria
    if (selectedCategory && selectedCategory !== 'all') {
      combined = combined.filter((item) => {
        const catId = item.rawItem?.category_id;
        return String(catId) === String(selectedCategory);
      });
    }

    // 2. Filtro por Busca de Texto
    if (cleanQuery) {
      combined = combined.filter((item) => item.name.toLowerCase().includes(cleanQuery));
    }

    return combined;
  }, [query, filterType, selectedCategory, movies, series]);

  const handleTabChange = async (newType: SearchFilterType) => {
    setFilterType(newType);
    setSelectedCategory('all');
    if (newType === 'movies' && movies.length === 0) {
      loadData('movies');
    } else if (newType === 'series' && series.length === 0) {
      loadData('series');
    } else if (newType === 'all' && (movies.length === 0 || series.length === 0)) {
      loadData('all');
    }
  };

  const openMovieDetails = async (movie: VodMovie) => {
    setSelectedMovie(movie);
    setMovieDetails(null);
    setIsMoviePlotExpanded(false);
    setLoadingMovieDetails(true);

    try {
      const inList = await storage.isInMyList(movie.stream_id);
      setIsMovieInList(inList);
      const inWatchLater = await storage.isInWatchLater(movie.stream_id);
      setIsMovieWatchLater(inWatchLater);

      if (account) {
        const client = new XtreamClient(account.serverUrl, account.username, account.password);
        const info = await client.getVodInfo(movie.stream_id);
        setMovieDetails(info);
      }
    } catch (err) {
      console.warn('Erro ao carregar detalhes do filme:', err);
    } finally {
      setLoadingMovieDetails(false);
    }
  };

  const handleWatchMovie = (movie: VodMovie) => {
    setSelectedMovie(null);
    router.push({
      pathname: '/player/[id]',
      params: {
        id: movie.stream_id,
        type: 'movie',
        title: movie.name,
        extension: movie.container_extension || 'mp4',
      },
    });
  };

  const handleToggleMyList = async (movie: VodMovie) => {
    const mediaItem: MediaListItem = {
      id: movie.stream_id,
      title: movie.name,
      poster: movie.stream_icon,
      backdrop: movieDetails?.info?.backdrop_path?.[0] || movie.stream_icon,
      type: 'movie',
      category_id: movie.category_id,
      category_name: selectedCategory,
      rating: movie.rating ? String(movie.rating) : undefined,
      year: movie.added ? String(new Date(Number(movie.added) * 1000).getFullYear()) : '2026',
      extension: movie.container_extension || 'mp4',
      plot: movieDetails?.info?.plot || movieDetails?.movie_data?.plot,
      addedAt: Date.now(),
      rawItem: movie,
    };
    const inList = await storage.toggleMyList(mediaItem);
    setIsMovieInList(inList);
  };

  const handleToggleWatchLater = async (movie: VodMovie) => {
    const mediaItem: MediaListItem = {
      id: movie.stream_id,
      title: movie.name,
      poster: movie.stream_icon,
      backdrop: movieDetails?.info?.backdrop_path?.[0] || movie.stream_icon,
      type: 'movie',
      category_id: movie.category_id,
      category_name: selectedCategory,
      rating: movie.rating ? String(movie.rating) : undefined,
      year: movie.added ? String(new Date(Number(movie.added) * 1000).getFullYear()) : '2026',
      extension: movie.container_extension || 'mp4',
      plot: movieDetails?.info?.plot || movieDetails?.movie_data?.plot,
      addedAt: Date.now(),
      rawItem: movie,
    };
    const inWatchLater = await storage.toggleWatchLater(mediaItem);
    setIsMovieWatchLater(inWatchLater);
  };

  const handleToggleFavoriteMovie = async (movie: VodMovie) => {
    const updated = await storage.toggleMovieFavorite(movie.stream_id);
    setMovieFavorites(updated);
  };

  const handleSelectItem = async (item: SearchResultItem) => {
    if (item.type === 'movie') {
      openMovieDetails(item.rawItem);
    } else if (item.type === 'series') {
      setSelectedSeries(item.rawItem);
      setSelectedSeriesInfo(item.rawItem);
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
      <FocusableItem
        style={[styles.cardItem, { width: cardWidth }]}
        onPress={() => handleSelectItem(item)}
      >
        <View style={[styles.cardPosterBox, { width: cardWidth, height: cardWidth * 1.48 }]}>
          <EnrichedPosterImage
            sourceUri={item.icon}
            title={item.name}
            type={item.type}
            style={styles.cardPoster}
            contentFit="cover"
          />

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
            onPress={() => handleTabChange('all')}
          >
            <Text style={[styles.filterTabText, filterType === 'all' && styles.filterTabTextActive]}>
              Todos
            </Text>
            {filterType === 'all' && <View style={styles.activeTabIndicator} />}
          </Pressable>

          {/* Filmes */}
          <Pressable
            style={[styles.filterTabItem, filterType === 'movies' && styles.filterTabItemActive]}
            onPress={() => handleTabChange('movies')}
          >
            <Text style={[styles.filterTabText, filterType === 'movies' && styles.filterTabTextActive]}>
              Filmes
            </Text>
            {filterType === 'movies' && <View style={styles.activeTabIndicator} />}
          </Pressable>

          {/* Séries */}
          <Pressable
            style={[styles.filterTabItem, filterType === 'series' && styles.filterTabItemActive]}
            onPress={() => handleTabChange('series')}
          >
            <Text style={[styles.filterTabText, filterType === 'series' && styles.filterTabTextActive]}>
              Séries
            </Text>
            {filterType === 'series' && <View style={styles.activeTabIndicator} />}
          </Pressable>
        </ScrollView>
      </View>

      {/* Filtro por Categoria (Carrossel Horizontal de Chips) */}
      {availableCategories.length > 0 && (
        <View style={styles.chipsFilterRow}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsScrollContent}
          >
            <Pressable
              style={[
                styles.filterChip,
                selectedCategory === 'all' && styles.filterChipActive,
              ]}
              onPress={() => setSelectedCategory('all')}
            >
              <Text
                style={[
                  styles.filterChipText,
                  selectedCategory === 'all' && styles.filterChipTextActive,
                ]}
              >
                Todas as Categorias
              </Text>
            </Pressable>

            {availableCategories.map((cat) => {
              const isActive = String(selectedCategory) === String(cat.category_id);
              return (
                <Pressable
                  key={cat.category_id}
                  style={[styles.filterChip, isActive && styles.filterChipActive]}
                  onPress={() => setSelectedCategory(cat.category_id)}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      isActive && styles.filterChipTextActive,
                    ]}
                  >
                    {cat.category_name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Contador de Resultados da Busca */}
      <View style={styles.resultsHeaderRow}>
        <Text style={styles.resultsTitle}>
          Títulos encontrados <Text style={styles.resultsCount}>({results.length})</Text>
        </Text>
      </View>

      {/* Corpo da Busca com Paginação Progressiva Fluida */}
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
            Não encontramos nada com os filtros selecionados. Tente buscar por outro termo ou mude os filtros acima.
          </Text>
        </View>
      ) : (
        <FlatList
          data={results.slice(0, displayLimit)}
          keyExtractor={(item) => `${item.type}-${item.id}`}
          renderItem={renderCard}
          numColumns={numColumns}
          key={`search-grid-${numColumns}`}
          contentContainerStyle={styles.gridContent}
          columnWrapperStyle={styles.columnWrapper}
          showsVerticalScrollIndicator={false}
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={5}
          onEndReached={() => {
            if (displayLimit < results.length) {
              setDisplayLimit((prev) => prev + 24);
            }
          }}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            displayLimit < results.length ? (
              <View style={styles.loadMoreFooter}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.loadMoreText}>Carregando mais títulos...</Text>
              </View>
            ) : undefined
          }
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
                  <EnrichedPosterImage
                    sourceUri={selectedSeries.cover}
                    title={selectedSeries.name}
                    type="series"
                    style={styles.modalPoster}
                    contentFit="cover"
                  />
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

      {/* Modal de Detalhes do Filme */}
      <Modal
        visible={Boolean(selectedMovie)}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setSelectedMovie(null)}
      >
        <View style={styles.movieDetailContainer}>
          {/* Top Bar com botão voltar e título */}
          <View style={styles.movieDetailTopBar}>
            <Pressable
              style={styles.detailBackBtn}
              onPress={() => setSelectedMovie(null)}
              hitSlop={10}
            >
              <Ionicons name="chevron-back" size={26} color="#fff" />
            </Pressable>
            <Text style={styles.detailTopBarTitle} numberOfLines={1}>
              {selectedMovie?.name || ''}
            </Text>
          </View>

          <ScrollView
            style={styles.detailScrollView}
            contentContainerStyle={styles.detailScrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Backdrop / Imagem no Topo */}
            <View style={styles.backdropWrapper}>
              <EnrichedPosterImage
                sourceUri={selectedMovie?.stream_icon}
                title={selectedMovie?.name || ''}
                type="movie"
                style={styles.backdropImage}
                contentFit="cover"
              />
              <LinearGradient
                colors={['transparent', 'rgba(7,7,9,0.5)', '#070709']}
                style={styles.backdropGradient}
              />
            </View>

            {/* Informações Principais do Filme */}
            <View style={styles.detailBody}>
              <Text style={styles.detailMovieTitle}>{selectedMovie?.name || ''}</Text>

              {/* Metadados: Ano • Gênero / Formato */}
              <View style={styles.detailMetaRow}>
                <Text style={styles.detailYearText}>
                  {selectedMovie?.added
                    ? new Date(Number(selectedMovie.added) * 1000).getFullYear() || '2026'
                    : '2026'}
                </Text>
                <Text style={styles.detailMetaDot}>•</Text>
                <Text style={styles.detailGenreText} numberOfLines={1}>
                  {movieDetails?.info?.genre || 'Filme • HD'}
                </Text>
              </View>

              {/* Botão Assistir Grande */}
              <FocusableItem
                style={styles.detailWatchNowBtn}
                onPress={() => selectedMovie && handleWatchMovie(selectedMovie)}
              >
                <LinearGradient
                  colors={['#00E5FF', '#A855F7']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.detailWatchGradient}
                >
                  <Ionicons name="play" size={18} color="#000" />
                  <Text style={styles.detailWatchText}>Assistir agora</Text>
                </LinearGradient>
              </FocusableItem>

              {/* Sinopse com Ver mais / Ver menos */}
              <View style={styles.plotContainer}>
                <Text
                  style={styles.detailPlotText}
                  numberOfLines={isMoviePlotExpanded ? undefined : 3}
                >
                  {movieDetails?.info?.plot ||
                    movieDetails?.movie_data?.plot ||
                    `Acompanhe a história de "${selectedMovie?.name}". Conteúdo com áudio e imagem de alta qualidade.`}
                </Text>
                <Pressable onPress={() => setIsMoviePlotExpanded(!isMoviePlotExpanded)}>
                  <Text style={styles.plotToggleText}>
                    {isMoviePlotExpanded ? 'Ver menos' : 'Ver mais'}
                  </Text>
                </Pressable>
              </View>

              {/* Elenco e Direção */}
              {movieDetails?.info?.cast ? (
                <Text style={styles.detailCreditsText} numberOfLines={2}>
                  <Text style={styles.creditsLabel}>Elenco: </Text>
                  {movieDetails.info.cast}
                </Text>
              ) : null}

              {movieDetails?.info?.director ? (
                <Text style={styles.detailCreditsText} numberOfLines={1}>
                  <Text style={styles.creditsLabel}>Direção: </Text>
                  {movieDetails.info.director}
                </Text>
              ) : null}

              {/* Ações: Minha Lista, Assistir Depois, Favoritar */}
              <View style={styles.actionButtonsRow}>
                <Pressable
                  style={styles.actionItemBtn}
                  onPress={() => selectedMovie && handleToggleMyList(selectedMovie)}
                >
                  <Ionicons
                    name={isMovieInList ? 'checkmark-circle' : 'add'}
                    size={24}
                    color={isMovieInList ? colors.primary : '#fff'}
                  />
                  <Text style={[styles.actionBtnLabel, isMovieInList && { color: colors.primary }]}>
                    {isMovieInList ? 'Na lista' : 'Minha lista'}
                  </Text>
                </Pressable>

                <Pressable
                  style={styles.actionItemBtn}
                  onPress={() => selectedMovie && handleToggleWatchLater(selectedMovie)}
                >
                  <Ionicons
                    name={isMovieWatchLater ? 'time' : 'time-outline'}
                    size={24}
                    color={isMovieWatchLater ? colors.primary : '#fff'}
                  />
                  <Text style={[styles.actionBtnLabel, isMovieWatchLater && { color: colors.primary }]}>
                    {isMovieWatchLater ? 'Salvo' : 'Assistir depois'}
                  </Text>
                </Pressable>

                <Pressable
                  style={styles.actionItemBtn}
                  onPress={() => selectedMovie && handleToggleFavoriteMovie(selectedMovie)}
                >
                  <Ionicons
                    name={
                      selectedMovie && movieFavorites.includes(selectedMovie.stream_id)
                        ? 'star'
                        : 'star-outline'
                    }
                    size={24}
                    color={
                      selectedMovie && movieFavorites.includes(selectedMovie.stream_id)
                        ? '#FFD700'
                        : '#fff'
                    }
                  />
                  <Text
                    style={[
                      styles.actionBtnLabel,
                      selectedMovie && movieFavorites.includes(selectedMovie.stream_id) && {
                        color: '#FFD700',
                      },
                    ]}
                  >
                    Favorito
                  </Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
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
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  chipsFilterRow: {
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#161622',
  },
  chipsScrollContent: {
    paddingHorizontal: 16,
    gap: 8,
    alignItems: 'center',
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#14141e',
    borderWidth: 1,
    borderColor: '#242434',
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterChipText: {
    color: '#aaa',
    fontSize: 12,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#000',
    fontWeight: '800',
  },
  loadMoreFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    gap: 8,
  },
  loadMoreText: {
    color: '#888',
    fontSize: 12,
    fontWeight: '600',
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
  cardItem: {},
  cardPosterBox: {
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
    color: colors.primary,
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

  /* Modal de Detalhes do Filme */
  movieDetailContainer: {
    flex: 1,
    backgroundColor: '#070709',
  },
  movieDetailTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 40,
    paddingBottom: 12,
    backgroundColor: 'rgba(7,7,9,0.95)',
    gap: 12,
    zIndex: 10,
  },
  detailBackBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailTopBarTitle: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  detailScrollView: {
    flex: 1,
  },
  detailScrollContent: {
    paddingBottom: 60,
  },
  backdropWrapper: {
    width: '100%',
    height: 230,
    position: 'relative',
    backgroundColor: '#121217',
  },
  backdropImage: {
    width: '100%',
    height: '100%',
  },
  backdropGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 100,
  },
  detailBody: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  detailMovieTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  detailMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  detailYearText: {
    color: '#8E8E93',
    fontSize: 13,
    fontWeight: '600',
  },
  detailMetaDot: {
    color: '#555',
    fontSize: 13,
  },
  detailGenreText: {
    color: '#8E8E93',
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  detailWatchNowBtn: {
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: 16,
  },
  detailWatchGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 8,
    borderRadius: 24,
  },
  detailWatchText: {
    color: '#000',
    fontSize: 15,
    fontWeight: '900',
  },
  plotContainer: {
    marginBottom: 14,
  },
  detailPlotText: {
    color: '#CCCCCC',
    fontSize: 13,
    lineHeight: 19,
  },
  plotToggleText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
    marginTop: 4,
  },
  detailCreditsText: {
    color: '#8E8E93',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 4,
  },
  creditsLabel: {
    color: '#AAAAAA',
    fontWeight: '700',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 18,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#1a1a24',
    marginVertical: 16,
  },
  actionItemBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minWidth: 80,
  },
  actionBtnLabel: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
});
