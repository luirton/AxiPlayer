import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  ActivityIndicator,
  Dimensions,
  Pressable,
  ScrollView,
  Modal,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { storage, MediaListItem } from '../../src/services/storage';
import { XtreamClient } from '../../src/services/xtreamClient';
import { IptvCategory, VodMovie, SavedAccount } from '../../src/types/iptv';
import { FocusableItem } from '../../src/components/common/FocusableItem';
import { isAdultCategory } from '../../src/services/parentalControl';

const { width } = Dimensions.get('window');

export default function MoviesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    brand?: string;
    brandName?: string;
    categoryId?: string;
    movieId?: string;
  }>();
  const [categories, setCategories] = useState<IptvCategory[]>([]);
  const [movies, setMovies] = useState<VodMovie[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('for_you');
  const [selectedCategoryName, setSelectedCategoryName] = useState<string>('Para você');
  const [selectedBrandName, setSelectedBrandName] = useState<string | null>(params.brandName || null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMovies, setLoadingMovies] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [account, setAccount] = useState<SavedAccount | null>(null);
  const [movieFavorites, setMovieFavorites] = useState<number[]>([]);

  // Hero Item
  const [heroMovie, setHeroMovie] = useState<VodMovie | null>(null);

  // Movie Details Modal State (Fiel à Imagem 1)
  const [selectedMovie, setSelectedMovie] = useState<VodMovie | null>(null);
  const [movieDetails, setMovieDetails] = useState<any | null>(null);
  const [loadingMovieDetails, setLoadingMovieDetails] = useState<boolean>(false);
  const [isMovieInList, setIsMovieInList] = useState<boolean>(false);
  const [isMovieWatchLater, setIsMovieWatchLater] = useState<boolean>(false);
  const [isMoviePlotExpanded, setIsMoviePlotExpanded] = useState<boolean>(false);

  // Parental PIN para Filmes Adultos (Sempre solicita PIN)
  const [targetAdultMovie, setTargetAdultMovie] = useState<VodMovie | null>(null);
  const [adultPinModalVisible, setAdultPinModalVisible] = useState<boolean>(false);
  const [adultPinInput, setAdultPinInput] = useState<string>('');
  const [adultPinError, setAdultPinError] = useState<string | null>(null);

  useEffect(() => {
    initMovies();
  }, [params.brand]);

  useEffect(() => {
    if (params.movieId && account) {
      handleOpenMovieFromParam(Number(params.movieId));
    }
  }, [params.movieId, account]);

  const handleOpenMovieFromParam = async (movieId: number) => {
    const found = movies.find((m) => m.stream_id === movieId);
    if (found) {
      handleMovieClick(found);
      return;
    }
    if (account) {
      try {
        const client = new XtreamClient(account.serverUrl, account.username, account.password);
        const info = await client.getVodInfo(movieId);
        const movieObj: VodMovie = {
          num: 0,
          name: info?.movie_data?.name || info?.info?.name || 'Filme',
          stream_type: 'movie',
          stream_id: movieId,
          stream_icon: info?.info?.movie_image || '',
          rating: info?.info?.rating || '0',
          rating_5based: 0,
          added: '',
          category_id: info?.movie_data?.category_id || '',
          container_extension: info?.movie_data?.container_extension || 'mp4',
        };
        handleMovieClick(movieObj);
      } catch (e) {
        console.warn('Erro ao carregar filme por param:', e);
      }
    }
  };

  const initMovies = async () => {
    setLoading(true);
    setErrorMessage(null);
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
      const cats = await client.getVodCategories();
      setCategories(cats || []);

      if (params.brand) {
        const brandKey = params.brand.toLowerCase();
        const matchingCat = cats?.find((c) =>
          c.category_name.toLowerCase().includes(brandKey)
        );
        if (matchingCat) {
          setSelectedCategory(matchingCat.category_id);
          setSelectedCategoryName(params.brandName || matchingCat.category_name);
          setSelectedBrandName(params.brandName || matchingCat.category_name);
          const vods = await client.getVodStreams(matchingCat.category_id);
          setMovies(vods || []);
          if (vods && vods.length > 0) setHeroMovie(vods[0]);
          return;
        }
      }

      // Carga inicial: Categoria padrão ou primeira categoria
      if (cats && cats.length > 0) {
        const firstCatId = cats[0].category_id;
        const vods = await client.getVodStreams(firstCatId);
        setMovies(vods || []);
        if (vods && vods.length > 0) setHeroMovie(vods[0]);
      } else {
        const vods = await client.getVodStreams();
        setMovies(vods || []);
        if (vods && vods.length > 0) setHeroMovie(vods[0]);
      }
    } catch (err: any) {
      console.warn('Error loading movies:', err);
      setErrorMessage(err?.message || 'Falha ao carregar catálogo de filmes.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectCategory = async (catId: string, catName: string) => {
    setSelectedCategory(catId);
    setSelectedCategoryName(catName);
    if (!account) return;
    setLoadingMovies(true);
    try {
      if (catId === 'favorites') {
        const favMovies = await storage.getFavoriteMovies();
        setMovies(favMovies || []);
        if (favMovies && favMovies.length > 0) {
          setHeroMovie(favMovies[0]);
        }
        return;
      }

      const client = new XtreamClient(account.serverUrl, account.username, account.password);
      const vods = catId === 'for_you'
        ? (categories.length > 0 ? await client.getVodStreams(categories[0].category_id) : await client.getVodStreams())
        : await client.getVodStreams(catId);

      setMovies(vods || []);
      if (vods && vods.length > 0) {
        setHeroMovie(vods[0]);
      }
    } catch (err) {
      console.warn(err);
    } finally {
      setLoadingMovies(false);
    }
  };

  const handleToggleFavoriteMovie = async (movie: VodMovie) => {
    const isFavNow = await storage.toggleFavoriteMovie(movie);
    const updatedFavs = await storage.getMovieFavorites();
    setMovieFavorites(updatedFavs);

    if (selectedCategory === 'favorites') {
      const favMovies = await storage.getFavoriteMovies();
      setMovies(favMovies);
      if (heroMovie?.stream_id === movie.stream_id && favMovies.length > 0) {
        setHeroMovie(favMovies[0]);
      }
    }
  };

  const handleMovieClick = (movie: VodMovie) => {
    const isAdult =
      isAdultCategory(selectedCategoryName) ||
      isAdultCategory(movie.name) ||
      (movie.category_id && categories.some((c) => c.category_id === movie.category_id && isAdultCategory(c.category_name)));

    if (isAdult) {
      setTargetAdultMovie(movie);
      setAdultPinInput('');
      setAdultPinError(null);
      setAdultPinModalVisible(true);
      return;
    }

    openMovieDetails(movie);
  };

  const handleConfirmAdultPin = async () => {
    if (adultPinInput.trim().length !== 4) {
      setAdultPinError('Digite o PIN de 4 dígitos.');
      return;
    }

    const isValid = await storage.verifyParentalPin(adultPinInput);
    if (isValid) {
      setAdultPinModalVisible(false);
      if (targetAdultMovie) {
        const movieToOpen = targetAdultMovie;
        setTargetAdultMovie(null);
        openMovieDetails(movieToOpen);
      }
    } else {
      setAdultPinError('PIN incorreto. (Padrão: 0000)');
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
    } catch (e) {
      console.warn('Erro ao carregar detalhes do filme:', e);
    } finally {
      setLoadingMovieDetails(false);
    }
  };

  const handleWatchMovie = async (movie: VodMovie) => {
    // Regra: Sempre que clicar em assistir já incluir na minha lista
    const mediaItem: MediaListItem = {
      id: movie.stream_id,
      title: movie.name,
      poster: movie.stream_icon,
      backdrop: movieDetails?.info?.backdrop_path?.[0] || movie.stream_icon,
      type: 'movie',
      category_id: movie.category_id,
      category_name: selectedCategoryName,
      rating: movie.rating ? String(movie.rating) : undefined,
      year: movie.added ? String(new Date(Number(movie.added) * 1000).getFullYear()) : '2025',
      extension: movie.container_extension || 'mp4',
      plot: movieDetails?.info?.plot || movieDetails?.movie_data?.plot,
      addedAt: Date.now(),
      rawItem: movie,
    };

    await storage.addToMyList(mediaItem);
    setIsMovieInList(true);

    // Fecha o modal de detalhes antes de abrir o player
    setSelectedMovie(null);

    router.push({
      pathname: '/player/[id]',
      params: {
        id: movie.stream_id,
        type: 'movie',
        title: movie.name || 'Filme',
        extension: movie.container_extension || 'mp4',
        icon: movie.stream_icon,
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
      category_name: selectedCategoryName,
      rating: movie.rating ? String(movie.rating) : undefined,
      year: movie.added ? String(new Date(Number(movie.added) * 1000).getFullYear()) : '2025',
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
      category_name: selectedCategoryName,
      rating: movie.rating ? String(movie.rating) : undefined,
      year: movie.added ? String(new Date(Number(movie.added) * 1000).getFullYear()) : '2025',
      extension: movie.container_extension || 'mp4',
      plot: movieDetails?.info?.plot || movieDetails?.movie_data?.plot,
      addedAt: Date.now(),
      rawItem: movie,
    };

    const inWatchLater = await storage.toggleWatchLater(mediaItem);
    setIsMovieWatchLater(inWatchLater);
  };

  const handlePlayMovie = (item: VodMovie) => {
    handleMovieClick(item);
  };

  const filteredMovies = movies.filter((m) =>
    (m.name || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const heroRating = heroMovie?.rating ? String(heroMovie.rating).trim() : '8.5';

  return (
    <View style={styles.container}>
      {/* Top Header com design limpo (Ícone da TV e Busca) */}
      <View style={styles.topHeader}>
        <View style={styles.brandBox}>
          <Ionicons name="tv" size={24} color={colors.primary} />
          <Text style={styles.brandTitle}>Filmes</Text>
        </View>

        <Pressable
          style={styles.searchIconButton}
          onPress={() => router.push({ pathname: '/search', params: { initialType: 'movies' } })}
          hitSlop={10}
        >
          <Ionicons name="search" size={22} color="#fff" />
        </Pressable>
      </View>

      {/* Campo de Busca Expansível */}
      {isSearchOpen && (
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={18} color="#888" />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar filmes por título..."
            placeholderTextColor="#777"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')} hitSlop={10}>
              <Ionicons name="close-circle" size={18} color="#888" />
            </Pressable>
          )}
        </View>
      )}

      {/* Barra Horizontal de Categorias (Imagem 1) */}
      <View style={styles.categoriesTabBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoriesScrollContent}
        >
          {/* Aba Inicial: Para você */}
          <Pressable
            style={[styles.categoryTabItem, selectedCategory === 'for_you' && styles.categoryTabItemActive]}
            onPress={() => handleSelectCategory('for_you', 'Para você')}
          >
            <Text style={[styles.categoryTabText, selectedCategory === 'for_you' && styles.categoryTabTextActive]}>
              Para você
            </Text>
            {selectedCategory === 'for_you' && <View style={styles.activeTabIndicator} />}
          </Pressable>

          {/* Aba: Meus Favoritos */}
          <Pressable
            style={[styles.categoryTabItem, selectedCategory === 'favorites' && styles.categoryTabItemActive]}
            onPress={() => handleSelectCategory('favorites', '⭐ Meus Favoritos')}
          >
            <Text style={[styles.categoryTabText, selectedCategory === 'favorites' && styles.categoryTabTextActive]}>
              ⭐ Favoritos
            </Text>
            {selectedCategory === 'favorites' && <View style={styles.activeTabIndicator} />}
          </Pressable>

          {/* Abas das Categorias do Provedor */}
          {categories.map((cat) => {
            const isActive = selectedCategory === cat.category_id;
            return (
              <Pressable
                key={cat.category_id}
                style={[styles.categoryTabItem, isActive && styles.categoryTabItemActive]}
                onPress={() => handleSelectCategory(cat.category_id, cat.category_name)}
              >
                <Text style={[styles.categoryTabText, isActive && styles.categoryTabTextActive]}>
                  {cat.category_name}
                </Text>
                {isActive && <View style={styles.activeTabIndicator} />}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Conteúdo Principal */}
      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Carregando catálogo de filmes...</Text>
        </View>
      ) : errorMessage && filteredMovies.length === 0 ? (
        <View style={styles.centerBox}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.warning} />
          <Text style={styles.errorTitle}>Não foi possível carregar os filmes</Text>
          <Text style={styles.errorSub}>{errorMessage}</Text>
          <FocusableItem style={styles.retryBtn} onPress={() => initMovies()}>
            <Ionicons name="refresh" size={16} color="#fff" />
            <Text style={styles.retryBtnText}>Tentar Novamente</Text>
          </FocusableItem>
        </View>
      ) : (
        <ScrollView
          style={styles.mainScrollView}
          contentContainerStyle={styles.mainScrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero Banner em Destaque (Fiel à Imagem 1) */}
          {heroMovie ? (
            <View style={styles.heroContainer}>
              <View style={styles.heroCard}>
                {heroMovie.stream_icon ? (
                  <Image
                    source={{ uri: heroMovie.stream_icon }}
                    style={styles.heroImage}
                    contentFit="cover"
                  />
                ) : (
                  <View style={styles.heroFallback}>
                    <Ionicons name="film" size={64} color="#333" />
                  </View>
                )}

                <LinearGradient
                  colors={['transparent', 'rgba(10,10,12,0.4)', 'rgba(10,10,12,0.98)']}
                  style={styles.heroGradient}
                >
                  <Text style={styles.heroTitle} numberOfLines={2}>
                    {heroMovie.name}
                  </Text>

                  {/* Metadados: Nota, Ano, Formato */}
                  <View style={styles.heroMetaRow}>
                    <View style={styles.metaRatingBox}>
                      <Ionicons name="star" size={12} color="#FFD700" />
                      <Text style={styles.metaRatingText}>{heroRating !== '0' ? heroRating : '8.5'}</Text>
                    </View>
                    <Text style={styles.metaDot}>•</Text>
                    <Text style={styles.metaText}>{heroMovie.added ? new Date(Number(heroMovie.added) * 1000).getFullYear() || '2025' : '2025'}</Text>
                    <Text style={styles.metaDot}>•</Text>
                    <Text style={styles.metaText}>{heroMovie.container_extension?.toUpperCase() || 'HD'}</Text>
                  </View>

                  {/* Botões de Ação: Assistir Agora e Favoritar */}
                  <View style={styles.heroActionsRow}>
                    <FocusableItem
                      style={styles.heroWatchBtn}
                      onPress={() => handlePlayMovie(heroMovie)}
                    >
                      <LinearGradient
                        colors={['#FF6A00', '#FFA000']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.heroWatchGradient}
                      >
                        <Ionicons name="play" size={16} color="#000" />
                        <Text style={styles.heroWatchText}>Assistir agora</Text>
                      </LinearGradient>
                    </FocusableItem>

                    <Pressable
                      style={styles.heroFavBtn}
                      onPress={() => handleToggleFavoriteMovie(heroMovie)}
                    >
                      <Ionicons
                        name={movieFavorites.includes(heroMovie.stream_id) ? 'star' : 'star-outline'}
                        size={20}
                        color={movieFavorites.includes(heroMovie.stream_id) ? '#FFD700' : '#fff'}
                      />
                    </Pressable>
                  </View>

                  {/* Sinopse / Descrição do Filme */}
                  <Text style={styles.heroPlot} numberOfLines={2}>
                    {heroMovie.name ? `Assista agora a "${heroMovie.name}" com áudio e imagem de alta fidelidade.` : 'Filme completo em alta resolução.'}
                  </Text>
                </LinearGradient>
              </View>
            </View>
          ) : null}

          {/* Seção com Carrossel de Cards (Imagem 1) */}
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionTitleBox}>
              <Text style={styles.sectionTitle}>{selectedCategoryName}</Text>
              <View style={styles.sectionCountBadge}>
                <Text style={styles.sectionCountText}>{filteredMovies.length}</Text>
              </View>
            </View>
            <View style={styles.seeAllBtn}>
              <Text style={styles.seeAllText}>Ver todos</Text>
              <Ionicons name="chevron-forward" size={14} color="#FFA000" />
            </View>
          </View>

          {loadingMovies ? (
            <View style={styles.sectionLoadingBox}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.sectionLoadingText}>Carregando filmes...</Text>
            </View>
          ) : filteredMovies.length === 0 ? (
            <View style={styles.emptySectionBox}>
              <Text style={styles.emptySectionText}>Nenhum filme encontrado nesta categoria.</Text>
            </View>
          ) : (
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={filteredMovies}
              keyExtractor={(item) => String(item.stream_id)}
              contentContainerStyle={styles.horizontalCardsList}
              renderItem={({ item }) => {
                const ratingStr = item.rating ? String(item.rating).trim() : '';
                return (
                  <FocusableItem
                    style={styles.cardItem}
                    onPress={() => handlePlayMovie(item)}
                  >
                    <View style={styles.cardPosterBox}>
                      {item.stream_icon ? (
                        <Image
                          source={{ uri: item.stream_icon }}
                          style={styles.cardPoster}
                          contentFit="cover"
                        />
                      ) : (
                        <View style={styles.cardPosterFallback}>
                          <Ionicons name="film-outline" size={32} color="#555" />
                        </View>
                      )}

                      {ratingStr && ratingStr !== '0' ? (
                        <View style={styles.cardRatingBadge}>
                          <Ionicons name="star" size={10} color="#FFD700" />
                          <Text style={styles.cardRatingText}>{ratingStr}</Text>
                        </View>
                      ) : null}

                      {/* Botão Favoritar no Card */}
                      <Pressable
                        style={styles.cardFavBtn}
                        onPress={(e) => {
                          e.stopPropagation();
                          handleToggleFavoriteMovie(item);
                        }}
                        hitSlop={8}
                      >
                        <Ionicons
                          name={movieFavorites.includes(item.stream_id) ? 'star' : 'star-outline'}
                          size={14}
                          color={movieFavorites.includes(item.stream_id) ? '#FFD700' : 'rgba(255,255,255,0.7)'}
                        />
                      </Pressable>
                    </View>
                    <Text style={styles.cardTitle} numberOfLines={2}>
                      {item.name}
                    </Text>
                  </FocusableItem>
                );
              }}
            />
          )}

          {/* Grade Adicional de Títulos Recomendados */}
          {filteredMovies.length > 10 && (
            <View style={styles.gridSection}>
              <Text style={styles.gridSectionTitle}>Mais filmes recomendados</Text>
              <View style={styles.gridRowsWrapper}>
                {filteredMovies.slice(10, 26).map((item) => (
                  <FocusableItem
                    key={item.stream_id}
                    style={styles.gridCardItem}
                    onPress={() => handlePlayMovie(item)}
                  >
                    <View style={styles.gridPosterBox}>
                      {item.stream_icon ? (
                        <Image
                          source={{ uri: item.stream_icon }}
                          style={styles.cardPoster}
                          contentFit="cover"
                        />
                      ) : (
                        <View style={styles.cardPosterFallback}>
                          <Ionicons name="film-outline" size={28} color="#555" />
                        </View>
                      )}
                    </View>
                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {item.name}
                    </Text>
                  </FocusableItem>
                ))}
              </View>
            </View>
          )}
        </ScrollView>
      )}

      {/* Modal Abertura do Filme (Fiel à Imagem 1) */}
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
            {/* Backdrop / Imagem 16:9 no Topo */}
            <View style={styles.backdropWrapper}>
              {selectedMovie?.stream_icon ? (
                <Image
                  source={{ uri: selectedMovie.stream_icon }}
                  style={styles.backdropImage}
                  contentFit="cover"
                />
              ) : (
                <View style={styles.backdropFallback}>
                  <Ionicons name="film" size={64} color="#333" />
                </View>
              )}
              <LinearGradient
                colors={['transparent', 'rgba(7,7,9,0.5)', '#070709']}
                style={styles.backdropGradient}
              />
            </View>

            {/* Informações Principais do Filme */}
            <View style={styles.detailBody}>
              <Text style={styles.detailMovieTitle}>{selectedMovie?.name || ''}</Text>

              {/* Metadados: Ano • Gêneros / Formato */}
              <View style={styles.detailMetaRow}>
                <Text style={styles.detailYearText}>
                  {selectedMovie?.added
                    ? new Date(Number(selectedMovie.added) * 1000).getFullYear() || '2026'
                    : '2026'}
                </Text>
                <Text style={styles.detailMetaDot}>•</Text>
                <Text style={styles.detailGenreText} numberOfLines={1}>
                  {movieDetails?.info?.genre || selectedCategoryName || 'Filme • HD'}
                </Text>
              </View>

              {/* Botão Assistir Grande em Pílula Gradiente */}
              <FocusableItem
                style={styles.detailWatchNowBtn}
                onPress={() => selectedMovie && handleWatchMovie(selectedMovie)}
              >
                <LinearGradient
                  colors={['#FF6A00', '#FFA000']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.detailWatchGradient}
                >
                  <Ionicons name="play" size={18} color="#000" />
                  <Text style={styles.detailWatchText}>Assistir</Text>
                </LinearGradient>
              </FocusableItem>

              {/* Sinopse com "Ver mais" / "Ver menos" */}
              <View style={styles.plotContainer}>
                <Text
                  style={styles.detailPlotText}
                  numberOfLines={isMoviePlotExpanded ? undefined : 3}
                >
                  {movieDetails?.info?.plot ||
                    movieDetails?.movie_data?.plot ||
                    `Acompanhe a história eletrizante de "${selectedMovie?.name}". Uma superprodução com áudio e imagem em alta fidelidade.`}
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

              {/* Três Botões de Ação Horizontais (Fiel à Imagem 1) */}
              <View style={styles.actionButtonsRow}>
                {/* 1. Minha Lista */}
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

                {/* 2. Assistir Depois */}
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

                {/* 3. Favoritar / Nota */}
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
                      selectedMovie &&
                        movieFavorites.includes(selectedMovie.stream_id) && { color: '#FFD700' },
                    ]}
                  >
                    {selectedMovie?.rating && String(selectedMovie.rating) !== '0'
                      ? String(selectedMovie.rating).trim()
                      : 'Favoritar'}
                  </Text>
                </Pressable>
              </View>

              {/* Seção: Você também pode gostar (Recomendados da mesma categoria) */}
              <View style={styles.recommendationsSection}>
                <Text style={styles.recommendationsTitle}>Você também pode gostar</Text>
                <FlatList
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  data={movies
                    .filter((m) => m.stream_id !== selectedMovie?.stream_id)
                    .slice(0, 15)}
                  keyExtractor={(item) => String(item.stream_id)}
                  contentContainerStyle={styles.recommendationsList}
                  renderItem={({ item }) => (
                    <FocusableItem
                      style={styles.recCardItem}
                      onPress={() => openMovieDetails(item)}
                    >
                      <View style={styles.recPosterBox}>
                        {item.stream_icon ? (
                          <Image
                            source={{ uri: item.stream_icon }}
                            style={styles.recPoster}
                            contentFit="cover"
                          />
                        ) : (
                          <Ionicons name="film-outline" size={24} color="#555" />
                        )}
                      </View>
                      <Text style={styles.recItemTitle} numberOfLines={1}>
                        {item.name}
                      </Text>
                    </FocusableItem>
                  )}
                />
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Modal PIN Parental para Filmes Adultos */}
      <Modal
        visible={adultPinModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setAdultPinModalVisible(false);
          setTargetAdultMovie(null);
        }}
      >
        <View style={styles.pinModalBackdrop}>
          <View style={styles.pinModalCard}>
            <View style={styles.pinIconBox}>
              <Ionicons name="lock-closed" size={32} color="#F5A623" />
            </View>

            <Text style={styles.pinModalTitle}>Conteúdo Protegido</Text>
            <Text style={styles.pinModalSubtitle}>
              Este filme é restrito. Digite seu PIN de 4 dígitos para acessar.
            </Text>

            <View style={styles.pinInputRow}>
              <TextInput
                style={[styles.pinTextInput, adultPinError ? styles.pinInputError : null]}
                value={adultPinInput}
                onChangeText={(val) => {
                  setAdultPinError(null);
                  if (val.length <= 4) setAdultPinInput(val.replace(/[^0-9]/g, ''));
                }}
                keyboardType="numeric"
                maxLength={4}
                secureTextEntry
                placeholder="••••"
                placeholderTextColor="#666"
                autoFocus
              />
            </View>

            {adultPinError ? <Text style={styles.pinErrorText}>{adultPinError}</Text> : null}
            <Text style={styles.pinHintText}>PIN padrão inicial: 0000 • Altere no Menu</Text>

            <View style={styles.pinActionsRow}>
              <Pressable
                style={styles.pinCancelBtn}
                onPress={() => {
                  setAdultPinModalVisible(false);
                  setTargetAdultMovie(null);
                }}
              >
                <Text style={styles.pinCancelBtnText}>Cancelar</Text>
              </Pressable>

              <Pressable
                style={[
                  styles.pinConfirmBtn,
                  adultPinInput.length === 4 ? styles.pinConfirmBtnActive : null,
                ]}
                onPress={handleConfirmAdultPin}
              >
                <Text style={styles.pinConfirmBtnText}>Acessar</Text>
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
    backgroundColor: '#070709',
    paddingTop: 36,
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#070709',
  },
  brandBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.3,
  },
  searchIconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#16161d',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#15151c',
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: '#262634',
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 13,
  },

  /* Abas de Categorias Horizontais (Imagem 1) */
  categoriesTabBar: {
    borderBottomWidth: 1,
    borderBottomColor: '#16161f',
    backgroundColor: '#070709',
  },
  categoriesScrollContent: {
    paddingHorizontal: 16,
    gap: 20,
    alignItems: 'center',
    height: 44,
  },
  categoryTabItem: {
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    paddingHorizontal: 2,
  },
  categoryTabItemActive: {},
  categoryTabText: {
    color: '#8E8E93',
    fontSize: 14,
    fontWeight: '600',
  },
  categoryTabTextActive: {
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

  /* Main Scroll Content */
  mainScrollView: {
    flex: 1,
  },
  mainScrollContent: {
    paddingBottom: 110, // Espaço seguro para o menu flutuante suspenso
  },

  /* Hero Banner */
  heroContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    marginBottom: 20,
  },
  heroCard: {
    height: 420,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#121217',
    position: 'relative',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroFallback: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#16161f',
  },
  heroGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 18,
    paddingTop: 80,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  heroMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 8,
  },
  metaRatingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,215,0,0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 4,
  },
  metaRatingText: {
    color: '#FFD700',
    fontSize: 11,
    fontWeight: '800',
  },
  metaDot: {
    color: '#666',
    fontSize: 12,
  },
  metaText: {
    color: '#CCC',
    fontSize: 12,
    fontWeight: '500',
  },
  heroActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 12,
  },
  heroWatchBtn: {
    borderRadius: 22,
    overflow: 'hidden',
    alignSelf: 'flex-start',
  },
  heroFavBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  cardFavBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroWatchGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
    gap: 8,
    borderRadius: 22,
  },
  heroWatchText: {
    color: '#000',
    fontSize: 13,
    fontWeight: '800',
  },
  heroPlot: {
    color: '#AAA',
    fontSize: 12,
    marginTop: 10,
    lineHeight: 16,
  },

  /* Seções de Carrossel */
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sectionTitleBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  sectionCountBadge: {
    backgroundColor: '#1E1E26',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  sectionCountText: {
    color: '#AAA',
    fontSize: 11,
    fontWeight: '700',
  },
  seeAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  seeAllText: {
    color: '#FFA000',
    fontSize: 12,
    fontWeight: '700',
  },
  horizontalCardsList: {
    paddingHorizontal: 16,
    gap: 12,
  },
  cardItem: {
    width: 125,
  },
  cardPosterBox: {
    width: 125,
    height: 185,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#15151c',
    position: 'relative',
    borderWidth: 1,
    borderColor: '#242430',
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
  cardTitle: {
    color: '#DDD',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 6,
    lineHeight: 15,
  },

  /* Grid Adicional */
  gridSection: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  gridSectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 12,
  },
  gridRowsWrapper: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
  },
  gridCardItem: {
    width: (width - 32 - 12) / 2,
    marginBottom: 8,
  },
  gridPosterBox: {
    width: '100%',
    height: 210,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#15151c',
    borderWidth: 1,
    borderColor: '#242430',
  },

  /* Estados de Carregamento e Erro */
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
  errorTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  errorSub: {
    color: '#888',
    fontSize: 12,
    textAlign: 'center',
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 8,
    marginTop: 8,
  },
  retryBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  sectionLoadingBox: {
    paddingVertical: 30,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  sectionLoadingText: {
    color: '#777',
    fontSize: 12,
  },
  emptySectionBox: {
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  emptySectionText: {
    color: '#666',
    fontSize: 13,
  },

  /* Modal de Abertura do Filme (Fiel à Imagem 1) */
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
  backdropFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
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
  recommendationsSection: {
    marginTop: 12,
  },
  recommendationsTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 12,
  },
  recommendationsList: {
    gap: 12,
  },
  recCardItem: {
    width: 110,
  },
  recPosterBox: {
    width: 110,
    height: 165,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#16161f',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#252535',
    marginBottom: 6,
  },
  recPoster: {
    width: '100%',
    height: '100%',
  },
  recItemTitle: {
    color: '#bbb',
    fontSize: 11,
    fontWeight: '600',
  },

  /* Modal PIN Parental */
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
    backgroundColor: '#F5A623',
  },
  pinConfirmBtnText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '800',
  },
});
