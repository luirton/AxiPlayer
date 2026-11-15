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
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { storage } from '../../src/services/storage';
import { XtreamClient } from '../../src/services/xtreamClient';
import { IptvCategory, VodMovie, SavedAccount } from '../../src/types/iptv';
import { FocusableItem } from '../../src/components/common/FocusableItem';

const { width } = Dimensions.get('window');

export default function MoviesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ brand?: string; brandName?: string; categoryId?: string }>();
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

  // Hero Item
  const [heroMovie, setHeroMovie] = useState<VodMovie | null>(null);

  useEffect(() => {
    initMovies();
  }, [params.brand]);

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

  const handlePlayMovie = (item: VodMovie) => {
    router.push({
      pathname: '/player/[id]',
      params: {
        id: item.stream_id,
        type: 'movie',
        title: item.name || 'Filme',
        extension: item.container_extension || 'mp4',
      },
    });
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
          onPress={() => setIsSearchOpen(!isSearchOpen)}
          hitSlop={10}
        >
          <Ionicons name={isSearchOpen ? 'close' : 'search'} size={22} color="#fff" />
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

                  {/* Botão Assistir Agora em Formato Pílula Gradiente */}
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
  heroWatchBtn: {
    marginTop: 12,
    borderRadius: 22,
    overflow: 'hidden',
    alignSelf: 'flex-start',
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
});
