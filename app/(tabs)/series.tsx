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
  Modal,
  ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { storage } from '../../src/services/storage';
import { XtreamClient } from '../../src/services/xtreamClient';
import { IptvCategory, SeriesItem, SeriesInfoResponse, SavedAccount } from '../../src/types/iptv';
import { FocusableItem } from '../../src/components/common/FocusableItem';

const { width } = Dimensions.get('window');
const isLargeScreen = width >= 768;

export default function SeriesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ brand?: string; brandName?: string }>();
  const [categories, setCategories] = useState<IptvCategory[]>([]);
  const [seriesList, setSeriesList] = useState<SeriesItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedBrandName, setSelectedBrandName] = useState<string | null>(params.brandName || null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingSeries, setLoadingSeries] = useState(false);
  const [account, setAccount] = useState<SavedAccount | null>(null);

  // Detail Modal state
  const [selectedSeries, setSelectedSeries] = useState<SeriesItem | null>(null);
  const [seriesInfo, setSeriesInfo] = useState<SeriesInfoResponse | null>(null);
  const [activeSeason, setActiveSeason] = useState<string>('1');
  const [loadingInfo, setLoadingInfo] = useState(false);

  useEffect(() => {
    initSeries();
  }, [params.brand]);

  const initSeries = async () => {
    try {
      const active = await storage.getActiveAccount();
      if (!active) {
        router.replace('/login');
        return;
      }
      setAccount(active);

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
          setSelectedBrandName(params.brandName || matchingCat.category_name);
          const s = await client.getSeries(matchingCat.category_id);
          setSeriesList(s || []);
          return;
        }
      }

      const s = await client.getSeries();
      setSeriesList(s || []);
    } catch (err) {
      console.warn('Error loading series:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleClearBrandFilter = async () => {
    setSelectedBrandName(null);
    setSelectedCategory('all');
    if (!account) return;
    setLoadingSeries(true);
    try {
      const client = new XtreamClient(account.serverUrl, account.username, account.password);
      const s = await client.getSeries();
      setSeriesList(s || []);
    } catch (e) {
    } finally {
      setLoadingSeries(false);
    }
  };

  const handleSelectCategory = async (catId: string) => {
    setSelectedCategory(catId);
    if (!account) return;
    setLoadingSeries(true);
    try {
      const client = new XtreamClient(account.serverUrl, account.username, account.password);
      const s = await client.getSeries(catId);
      setSeriesList(s || []);
    } catch (err) {
      console.warn(err);
    } finally {
      setLoadingSeries(false);
    }
  };

  const handleOpenSeries = async (item: SeriesItem) => {
    setSelectedSeries(item);
    setSeriesInfo(null);
    setLoadingInfo(true);
    if (!account) return;
    try {
      const client = new XtreamClient(account.serverUrl, account.username, account.password);
      const info = await client.getSeriesInfo(item.series_id);
      setSeriesInfo(info);
      const firstSeason = Object.keys(info?.episodes || {})[0] || '1';
      setActiveSeason(firstSeason);
    } catch (err) {
      console.warn('Error fetching series info:', err);
    } finally {
      setLoadingInfo(false);
    }
  };

  const filteredSeries = seriesList.filter((s) =>
    (s.name || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const numColumns = isLargeScreen ? 5 : 3;

  const renderSeriesCard = ({ item }: { item: SeriesItem }) => {
    const ratingStr = item.rating !== undefined && item.rating !== null ? String(item.rating).trim() : '';
    const hasRating = Boolean(ratingStr && ratingStr !== '0');

    return (
      <FocusableItem
        style={styles.seriesCard}
        onPress={() => handleOpenSeries(item)}
      >
        <View style={styles.posterWrapper}>
          {item.cover ? (
            <Image
              source={{ uri: item.cover }}
              style={styles.poster}
              contentFit="cover"
            />
          ) : (
            <View style={styles.posterFallback}>
              <Ionicons name="albums" size={32} color={colors.textMuted} />
            </View>
          )}

          {hasRating ? (
            <View style={styles.ratingBadge}>
              <Ionicons name="star" size={10} color="#FFD700" />
              <Text style={styles.ratingText}>{String(item.rating)}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.seriesTitleBox}>
          <Text style={styles.seriesTitle} numberOfLines={1}>
            {item.name || 'Sem título'}
          </Text>
        </View>
      </FocusableItem>
    );
  };

  return (
    <View style={styles.container}>
      {/* Top Header com design limpo e espaçoso */}
      <View style={styles.header}>
        {/* Linha 1: Botão Voltar + Título com Contador */}
        <View style={styles.topHeaderRow}>
          <FocusableItem style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={20} color="#fff" />
          </FocusableItem>

          <View style={styles.headerTitleBox}>
            <Ionicons name="albums" size={22} color="#0070F3" />
            <Text style={styles.headerTitle}>Séries</Text>
            <View style={styles.countBadge}>
              <Text style={styles.headerCount}>{filteredSeries.length}</Text>
            </View>
          </View>
        </View>

        {/* Linha 2: Campo de Pesquisa em Largura Total */}
        <View style={styles.searchBarRow}>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color="#888" />
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar séries por título..."
              placeholderTextColor="#666"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 ? (
              <Pressable onPress={() => setSearchQuery('')} hitSlop={10}>
                <Ionicons name="close-circle" size={18} color="#888" />
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* Linha 3: Banner de Filtro de Plataforma Ativo */}
        {selectedBrandName ? (
          <View style={styles.brandFilterBanner}>
            <View style={styles.brandFilterBadge}>
              <Ionicons name="sparkles" size={15} color="#FFA000" />
              <Text style={styles.brandFilterText}>Plataforma: {selectedBrandName}</Text>
            </View>
            <Pressable style={styles.clearFilterBtn} onPress={handleClearBrandFilter} hitSlop={10}>
              <Text style={styles.clearFilterText}>Limpar Filtro</Text>
              <Ionicons name="close-circle" size={16} color="#bbb" />
            </Pressable>
          </View>
        ) : null}
      </View>

      {/* Main Content: Split Categories Left + Grid Right */}
      <View style={styles.splitLayout}>
        {/* Sidebar de Categorias: só exibe se NÃO houver filtro de plataforma ativo */}
        {!selectedBrandName && (
          <View style={styles.categoriesSidebar}>
            <FlatList
              data={[{ category_id: 'all', category_name: 'Todas as Séries' }, ...categories]}
              keyExtractor={(item) => String(item.category_id)}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.categoriesContent}
              renderItem={({ item }) => {
                const active = selectedCategory === item.category_id;
                return (
                  <FocusableItem
                    style={[styles.categoryItem, active && styles.categoryItemActive]}
                    onPress={() => handleSelectCategory(item.category_id)}
                  >
                    <Text
                      style={[styles.categoryText, active && styles.categoryTextActive]}
                      numberOfLines={1}
                    >
                      {item.category_name}
                    </Text>
                  </FocusableItem>
                );
              }}
            />
          </View>
        )}

        {/* Grid de Séries com padding inferior para nunca ficar atrás do menu */}
        <View style={styles.gridContainer}>
          {loading || loadingSeries ? (
            <View style={styles.centerBox}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>Carregando séries...</Text>
            </View>
          ) : filteredSeries.length === 0 ? (
            <View style={styles.centerBox}>
              <Ionicons name="albums-outline" size={48} color={colors.textMuted} />
              <Text style={styles.emptyText}>Nenhuma série encontrada nesta categoria</Text>
            </View>
          ) : (
            <FlatList
              data={filteredSeries}
              keyExtractor={(item) => String(item.series_id)}
              renderItem={renderSeriesCard}
              numColumns={numColumns}
              key={numColumns}
              contentContainerStyle={styles.gridContent}
              columnWrapperStyle={styles.columnWrapper}
              initialNumToRender={15}
              maxToRenderPerBatch={20}
              windowSize={5}
            />
          )}
        </View>
      </View>

      {/* Modal Detalhes da Série / Episódios */}
      <Modal
        visible={Boolean(selectedSeries)}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setSelectedSeries(null)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <FocusableItem
              style={styles.modalCloseBtn}
              onPress={() => setSelectedSeries(null)}
            >
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </FocusableItem>
            <Text style={styles.modalTitle} numberOfLines={1}>
              {selectedSeries?.name || 'Detalhes da Série'}
            </Text>
          </View>

          {loadingInfo ? (
            <View style={styles.centerBox}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>Carregando episódios...</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.modalContent}>
              <View style={styles.modalInfoCard}>
                {selectedSeries?.cover ? (
                  <Image
                    source={{ uri: selectedSeries.cover }}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0c',
    paddingTop: 36,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a22',
    backgroundColor: '#0d0d12',
    gap: 10,
  },
  topHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#1a1a24',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#262634',
  },
  headerTitleBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.3,
  },
  countBadge: {
    backgroundColor: '#142236',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e385c',
  },
  headerCount: {
    fontSize: 12,
    color: '#00DFD8',
    fontWeight: '800',
  },
  searchBarRow: {
    width: '100%',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16161f',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: '#282838',
    gap: 10,
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 13,
  },
  brandFilterBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#171722',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#303046',
  },
  brandFilterBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  brandFilterText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  clearFilterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#262638',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  clearFilterText: {
    color: '#ddd',
    fontSize: 11,
    fontWeight: '600',
  },
  splitLayout: {
    flex: 1,
    flexDirection: 'row',
  },
  categoriesSidebar: {
    width: isLargeScreen ? 240 : 155,
    backgroundColor: '#0e0e13',
    borderRightWidth: 1,
    borderRightColor: '#1c1c24',
  },
  categoriesContent: {
    paddingVertical: 8,
    paddingBottom: 140, // Espaço extra para rolar acima do menu flutuante!
  },
  categoryItem: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderLeftWidth: 3.5,
    borderLeftColor: 'transparent',
  },
  categoryItemActive: {
    backgroundColor: '#0d1829',
    borderLeftColor: '#0070F3',
  },
  categoryText: {
    fontSize: 13,
    color: '#8e8e9c',
    fontWeight: '600',
  },
  categoryTextActive: {
    color: '#fff',
    fontWeight: '800',
  },
  gridContainer: {
    flex: 1,
    backgroundColor: '#0a0a0c',
  },
  gridContent: {
    padding: 12,
    paddingBottom: 140, // Espaço extra para rolar acima do menu flutuante!
  },
  columnWrapper: {
    gap: 12,
    marginBottom: 12,
  },
  seriesCard: {
    flex: 1,
    backgroundColor: '#14141a',
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#22222c',
  },
  posterWrapper: {
    width: '100%',
    aspectRatio: 2 / 3,
    backgroundColor: '#181822',
    position: 'relative',
  },
  poster: {
    width: '100%',
    height: '100%',
  },
  posterFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ratingBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 4,
  },
  ratingText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },
  seriesTitleBox: {
    padding: 8,
    backgroundColor: '#14141a',
  },
  seriesTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#eee',
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
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#0a0a0c',
    paddingTop: 36,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a20',
    gap: 12,
  },
  modalCloseBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#1c1c24',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
    flex: 1,
  },
  modalContent: {
    padding: 16,
    paddingBottom: 60,
  },
  modalInfoCard: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 20,
    backgroundColor: '#14141c',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#222230',
  },
  modalPoster: {
    width: 100,
    height: 150,
    borderRadius: 8,
  },
  modalInfoDetails: {
    flex: 1,
  },
  modalSeriesName: {
    fontSize: 18,
    fontWeight: '900',
    color: '#fff',
    marginBottom: 8,
  },
  modalPlot: {
    fontSize: 12,
    color: '#aaa',
    lineHeight: 18,
    marginBottom: 8,
  },
  modalGenre: {
    fontSize: 11,
    color: colors.primaryAmber,
    fontWeight: '600',
  },
  seasonsHeader: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 10,
  },
  seasonsScroll: {
    marginBottom: 20,
  },
  seasonChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#181822',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#262634',
  },
  seasonChipActive: {
    backgroundColor: '#0070F3',
    borderColor: '#00DFD8',
  },
  seasonChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#aaa',
  },
  seasonChipTextActive: {
    color: '#fff',
  },
  episodesHeader: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 12,
  },
  episodeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#14141a',
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#22222c',
    gap: 12,
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
    fontWeight: '700',
    color: '#fff',
  },
  episodeDuration: {
    fontSize: 11,
    color: '#888',
    marginTop: 2,
  },
});
