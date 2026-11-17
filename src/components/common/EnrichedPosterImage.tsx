import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { Image, ImageStyle } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { getEnrichedPoster } from '../../services/metadataEnricher';
import { colors } from '../../theme/colors';

interface EnrichedPosterImageProps {
  sourceUri?: string | null;
  title: string;
  type?: 'movie' | 'series';
  style?: ImageStyle | ImageStyle[];
  contentFit?: 'cover' | 'contain' | 'fill';
  fallbackIcon?: keyof typeof Ionicons.glyphMap;
}

export const EnrichedPosterImage: React.FC<EnrichedPosterImageProps> = ({
  sourceUri,
  title,
  type = 'movie',
  style,
  contentFit = 'cover',
  fallbackIcon = 'film-outline',
}) => {
  const [currentUri, setCurrentUri] = useState<string | null>(sourceUri || null);
  const [hasTriedEnrich, setHasTriedEnrich] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    setCurrentUri(sourceUri || null);
    setHasTriedEnrich(false);

    // Se não veio imagem da lista IPTV, busca imediatamente na internet
    if (!sourceUri || sourceUri.trim() === '') {
      lookupPoster();
    }
  }, [sourceUri, title, type]);

  const lookupPoster = async () => {
    if (hasTriedEnrich || !title) return;
    setHasTriedEnrich(true);
    setIsLoading(true);
    try {
      const enrichedUrl = await getEnrichedPoster(title, type);
      if (enrichedUrl) {
        setCurrentUri(enrichedUrl);
      }
    } catch (e) {
      // Ignora erro
    } finally {
      setIsLoading(false);
    }
  };

  const handleImageError = () => {
    if (!hasTriedEnrich) {
      lookupPoster();
    }
  };

  if (currentUri && currentUri.trim() !== '') {
    return (
      <Image
        source={{ uri: currentUri }}
        style={style}
        contentFit={contentFit}
        onError={handleImageError}
        transition={200}
      />
    );
  }

  return (
    <View style={[styles.fallbackContainer, style]}>
      {isLoading ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <Ionicons name={fallbackIcon} size={32} color={colors.textMuted} />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  fallbackContainer: {
    backgroundColor: '#16161a',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
