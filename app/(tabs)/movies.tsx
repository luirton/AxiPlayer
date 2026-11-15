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
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { storage } from '../../src/services/storage';
import { XtreamClient } from '../../src/services/xtreamClient';
import { IptvCategory, VodMovie, SavedAccount } from '../../src/types/iptv';
import { FocusableItem } from '../../src/components/common/FocusableItem';

const { width } = Dimensions.get('window');
const isLargeScreen = width >= 768;

export default function MoviesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ brand?: string; brandName?: string; categoryId?: string }>();
  const [categories, setCategories] = useState<IptvCategory[]>([]);
  const [movies, setMovies] = useState<VodMovie[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedBrandName, setSelectedBrandName] = useState<string | null>(params.brandName || null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMovies, setLoadingMovies] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [account, setAccount] = useState<SavedAccount | null>(null);

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
          setSelectedBrandName(params.brandName || matchingCat.category_name);
          const vods = await client.getVodStreams(matchingCat.category_id);
          setMovies(vods || []);
          return;
        }
      }

      if (cats && cats.length > 0) {
        const firstCatId = cats[0].category_id;
        setSelectedCategory(firstCatId);
        const vods = await client.getVodStreams(firstCatId);
        setMovies(vods || []);
      } else {
        const vods = await client.getVodStreams();
        setMovies(vods || []);
      }
    } catch (err: any) {
      console.warn('Error loading movies:', err);
      setErrorMessage(err?.message || 'Falha ao carregar catálogo de filmes.');
    } finally {
      setLoading(false);
    }
  };

  const handleClearBrandFilter = async () => {
    setSelectedBrandName(null);
    setSelectedCategory('all');
    if (!account) return;
    setLoadingMovies(true);
    try {
      const client = new XtreamClient(account.serverUrl, account.username, account.password);
      const vods = await client.getVodStreams();
      setMovies(vods || []);
    } catch (e) {
    } finally {
      setLoadingMovies(false);
    }
  };

  const handleSelectCategory = async (catId: string) => {
    setSelectedCategory(catId);
    if (!account) return;
    setLoadingMovies(true);
    try {
      const client = new XtreamClient(account.serverUrl, account.username, account.password);
      const vods = await client.getVodStreams(catId);
      setMovies(vods || []);
    } catch (err) {
      console.warn(err);
    } finally {
      setLoadingMovies(false);
    }
  };

  const filteredMovies = movies.filter((m) =>
    (m.name || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const numColumns = isLargeScreen ? 5 : 3;

  const renderMovie = ({ item }: { item: VodMovie }) => {
    const ratingStr = item.rating !== undefined && item.rating !== null ? String(item.rating).trim() : '';
    const hasRating = Boolean(ratingStr && ratingStr !== '0');

    return (
      <FocusableItem
        style={styles.movieCard}
        onPress={() => {
          router.push({
            pathname: '/player/[id]',
            params: {
              id: item.stream_id,
              type: 'movie',
              title: item.name || 'Filme',
              extension: item.container_extension || 'mp4',
            },
          });
        }}
      >
        <View style={styles.posterWrapper}>
          {item.stream_icon ? (
            <Image
              source={{ uri: item.stream_icon }}
              style={styles.poster}
              contentFit="cover"
            />
          ) : (
            <View style={styles.posterFallback}>
              <Ionicons name="film" size={32} color={colors.textMuted} />
            </View>
          )}

          {hasRating ? (
            <View style={styles.ratingBadge}>
              <Ionicons name="star" size={10} color="#FFD700" />
              <Text style={styles.ratingText}>{String(item.rating)}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.movieTitleBox}>
          <Text style={styles.movieTitle} numberOfLines={1}>
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
            <Ionicons name="film" size={22} color={colors.primary} />
            <Text style={styles.headerTitle}>Filmes VOD</Text>
            <View style={styles.countBadge}>
              <Text style={styles.headerCount}>{filteredMovies.length}</Text>
            </View>
          </View>
        </View>

        {/* Linha 2: Campo de Pesquisa em Largura Total */}
        <View style={styles.searchBarRow}>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color="#888" />
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar filmes por título..."
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
              data={[{ category_id: 'all', category_name: 'Todos os Filmes' }, ...categories]}
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

        {/* Grid de Filmes com padding inferior para nunca ficar atrás do menu */}
        <View style={styles.gridContainer}>
          {loading || loadingMovies ? (
            <View style={styles.centerBox}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>Carregando filmes...</Text>
            </View>
          ) : filteredMovies.length === 0 ? (
            <View style={styles.centerBox}>
              <Ionicons name="film-outline" size={48} color={colors.textMuted} />
              <Text style={styles.emptyText}>Nenhum filme encontrado nesta categoria</Text>
            </View>
          ) : (
            <FlatList
              data={filteredMovies}
              keyExtractor={(item) => String(item.stream_id)}
              renderItem={renderMovie}
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
    backgroundColor: '#201c28',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#362a40',
  },
  headerCount: {
    fontSize: 12,
    color: colors.primaryAmber,
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
    backgroundColor: '#1c1926',
    borderLeftColor: colors.primary,
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
  movieCard: {
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
  movieTitleBox: {
    padding: 8,
    backgroundColor: '#14141a',
  },
  movieTitle: {
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
});
