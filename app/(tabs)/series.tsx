import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  ActivityIndicator,
  useWindowDimensions,
  Pressable,
  Modal,
  ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { storage, MediaListItem } from '../../src/services/storage';
import { XtreamClient } from '../../src/services/xtreamClient';
import { IptvCategory, SeriesItem, SeriesInfoResponse, SavedAccount } from '../../src/types/iptv';
import { FocusableItem } from '../../src/components/common/FocusableItem';
import { isAdultCategory } from '../../src/services/parentalControl';
import { EnrichedPosterImage } from '../../src/components/common/EnrichedPosterImage';

export default function SeriesScreen() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const numGridColumns = isLandscape ? 5 : 3;
  const gridCardWidth = (width - 32 - (numGridColumns - 1) * 12) / numGridColumns;
  const params = useLocalSearchParams<{ brand?: string; brandName?: string; seriesId?: string }>();
  const [categories, setCategories] = useState<IptvCategory[]>([]);
  const [seriesList, setSeriesList] = useState<SeriesItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('for_you');
  const [selectedCategoryName, setSelectedCategoryName] = useState<string>('Para você');
  const [selectedBrandName, setSelectedBrandName] = useState<string | null>(params.brandName || null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingSeries, setLoadingSeries] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [account, setAccount] = useState<SavedAccount | null>(null);
  const [seriesFavorites, setSeriesFavorites] = useState<number[]>([]);

  // Hero Item
  const [heroSeries, setHeroSeries] = useState<SeriesItem | null>(null);

  const pickRandomSeries = (list: SeriesItem[]) => {
    if (!list || list.length === 0) return null;
    const pool = list.slice(0, Math.min(list.length, 30));
    return pool[Math.floor(Math.random() * pool.length)] || list[0];
  };

  // Detail Modal state (Fiel à Imagem 2)
  const [selectedSeries, setSelectedSeries] = useState<SeriesItem | null>(null);
  const [seriesInfo, setSeriesInfo] = useState<SeriesInfoResponse | null>(null);
  const [activeSeason, setActiveSeason] = useState<string>('1');
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [isSeriesInList, setIsSeriesInList] = useState(false);
  const [isSeriesWatchLater, setIsSeriesWatchLater] = useState(false);
  const [isSeriesPlotExpanded, setIsSeriesPlotExpanded] = useState(false);
  const [seriesDetailSubTab, setSeriesDetailSubTab] = useState<'episodes' | 'similar'>('episodes');

  // Parental PIN para Séries Adultas
  const [targetAdultSeries, setTargetAdultSeries] = useState<SeriesItem | null>(null);
  const [adultPinModalVisible, setAdultPinModalVisible] = useState(false);
  const [adultPinInput, setAdultPinInput] = useState('');
  const [adultPinError, setAdultPinError] = useState<string | null>(null);

  useEffect(() => {
    initSeries();
  }, [params.brand]);

  useEffect(() => {
    if (params.seriesId && account) {
      handleOpenSeriesFromParam(Number(params.seriesId));
    }
  }, [params.seriesId, account]);

  const handleOpenSeriesFromParam = async (seriesId: number) => {
    const found = seriesList.find((s) => s.series_id === seriesId);
    if (found) {
      handleSeriesClick(found);
      return;
    }
    if (account) {
      try {
        const client = new XtreamClient(account.serverUrl, account.username, account.password);
        const info = await client.getSeriesInfo(seriesId);
        const seriesObj: SeriesItem = {
          num: 0,
          name: info?.info?.name || 'Série',
          series_id: seriesId,
          cover: info?.info?.cover || '',
          plot: info?.info?.plot || '',
          cast: info?.info?.cast || '',
          director: info?.info?.director || '',
          genre: info?.info?.genre || '',
          releaseDate: info?.info?.releaseDate || '',
          rating: info?.info?.rating || '0',
          rating_5based: 0,
          category_id: (info?.info as any)?.category_id || '',
        };
        handleSeriesClick(seriesObj);
      } catch (e) {
        console.warn('Erro ao carregar serie por param:', e);
      }
    }
  };

  const initSeries = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const active = await storage.getActiveAccount();
      if (!active) {
        router.replace('/login');
        return;
      }
      setAccount(active);

      const favs = await storage.getSeriesFavorites();
      setSeriesFavorites(favs || []);

      const client = new XtreamClient(active.serverUrl, active.username, active.password);
      const cats = await client.getSeriesCategories();
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
          const s = await client.getSeries(matchingCat.category_id);
          setSeriesList(s || []);
          if (s && s.length > 0) setHeroSeries(pickRandomSeries(s));
          return;
        } else {
          // Marca de streaming não encontrada na lista IPTV do usuário
          setSelectedCategory(params.brand);
          setSelectedCategoryName(params.brandName || params.brand);
          setSelectedBrandName(params.brandName || params.brand);
          setSeriesList([]);
          setHeroSeries(null);
          return;
        }
      }

      // Carga inicial para "Para você": Carrega séries da primeira categoria para exibição imediata
      let initialSeries: SeriesItem[] = [];
      if (cats && cats.length > 0) {
        try {
          initialSeries = (await client.getSeries(cats[0].category_id)) || [];
        } catch (e) {
          console.warn('Erro ao carregar séries da primeira categoria:', e);
        }
      }
      if (initialSeries.length === 0) {
        try {
          const allS = await client.getSeries();
          initialSeries = allS || [];
        } catch (e) {}
      }
      setSeriesList(initialSeries);
      if (initialSeries.length > 0) setHeroSeries(pickRandomSeries(initialSeries));
    } catch (err: any) {
      console.warn('Error loading series:', err);
      setErrorMessage(err?.message || 'Falha ao carregar catálogo de séries.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectCategory = async (catId: string, catName: string) => {
    setSelectedCategory(catId);
    setSelectedCategoryName(catName);
    if (!account) return;
    setLoadingSeries(true);
    try {
      if (catId === 'favorites') {
        const favSeries = await storage.getFavoriteSeries();
        setSeriesList(favSeries || []);
        if (favSeries && favSeries.length > 0) {
          setHeroSeries(pickRandomSeries(favSeries));
        }
        return;
      }

      const client = new XtreamClient(account.serverUrl, account.username, account.password);
      let s: SeriesItem[] = [];
      if (catId === 'for_you') {
        const firstCatId = categories[0]?.category_id;
        s = firstCatId
          ? (await client.getSeries(firstCatId)) || []
          : (await client.getSeries()) || [];
      } else if (catId === 'all') {
        // Carrega todas as séries sem filtro de categoria
        s = (await client.getSeries()) || [];
      } else {
        s = (await client.getSeries(catId)) || [];
      }

      setSeriesList(s || []);
      if (s && s.length > 0) {
        setHeroSeries(pickRandomSeries(s));
      }
    } catch (err) {
      console.warn(err);
    } finally {
      setLoadingSeries(false);
    }
  };

  const handleToggleFavoriteSeries = async (series: SeriesItem) => {
    const isFavNow = await storage.toggleFavoriteSeries(series);
    const updatedFavs = await storage.getSeriesFavorites();
    setSeriesFavorites(updatedFavs);

    if (selectedCategory === 'favorites') {
      const favSeries = await storage.getFavoriteSeries();
      setSeriesList(favSeries);
      if (heroSeries?.series_id === series.series_id && favSeries.length > 0) {
        setHeroSeries(favSeries[0]);
      }
    }
  };

  const handleSeriesClick = (item: SeriesItem) => {
    const isAdult =
      isAdultCategory(selectedCategoryName) ||
      isAdultCategory(item.name) ||
      (item.category_id && categories.some((c) => c.category_id === item.category_id && isAdultCategory(c.category_name)));

    if (isAdult) {
      setTargetAdultSeries(item);
      setAdultPinInput('');
      setAdultPinError(null);
      setAdultPinModalVisible(true);
      return;
    }

    handleOpenSeries(item);
  };

  const handleConfirmAdultSeriesPin = async () => {
    if (adultPinInput.trim().length !== 4) {
      setAdultPinError('Digite o PIN de 4 dígitos.');
      return;
    }

    const isValid = await storage.verifyParentalPin(adultPinInput);
    if (isValid) {
      setAdultPinModalVisible(false);
      if (targetAdultSeries) {
        const item = targetAdultSeries;
        setTargetAdultSeries(null);
        handleOpenSeries(item);
      }
    } else {
      setAdultPinError('PIN incorreto. (Padrão: 0000)');
    }
  };

  const handleOpenSeries = async (item: SeriesItem) => {
    setSelectedSeries(item);
    setSeriesInfo(null);
    setIsSeriesPlotExpanded(false);
    setSeriesDetailSubTab('episodes');
    setLoadingInfo(true);

    try {
      const inList = await storage.isInMyList(item.series_id);
      setIsSeriesInList(inList);
      const inWatchLater = await storage.isInWatchLater(item.series_id);
      setIsSeriesWatchLater(inWatchLater);

      if (account) {
        const client = new XtreamClient(account.serverUrl, account.username, account.password);
        const info = await client.getSeriesInfo(item.series_id);
        setSeriesInfo(info);
        const firstSeason = Object.keys(info?.episodes || {})[0] || '1';
        setActiveSeason(firstSeason);
      }
    } catch (err) {
      console.warn('Error fetching series info:', err);
    } finally {
      setLoadingInfo(false);
    }
  };

  const handleWatchFirstEpisode = async (series: SeriesItem) => {
    // Sempre que clicar em assistir já incluir na minha lista
    const mediaItem: MediaListItem = {
      id: series.series_id,
      title: series.name,
      poster: series.cover,
      backdrop: seriesInfo?.info?.backdrop_path?.[0] || series.cover,
      type: 'series',
      category_id: series.category_id,
      category_name: selectedCategoryName,
      rating: series.rating ? String(series.rating) : undefined,
      year: series.releaseDate?.slice(0, 4) || '2025',
      genre: series.genre || seriesInfo?.info?.genre,
      plot: seriesInfo?.info?.plot || series.plot,
      addedAt: Date.now(),
      rawItem: series,
    };
    await storage.addToMyList(mediaItem);
    setIsSeriesInList(true);

    // Verifica se já existe o último episódio visto salvo desta série para continuar diretamente
    const saved = await storage.getWatchProgress(series.series_id);
    if (saved && saved.id) {
      setSelectedSeries(null);
      router.push({
        pathname: '/player/[id]',
        params: {
          id: String(saved.id),
          type: 'series',
          title: saved.title,
          extension: saved.extension || 'mp4',
          icon: saved.poster || series.cover,
          streamUrl: saved.streamUrl || '',
          startPosition: String(saved.positionSec || 0),
          seriesId: String(series.series_id),
          seriesTitle: series.name,
          seasonNum: saved.seasonNum ? String(saved.seasonNum) : undefined,
          episodeNum: saved.episodeNum ? String(saved.episodeNum) : undefined,
        },
      });
      return;
    }

    // Encontra o primeiro episódio disponível
    const currentSeasonEps = seriesInfo?.episodes?.[activeSeason] || [];
    const firstEp = currentSeasonEps[0] || Object.values(seriesInfo?.episodes || {})?.[0]?.[0];

    if (firstEp) {
      setSelectedSeries(null);
      router.push({
        pathname: '/player/[id]',
        params: {
          id: firstEp.id,
          type: 'series',
          title: `${series.name} - T${activeSeason}:E${firstEp.episode_num} ${firstEp.title || ''}`,
          extension: firstEp.container_extension || 'mp4',
          icon: series.cover,
          seriesId: String(series.series_id),
          seriesTitle: series.name,
          seasonNum: String(activeSeason),
          episodeNum: String(firstEp.episode_num),
        },
      });
    }
  };

  const handlePlayEpisode = async (series: SeriesItem, ep: any, seasonNum: string) => {
    // Regra: Sempre que clicar em assistir já incluir na minha lista
    const mediaItem: MediaListItem = {
      id: series.series_id,
      title: series.name,
      poster: series.cover,
      backdrop: seriesInfo?.info?.backdrop_path?.[0] || series.cover,
      type: 'series',
      category_id: series.category_id,
      category_name: selectedCategoryName,
      rating: series.rating ? String(series.rating) : undefined,
      year: series.releaseDate?.slice(0, 4) || '2025',
      genre: series.genre || seriesInfo?.info?.genre,
      plot: seriesInfo?.info?.plot || series.plot,
      addedAt: Date.now(),
      rawItem: series,
    };
    await storage.addToMyList(mediaItem);
    setIsSeriesInList(true);

    setSelectedSeries(null);
    router.push({
      pathname: '/player/[id]',
      params: {
        id: ep.id,
        type: 'series',
        title: `${series.name} - T${seasonNum}:E${ep.episode_num} ${ep.title || ''}`,
        extension: ep.container_extension || 'mp4',
        icon: series.cover,
        seriesId: String(series.series_id),
        seriesTitle: series.name,
        seasonNum: String(seasonNum),
        episodeNum: String(ep.episode_num),
      },
    });
  };

  const handleToggleMyListSeries = async (series: SeriesItem) => {
    const mediaItem: MediaListItem = {
      id: series.series_id,
      title: series.name,
      poster: series.cover,
      backdrop: seriesInfo?.info?.backdrop_path?.[0] || series.cover,
      type: 'series',
      category_id: series.category_id,
      category_name: selectedCategoryName,
      rating: series.rating ? String(series.rating) : undefined,
      year: series.releaseDate?.slice(0, 4) || '2025',
      genre: series.genre || seriesInfo?.info?.genre,
      plot: seriesInfo?.info?.plot || series.plot,
      addedAt: Date.now(),
      rawItem: series,
    };

    const inList = await storage.toggleMyList(mediaItem);
    setIsSeriesInList(inList);
  };

  const handleToggleWatchLaterSeries = async (series: SeriesItem) => {
    const mediaItem: MediaListItem = {
      id: series.series_id,
      title: series.name,
      poster: series.cover,
      backdrop: seriesInfo?.info?.backdrop_path?.[0] || series.cover,
      type: 'series',
      category_id: series.category_id,
      category_name: selectedCategoryName,
      rating: series.rating ? String(series.rating) : undefined,
      year: series.releaseDate?.slice(0, 4) || '2025',
      genre: series.genre || seriesInfo?.info?.genre,
      plot: seriesInfo?.info?.plot || series.plot,
      addedAt: Date.now(),
      rawItem: series,
    };

    const inWatchLater = await storage.toggleWatchLater(mediaItem);
    setIsSeriesWatchLater(inWatchLater);
  };

  const filteredSeries = seriesList.filter((s) =>
    (s.name || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const heroRating = heroSeries?.rating ? String(heroSeries.rating).trim() : '8.0';

  return (
    <View style={styles.container}>
      {/* Top Header com design limpo (Ícone da TV e Busca) */}
      <View style={styles.topHeader}>
        <View style={styles.brandBox}>
          <Ionicons name="tv" size={24} color={colors.primary} />
          <Text style={styles.brandTitle}>Séries</Text>
        </View>

        <Pressable
          style={styles.searchIconButton}
          onPress={() => router.push({ pathname: '/search', params: { initialType: 'series' } })}
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
            placeholder="Buscar séries pelo nome..."
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

          {/* Aba: Todas as Séries (Abre diretamente na tela de catálogo completo com paginação) */}
          <Pressable
            style={styles.categoryTabItem}
            onPress={() => {
              router.push({
                pathname: '/search',
                params: {
                  initialType: 'series',
                  categoryId: 'all',
                  categoryName: 'Todas as Séries',
                },
              });
            }}
          >
            <Text style={styles.categoryTabText}>
              Todas as Séries
            </Text>
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
          <Text style={styles.loadingText}>Carregando catálogo de séries...</Text>
        </View>
      ) : errorMessage && filteredSeries.length === 0 ? (
        <View style={styles.centerBox}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.warning} />
          <Text style={styles.errorTitle}>Não foi possível carregar as séries</Text>
          <Text style={styles.errorSub}>{errorMessage}</Text>
          <FocusableItem style={styles.retryBtn} onPress={() => initSeries()}>
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
          {/* Hero Banner em Destaque */}
          {heroSeries ? (
            <View style={styles.heroContainer}>
              {isLandscape ? (
                <View style={styles.heroCardLandscape}>
                  {/* Pôster estilo Filmes Recentes no lado esquerdo */}
                  <View style={styles.heroLandscapePosterBox}>
                    <EnrichedPosterImage
                      sourceUri={heroSeries.cover}
                      title={heroSeries.name}
                      type="series"
                      style={styles.heroLandscapePoster}
                      contentFit="cover"
                      fallbackIcon="albums-outline"
                    />
                    {heroRating !== '0' ? (
                      <View style={styles.heroLandscapeRatingBadge}>
                        <Ionicons name="star" size={11} color="#FFD700" />
                        <Text style={styles.heroLandscapeRatingText}>{heroRating}</Text>
                      </View>
                    ) : null}
                  </View>

                  {/* Informações ao lado */}
                  <View style={styles.heroLandscapeInfo}>
                    <Text style={styles.heroLandscapeTitle} numberOfLines={2}>
                      {heroSeries.name}
                    </Text>

                    <View style={styles.heroLandscapeMetaRow}>
                      <View style={styles.metaRatingBox}>
                        <Ionicons name="star" size={12} color="#FFD700" />
                        <Text style={styles.metaRatingText}>{heroRating !== '0' ? heroRating : '8.0'}</Text>
                      </View>
                      <Text style={styles.metaDot}>•</Text>
                      <Text style={styles.metaText}>{heroSeries.releaseDate?.slice(0, 4) || '2025'}</Text>
                      {heroSeries.genre ? (
                        <>
                          <Text style={styles.metaDot}>•</Text>
                          <Text style={styles.metaText} numberOfLines={1}>{heroSeries.genre}</Text>
                        </>
                      ) : null}
                    </View>

                    <Text style={styles.heroLandscapePlot} numberOfLines={2}>
                      {heroSeries.plot || 'Uma história envolvente e emocionante repleta de reviravoltas imperdíveis.'}
                    </Text>

                    <View style={styles.heroLandscapeActionsRow}>
                      <FocusableItem
                        style={styles.heroWatchBtn}
                        onPress={() => handleSeriesClick(heroSeries)}
                      >
                        <LinearGradient
                          colors={['#00E5FF', '#A855F7']}
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
                        onPress={() => handleToggleFavoriteSeries(heroSeries)}
                      >
                        <Ionicons
                          name={seriesFavorites.includes(heroSeries.series_id) ? 'star' : 'star-outline'}
                          size={20}
                          color={seriesFavorites.includes(heroSeries.series_id) ? '#FFD700' : '#fff'}
                        />
                      </Pressable>
                    </View>
                  </View>
                </View>
              ) : (
                <View style={styles.heroCard}>
                  <EnrichedPosterImage
                    sourceUri={heroSeries.cover}
                    title={heroSeries.name}
                    type="series"
                    style={styles.heroImage}
                    contentFit="cover"
                    fallbackIcon="albums-outline"
                  />

                  <LinearGradient
                    colors={['transparent', 'rgba(10,10,12,0.4)', 'rgba(10,10,12,0.98)']}
                    style={styles.heroGradient}
                  >
                    <Text style={styles.heroTitle} numberOfLines={2}>
                      {heroSeries.name}
                    </Text>

                    {/* Metadados: Nota, Ano, Gênero */}
                    <View style={styles.heroMetaRow}>
                      <View style={styles.metaRatingBox}>
                        <Ionicons name="star" size={12} color="#FFD700" />
                        <Text style={styles.metaRatingText}>{heroRating !== '0' ? heroRating : '8.0'}</Text>
                      </View>
                      <Text style={styles.metaDot}>•</Text>
                      <Text style={styles.metaText}>{heroSeries.releaseDate?.slice(0, 4) || '2025'}</Text>
                      {heroSeries.genre ? (
                        <>
                          <Text style={styles.metaDot}>•</Text>
                          <Text style={styles.metaText} numberOfLines={1}>{heroSeries.genre}</Text>
                        </>
                      ) : null}
                    </View>

                    {/* Botões de Ação: Assistir Agora e Favoritar */}
                    <View style={styles.heroActionsRow}>
                      <FocusableItem
                        style={styles.heroWatchBtn}
                        onPress={() => handleSeriesClick(heroSeries)}
                      >
                        <LinearGradient
                          colors={['#00E5FF', '#A855F7']}
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
                        onPress={() => handleToggleFavoriteSeries(heroSeries)}
                      >
                        <Ionicons
                          name={seriesFavorites.includes(heroSeries.series_id) ? 'star' : 'star-outline'}
                          size={20}
                          color={seriesFavorites.includes(heroSeries.series_id) ? '#FFD700' : '#fff'}
                        />
                      </Pressable>
                    </View>

                    {/* Sinopse da Série */}
                    <Text style={styles.heroPlot} numberOfLines={2}>
                      {heroSeries.plot || 'Uma história envolvente e emocionante repleta de reviravoltas imperdíveis.'}
                    </Text>
                  </LinearGradient>
                </View>
              )}
            </View>
          ) : null}

          {/* Seção com Carrossel de Cards e Ação Ver Todos */}
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionTitleBox}>
              <Text style={styles.sectionTitle}>{selectedCategoryName}</Text>
              <View style={styles.sectionCountBadge}>
                <Text style={styles.sectionCountText}>{filteredSeries.length}</Text>
              </View>
            </View>
            <Pressable
              style={styles.seeAllBtn}
              onPress={() => {
                router.push({
                  pathname: '/search',
                  params: {
                    initialType: 'series',
                    categoryId: selectedCategory === 'for_you' ? 'all' : selectedCategory,
                    categoryName: selectedCategoryName,
                  },
                });
              }}
              hitSlop={8}
            >
              <Text style={styles.seeAllText}>Ver todos</Text>
              <Ionicons
                name="chevron-forward"
                size={14}
                color={colors.primary}
              />
            </Pressable>
          </View>

          {loadingSeries ? (
            <View style={styles.sectionLoadingBox}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.sectionLoadingText}>Carregando títulos...</Text>
            </View>
          ) : filteredSeries.length === 0 ? (
            <View style={styles.emptySectionBox}>
              <Text style={styles.emptySectionText}>Nenhum conteúdo encontrado nesta categoria.</Text>
            </View>
          ) : (
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={filteredSeries}
              keyExtractor={(item) => String(item.series_id)}
              contentContainerStyle={styles.horizontalCardsList}
              renderItem={({ item }) => {
                const ratingStr = item.rating ? String(item.rating).trim() : '';
                return (
                  <FocusableItem
                    style={styles.cardItem}
                    onPress={() => handleSeriesClick(item)}
                  >
                    <View style={styles.cardPosterBox}>
                      <EnrichedPosterImage
                        sourceUri={item.cover}
                        title={item.name}
                        type="series"
                        style={styles.cardPoster}
                        contentFit="cover"
                        fallbackIcon="albums-outline"
                      />

                      {ratingStr && ratingStr !== '0' ? (
                        <View style={styles.cardRatingBadge}>
                          <Ionicons name="star" size={10} color="#FFD700" />
                          <Text style={styles.cardRatingText}>{ratingStr}</Text>
                        </View>
                      ) : null}

                      {/* Botão Favoritar no Card de Série */}
                      <Pressable
                        style={styles.cardFavBtn}
                        onPress={(e) => {
                          e.stopPropagation();
                          handleToggleFavoriteSeries(item);
                        }}
                        hitSlop={8}
                      >
                        <Ionicons
                          name={seriesFavorites.includes(item.series_id) ? 'star' : 'star-outline'}
                          size={14}
                          color={seriesFavorites.includes(item.series_id) ? '#FFD700' : 'rgba(255,255,255,0.7)'}
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

          {/* Mais uma linha com grade de exploração caso haja mais de 10 itens */}
          {filteredSeries.length > 10 && (
            <View style={styles.gridSection}>
              <Text style={styles.gridSectionTitle}>Mais títulos recomendados</Text>
              <View style={styles.gridRowsWrapper}>
                {filteredSeries.slice(10, 25).map((item) => (
                  <FocusableItem
                    key={item.series_id}
                    style={[styles.gridCardItem, { width: gridCardWidth }]}
                    onPress={() => handleSeriesClick(item)}
                  >
                    <View style={[styles.gridPosterBox, { width: '100%', height: gridCardWidth * 1.5 }]}>
                      <EnrichedPosterImage
                        sourceUri={item.cover}
                        title={item.name}
                        type="series"
                        style={styles.cardPoster}
                        contentFit="cover"
                        fallbackIcon="albums-outline"
                      />
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

      {/* Modal Detalhes da Série / Episódios (Fiel à Imagem 2) */}
      <Modal
        visible={Boolean(selectedSeries)}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setSelectedSeries(null)}
      >
        <View style={styles.modalContainer}>
          {/* Top Bar com botão voltar e título */}
          <View style={styles.seriesDetailTopBar}>
            <Pressable
              style={styles.detailBackBtn}
              onPress={() => setSelectedSeries(null)}
              hitSlop={10}
            >
              <Ionicons name="chevron-back" size={26} color="#fff" />
            </Pressable>
            <Text style={styles.detailTopBarTitle} numberOfLines={1}>
              {selectedSeries?.name || ''}
            </Text>
          </View>

          {loadingInfo ? (
            <View style={styles.centerBox}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>Carregando episódios e detalhes...</Text>
            </View>
          ) : (
            <ScrollView
              style={styles.detailScrollView}
              contentContainerStyle={styles.detailScrollContent}
              showsVerticalScrollIndicator={false}
            >
              {/* Backdrop / Imagem 16:9 no Topo */}
              <View style={styles.backdropWrapper}>
                <EnrichedPosterImage
                  sourceUri={selectedSeries?.cover}
                  title={selectedSeries?.name || ''}
                  type="series"
                  style={styles.backdropImage}
                  contentFit="cover"
                  fallbackIcon="albums-outline"
                />
                <LinearGradient
                  colors={['transparent', 'rgba(7,7,9,0.5)', '#070709']}
                  style={styles.backdropGradient}
                />
              </View>

              {/* Informações Principais da Série */}
              <View style={styles.detailBody}>
                <Text style={styles.detailSeriesTitle}>{selectedSeries?.name || ''}</Text>

                {/* Metadados: Ano • Qtd Temporadas • Gêneros */}
                <View style={styles.detailMetaRow}>
                  <Text style={styles.detailYearText}>
                    {selectedSeries?.releaseDate?.slice(0, 4) || '2025'}
                  </Text>
                  <Text style={styles.detailMetaDot}>•</Text>
                  <Text style={styles.detailMetaText}>
                    {seriesInfo?.episodes ? `${Object.keys(seriesInfo.episodes).length} Temporadas` : '1 Temporada'}
                  </Text>
                  <Text style={styles.detailMetaDot}>•</Text>
                  <Text style={styles.detailGenreText} numberOfLines={1}>
                    {selectedSeries?.genre || seriesInfo?.info?.genre || selectedCategoryName || 'Série'}
                  </Text>
                </View>

                {/* Botão Assistir Grande em Pílula Gradiente */}
                <FocusableItem
                  style={styles.detailWatchNowBtn}
                  onPress={() => selectedSeries && handleWatchFirstEpisode(selectedSeries)}
                >
                  <LinearGradient
                    colors={['#00E5FF', '#A855F7']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.detailWatchGradient}
                  >
                    <Ionicons name="play" size={18} color="#000" />
                    <Text style={styles.detailWatchText}>Assistir</Text>
                  </LinearGradient>
                </FocusableItem>

                {/* Info do Episódio em Destaque */}
                <Text style={styles.episodeHighlightText}>
                  T{activeSeason} E1 • Episódio 1
                </Text>

                {/* Sinopse com "Ver mais" / "Ver menos" */}
                <View style={styles.plotContainer}>
                  <Text
                    style={styles.detailPlotText}
                    numberOfLines={isSeriesPlotExpanded ? undefined : 3}
                  >
                    {seriesInfo?.info?.plot ||
                      selectedSeries?.plot ||
                      `Assista a todos os episódios imperdíveis de "${selectedSeries?.name}". Alta definição e som envolvente.`}
                  </Text>
                  <Pressable onPress={() => setIsSeriesPlotExpanded(!isSeriesPlotExpanded)}>
                    <Text style={styles.plotToggleText}>
                      {isSeriesPlotExpanded ? 'Ver menos' : 'Ver mais'}
                    </Text>
                  </Pressable>
                </View>

                {/* Elenco e Direção */}
                {seriesInfo?.info?.cast ? (
                  <Text style={styles.detailCreditsText} numberOfLines={2}>
                    <Text style={styles.creditsLabel}>Elenco: </Text>
                    {seriesInfo.info.cast}
                  </Text>
                ) : null}

                {seriesInfo?.info?.director ? (
                  <Text style={styles.detailCreditsText} numberOfLines={1}>
                    <Text style={styles.creditsLabel}>Direção: </Text>
                    {seriesInfo.info.director}
                  </Text>
                ) : null}

                {/* Três Botões de Ação Horizontais (Fiel à Imagem 2) */}
                <View style={styles.actionButtonsRow}>
                  {/* 1. Minha Lista */}
                  <Pressable
                    style={styles.actionItemBtn}
                    onPress={() => selectedSeries && handleToggleMyListSeries(selectedSeries)}
                  >
                    <Ionicons
                      name={isSeriesInList ? 'checkmark-circle' : 'add'}
                      size={24}
                      color={isSeriesInList ? colors.primary : '#fff'}
                    />
                    <Text style={[styles.actionBtnLabel, isSeriesInList && { color: colors.primary }]}>
                      {isSeriesInList ? 'Na lista' : 'Minha lista'}
                    </Text>
                  </Pressable>

                  {/* 2. Assistir Depois */}
                  <Pressable
                    style={styles.actionItemBtn}
                    onPress={() => selectedSeries && handleToggleWatchLaterSeries(selectedSeries)}
                  >
                    <Ionicons
                      name={isSeriesWatchLater ? 'time' : 'time-outline'}
                      size={24}
                      color={isSeriesWatchLater ? colors.primary : '#fff'}
                    />
                    <Text style={[styles.actionBtnLabel, isSeriesWatchLater && { color: colors.primary }]}>
                      {isSeriesWatchLater ? 'Salvo' : 'Assistir depois'}
                    </Text>
                  </Pressable>

                  {/* 3. Favoritar / Nota */}
                  <Pressable
                    style={styles.actionItemBtn}
                    onPress={() => selectedSeries && handleToggleFavoriteSeries(selectedSeries)}
                  >
                    <Ionicons
                      name={
                        selectedSeries && seriesFavorites.includes(selectedSeries.series_id)
                          ? 'star'
                          : 'star-outline'
                      }
                      size={24}
                      color={
                        selectedSeries && seriesFavorites.includes(selectedSeries.series_id)
                          ? '#FFD700'
                          : '#fff'
                      }
                    />
                    <Text
                      style={[
                        styles.actionBtnLabel,
                        selectedSeries &&
                          seriesFavorites.includes(selectedSeries.series_id) && { color: '#FFD700' },
                      ]}
                    >
                      {selectedSeries?.rating && String(selectedSeries.rating) !== '0'
                        ? String(selectedSeries.rating).trim()
                        : 'Favoritar'}
                    </Text>
                  </Pressable>
                </View>

                {/* Abas: Episódios | Títulos Semelhantes (Fiel à Imagem 2) */}
                <View style={styles.subTabsRow}>
                  <Pressable
                    style={[styles.subTabItem, seriesDetailSubTab === 'episodes' && styles.subTabItemActive]}
                    onPress={() => setSeriesDetailSubTab('episodes')}
                  >
                    <Text
                      style={[
                        styles.subTabText,
                        seriesDetailSubTab === 'episodes' && styles.subTabTextActive,
                      ]}
                    >
                      Episódios
                    </Text>
                    {seriesDetailSubTab === 'episodes' && <View style={styles.activeSubTabIndicator} />}
                  </Pressable>

                  <Pressable
                    style={[styles.subTabItem, seriesDetailSubTab === 'similar' && styles.subTabItemActive]}
                    onPress={() => setSeriesDetailSubTab('similar')}
                  >
                    <Text
                      style={[
                        styles.subTabText,
                        seriesDetailSubTab === 'similar' && styles.subTabTextActive,
                      ]}
                    >
                      Títulos semelhantes
                    </Text>
                    {seriesDetailSubTab === 'similar' && <View style={styles.activeSubTabIndicator} />}
                  </Pressable>
                </View>

                {/* Conteúdo da Aba: Episódios (Mantendo nosso estilo aprovado) */}
                {seriesDetailSubTab === 'episodes' ? (
                  <View style={styles.episodesTabContent}>
                    {/* Seletor de Temporadas */}
                    {seriesInfo?.episodes && Object.keys(seriesInfo.episodes).length > 0 ? (
                      <>
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={styles.seasonsScrollContent}
                        >
                          {Object.keys(seriesInfo.episodes).map((seasonNum) => {
                            const isActive = activeSeason === seasonNum;
                            return (
                              <FocusableItem
                                key={seasonNum}
                                style={[styles.seasonChip, isActive && styles.seasonChipActive]}
                                onPress={() => setActiveSeason(seasonNum)}
                              >
                                <Text
                                  style={[
                                    styles.seasonChipText,
                                    isActive && styles.seasonChipTextActive,
                                  ]}
                                >
                                  Temporada {seasonNum}
                                </Text>
                              </FocusableItem>
                            );
                          })}
                        </ScrollView>

                        {/* Lista dos Episódios da Temporada Ativa */}
                        <View style={styles.episodesListWrapper}>
                          {(seriesInfo.episodes[activeSeason] || []).map((ep) => (
                            <FocusableItem
                              key={ep.id}
                              style={styles.episodeCard}
                              onPress={() =>
                                selectedSeries && handlePlayEpisode(selectedSeries, ep, activeSeason)
                              }
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
                        </View>
                      </>
                    ) : (
                      <Text style={styles.emptyEpisodesText}>
                        Nenhum episódio cadastrado nesta série.
                      </Text>
                    )}
                  </View>
                ) : (
                  /* Conteúdo da Aba: Títulos Semelhantes (Recomendados da mesma categoria) */
                  <View style={styles.similarSection}>
                    <FlatList
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      data={seriesList
                        .filter((s) => s.series_id !== selectedSeries?.series_id)
                        .slice(0, 15)}
                      keyExtractor={(item) => String(item.series_id)}
                      contentContainerStyle={styles.recommendationsList}
                      renderItem={({ item }) => (
                        <FocusableItem
                          style={styles.recCardItem}
                          onPress={() => handleOpenSeries(item)}
                        >
                          <View style={styles.recPosterBox}>
                            {item.cover ? (
                              <Image
                                source={{ uri: item.cover }}
                                style={styles.recPoster}
                                contentFit="cover"
                              />
                            ) : (
                              <Ionicons name="albums-outline" size={24} color="#555" />
                            )}
                          </View>
                          <Text style={styles.recItemTitle} numberOfLines={1}>
                            {item.name}
                          </Text>
                        </FocusableItem>
                      )}
                    />
                  </View>
                )}
              </View>
            </ScrollView>
          )}
        </View>
      </Modal>

      {/* Modal PIN Parental para Séries Adultas */}
      <Modal
        visible={adultPinModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setAdultPinModalVisible(false);
          setTargetAdultSeries(null);
        }}
      >
        <View style={styles.pinModalBackdrop}>
          <View style={styles.pinModalCard}>
            <View style={styles.pinIconBox}>
              <Ionicons name="lock-closed" size={32} color="#F5A623" />
            </View>

            <Text style={styles.pinModalTitle}>Conteúdo Protegido</Text>
            <Text style={styles.pinModalSubtitle}>
              Esta série é restrita. Digite seu PIN de 4 dígitos para acessar.
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
                  setTargetAdultSeries(null);
                }}
              >
                <Text style={styles.pinCancelBtnText}>Cancelar</Text>
              </Pressable>

              <Pressable
                style={[
                  styles.pinConfirmBtn,
                  adultPinInput.length === 4 ? styles.pinConfirmBtnActive : null,
                ]}
                onPress={handleConfirmAdultSeriesPin}
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
  activeTabTabHighlight: {},
  activeTabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2.5,
    backgroundColor: colors.primary,
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
    height: 205,
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
    gap: 8,
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
    gap: 8,
  },
  heroLandscapePlot: {
    color: '#aaa',
    fontSize: 12,
    lineHeight: 16,
  },
  heroLandscapeActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
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
    color: colors.primary,
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

  /* Modal de Abertura de Série (Fiel à Imagem 2) */
  modalContainer: {
    flex: 1,
    backgroundColor: '#070709',
  },
  seriesDetailTopBar: {
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
  detailSeriesTitle: {
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
  detailMetaText: {
    color: '#8E8E93',
    fontSize: 13,
    fontWeight: '600',
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
    marginBottom: 12,
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
  episodeHighlightText: {
    color: '#CCCCCC',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 10,
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

  /* Abas: Episódios | Títulos Semelhantes (Fiel à Imagem 2) */
  subTabsRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e28',
    marginBottom: 16,
    gap: 24,
  },
  subTabItem: {
    paddingBottom: 10,
    position: 'relative',
  },
  subTabItemActive: {},
  subTabText: {
    color: '#8E8E93',
    fontSize: 15,
    fontWeight: '700',
  },
  subTabTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  activeSubTabIndicator: {
    position: 'absolute',
    bottom: -1,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  episodesTabContent: {
    marginTop: 6,
  },
  seasonsScrollContent: {
    gap: 8,
    marginBottom: 16,
  },
  seasonChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#161622',
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
    color: '#000',
    fontWeight: '800',
  },
  episodesListWrapper: {
    gap: 8,
  },
  episodeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#121218',
    padding: 12,
    borderRadius: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: '#1e1e28',
  },
  episodePlayIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  episodeDetails: {
    flex: 1,
  },
  episodeTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  episodeDuration: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  emptyEpisodesText: {
    color: '#777',
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 20,
  },
  similarSection: {
    marginTop: 6,
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
