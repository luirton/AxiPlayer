import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { FocusableItem } from '../common/FocusableItem';
import { IptvCategory } from '../../types/iptv';

export const CATEGORY_COLOR_PALETTES = [
  { gradient: ['#1e1035', '#0c0517'] as [string, string], borderColor: '#A855F7', textColor: '#D8B4FE' }, // Roxo
  { gradient: ['#00243d', '#000c14'] as [string, string], borderColor: '#00E5FF', textColor: '#38BDF8' }, // Ciano
  { gradient: ['#330a15', '#120207'] as [string, string], borderColor: '#FF2E63', textColor: '#FDA4AF' }, // Carmim
  { gradient: ['#2e1f04', '#140c00'] as [string, string], borderColor: '#FFB800', textColor: '#FDE68A' }, // Dourado
  { gradient: ['#06281e', '#01120c'] as [string, string], borderColor: '#10B981', textColor: '#6EE7B7' }, // Esmeralda
  { gradient: ['#101a47', '#050a1c'] as [string, string], borderColor: '#3B82F6', textColor: '#93C5FD' }, // Azul
  { gradient: ['#300d2b', '#140311'] as [string, string], borderColor: '#EC4899', textColor: '#F472B6' }, // Magenta
  { gradient: ['#2e1405', '#140700'] as [string, string], borderColor: '#F97316', textColor: '#FDBA74' }, // Laranja
  { gradient: ['#0c2538', '#03101a'] as [string, string], borderColor: '#06B6D4', textColor: '#67E8F9' }, // Turquesa
  { gradient: ['#1b1038', '#090417'] as [string, string], borderColor: '#8B5CF6', textColor: '#C4B5FD' }, // Índigo
];

/**
 * Remove prefixos comuns de IPTV e símbolos desnecessários para exibição nos cards.
 */
export function cleanCategoryName(rawName: string): string {
  if (!rawName) return '';
  let clean = rawName;
  clean = clean.replace(/^(filmes?|vod|s[eé]ries?|canais?|tv)\s*(\||-|:|•|\/|>)\s*/i, '');
  clean = clean.replace(/^\[[^\]]+\]\s*(\||-|:|•|\/|>)?\s*/i, '');
  clean = clean.replace(/^\([^\)]+\)\s*(\||-|:|•|\/|>)?\s*/i, '');
  clean = clean.replace(/^[★⭐✨🔥💥🎬📺•\s|:-]+|[★⭐✨🔥💥🎬📺•\s|:-]+$/g, '');
  return clean.trim() || rawName;
}

export interface HomeCategoriesProps {
  vodCategories: IptvCategory[];
  seriesCategories: IptvCategory[];
  onSelectVodCategory: (cat: IptvCategory) => void;
  onSelectSeriesCategory: (cat: IptvCategory) => void;
}

export const HomeCategories: React.FC<HomeCategoriesProps> = ({
  vodCategories,
  seriesCategories,
  onSelectVodCategory,
  onSelectSeriesCategory,
}) => {
  return (
    <View style={styles.container}>
      {/* 1. Fileira: Categorias de Filmes */}
      {vodCategories.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="film" size={17} color="#00E5FF" />
            <Text style={styles.sectionTitle}>Categorias de Filmes</Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.scrollList}
          >
            {vodCategories.map((cat, idx) => {
              const palette = CATEGORY_COLOR_PALETTES[idx % CATEGORY_COLOR_PALETTES.length];
              return (
                <FocusableItem
                  key={cat.category_id}
                  style={styles.cardWrapper}
                  onPress={() => onSelectVodCategory(cat)}
                >
                  <LinearGradient
                    colors={palette.gradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.categoryCard, { borderColor: palette.borderColor }]}
                  >
                    <Text
                      style={[styles.categoryCardText, { color: palette.textColor }]}
                      numberOfLines={2}
                    >
                      {cleanCategoryName(cat.category_name)}
                    </Text>
                  </LinearGradient>
                </FocusableItem>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* 2. Fileira: Categorias de Séries */}
      {seriesCategories.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="tv" size={17} color="#A855F7" />
            <Text style={styles.sectionTitle}>Categorias de Séries</Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.scrollList}
          >
            {seriesCategories.map((cat, idx) => {
              const palette = CATEGORY_COLOR_PALETTES[(idx + 4) % CATEGORY_COLOR_PALETTES.length];
              return (
                <FocusableItem
                  key={cat.category_id}
                  style={styles.cardWrapper}
                  onPress={() => onSelectSeriesCategory(cat)}
                >
                  <LinearGradient
                    colors={palette.gradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.categoryCard, { borderColor: palette.borderColor }]}
                  >
                    <Text
                      style={[styles.categoryCardText, { color: palette.textColor }]}
                      numberOfLines={2}
                    >
                      {cleanCategoryName(cat.category_name)}
                    </Text>
                  </LinearGradient>
                </FocusableItem>
              );
            })}
          </ScrollView>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.3,
  },
  scrollList: {
    paddingHorizontal: 20,
    gap: 12,
  },
  cardWrapper: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  categoryCard: {
    width: 136,
    height: 64,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 6,
  },
  categoryCardText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.4,
    textAlign: 'center',
    lineHeight: 17,
  },
});
