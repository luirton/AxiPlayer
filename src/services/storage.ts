import AsyncStorage from '@react-native-async-storage/async-storage';
import { SavedAccount, LiveChannel, VodMovie, SeriesItem } from '../types/iptv';

const KEYS = {
  ACCOUNTS: '@axi_accounts',
  ACTIVE_ACCOUNT: '@axi_active_account',
  FAVORITES: '@axi_favorites',
  FAVORITE_CHANNELS_DATA: '@axi_fav_channels_data',
  FAVORITES_MOVIES: '@axi_favorites_movies',
  FAVORITE_MOVIES_DATA: '@axi_fav_movies_data',
  FAVORITES_SERIES: '@axi_favorites_series',
  FAVORITE_SERIES_DATA: '@axi_fav_series_data',
  WATCH_PROGRESS: '@axi_watch_progress',
  MY_LIST: '@axi_my_list',
  WATCH_LATER: '@axi_watch_later',
  PARENTAL_PIN: '@axi_parental_pin',
  SETTINGS: '@axi_settings',
};

export interface MediaListItem {
  id: number | string;
  title: string;
  poster?: string;
  backdrop?: string;
  type: 'movie' | 'series';
  category_id?: string;
  category_name?: string;
  rating?: string;
  year?: string;
  genre?: string;
  plot?: string;
  extension?: string;
  addedAt: number;
  rawItem?: any;
}

export interface WatchProgressItem {
  id: number | string;
  title: string;
  poster?: string;
  type: 'movie' | 'series' | 'live';
  positionSec: number;
  durationSec: number;
  extension?: string;
  timestamp: number;
  extra?: any;
  streamUrl?: string; // Link direto do vídeo que deu certo na exibição
  seriesId?: number | string; // ID da série (quando for episódio de série)
  seriesTitle?: string; // Nome da série
  seasonNum?: number; // Número da temporada
  episodeNum?: number; // Número do episódio
}

export interface AppSettings {
  streamFormat: 'm3u8' | 'ts';
  playerEngine: 'exoplayer' | 'vlc';
  autoPlayNextEpisode: boolean;
  bufferSizeMs: number;
  playlistReloadDays: number; // Intervalo para recarregar a lista (3 a 5 dias)
  lastPlaylistReloadTimestamp?: number;
}

const DEFAULT_SETTINGS: AppSettings = {
  streamFormat: 'm3u8',
  playerEngine: 'exoplayer',
  autoPlayNextEpisode: true,
  bufferSizeMs: 5000,
  playlistReloadDays: 3,
  lastPlaylistReloadTimestamp: Date.now(),
};

function fixAccountProtocol(account: SavedAccount): SavedAccount {
  if (account.serverUrl.startsWith('https://') && (account.serverUrl.includes(':80/') || account.serverUrl.endsWith(':80'))) {
    const correctedUrl = account.serverUrl.replace('https://', 'http://');
    return {
      ...account,
      serverUrl: correctedUrl,
      id: `${account.username}@${correctedUrl}`,
    };
  }
  return account;
}

export const storage = {
  // Accounts
  async getAccounts(): Promise<SavedAccount[]> {
    const json = await AsyncStorage.getItem(KEYS.ACCOUNTS);
    if (!json) return [];
    try {
      const list: SavedAccount[] = JSON.parse(json);
      return list.map(fixAccountProtocol);
    } catch {
      return [];
    }
  },

  async saveAccounts(accounts: SavedAccount[]): Promise<void> {
    const sanitized = accounts.map(fixAccountProtocol);
    await AsyncStorage.setItem(KEYS.ACCOUNTS, JSON.stringify(sanitized));
  },

  async saveAccount(account: SavedAccount): Promise<void> {
    const fixed = fixAccountProtocol(account);
    const list = await this.getAccounts();
    const index = list.findIndex((a) => a.id === fixed.id);
    if (index >= 0) {
      list[index] = fixed;
    } else {
      list.push(fixed);
    }
    await AsyncStorage.setItem(KEYS.ACCOUNTS, JSON.stringify(list));
  },

  async removeAccount(accountId: string): Promise<void> {
    const list = await this.getAccounts();
    const filtered = list.filter((a) => a.id !== accountId);
    await AsyncStorage.setItem(KEYS.ACCOUNTS, JSON.stringify(filtered));

    // Remove dados escopados da conta excluída
    const safe = accountId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const accountKeys = [
      `${KEYS.FAVORITES}_${safe}`,
      `${KEYS.FAVORITE_CHANNELS_DATA}_${safe}`,
      `${KEYS.FAVORITES_MOVIES}_${safe}`,
      `${KEYS.FAVORITE_MOVIES_DATA}_${safe}`,
      `${KEYS.FAVORITES_SERIES}_${safe}`,
      `${KEYS.FAVORITE_SERIES_DATA}_${safe}`,
      `${KEYS.WATCH_PROGRESS}_${safe}`,
      `${KEYS.MY_LIST}_${safe}`,
      `${KEYS.WATCH_LATER}_${safe}`,
    ];
    try {
      await AsyncStorage.multiRemove(accountKeys);
    } catch {}
  },

  async getActiveAccount(): Promise<SavedAccount | null> {
    const json = await AsyncStorage.getItem(KEYS.ACTIVE_ACCOUNT);
    if (!json) return null;
    try {
      const account: SavedAccount = JSON.parse(json);
      const fixed = fixAccountProtocol(account);
      if (fixed.serverUrl !== account.serverUrl) {
        await AsyncStorage.setItem(KEYS.ACTIVE_ACCOUNT, JSON.stringify(fixed));
      }
      return fixed;
    } catch {
      return null;
    }
  },

  async setActiveAccount(account: SavedAccount | null): Promise<void> {
    if (!account) {
      await AsyncStorage.removeItem(KEYS.ACTIVE_ACCOUNT);
    } else {
      const fixed = fixAccountProtocol(account);
      await AsyncStorage.setItem(KEYS.ACTIVE_ACCOUNT, JSON.stringify(fixed));
    }
  },

  // Helpers para isolamento de dados por conta (Favoritos, Continuar Assistindo, Minha Lista, Assistir Depois)
  async getAccountScopedKey(baseKey: string, specificAccountId?: string): Promise<string> {
    let accId = specificAccountId;
    if (!accId) {
      const active = await this.getActiveAccount();
      if (active) accId = active.id;
    }
    if (!accId) return baseKey;
    const safe = accId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return `${baseKey}_${safe}`;
  },

  async getScopedItem(baseKey: string, specificAccountId?: string): Promise<string | null> {
    const scopedKey = await this.getAccountScopedKey(baseKey, specificAccountId);
    const value = await AsyncStorage.getItem(scopedKey);
    if (value !== null) return value;

    // Migração de dados legados globais para a conta ativa na primeira execução:
    if (scopedKey !== baseKey) {
      const legacyValue = await AsyncStorage.getItem(baseKey);
      if (legacyValue !== null) {
        try {
          await AsyncStorage.setItem(scopedKey, legacyValue);
        } catch {}
        return legacyValue;
      }
    }
    return null;
  },

  async setScopedItem(baseKey: string, value: string, specificAccountId?: string): Promise<void> {
    const scopedKey = await this.getAccountScopedKey(baseKey, specificAccountId);
    await AsyncStorage.setItem(scopedKey, value);
  },

  // Favorites (Canais de TV) - Escopado por Conta
  async getFavorites(accountId?: string): Promise<number[]> {
    const json = await this.getScopedItem(KEYS.FAVORITES, accountId);
    return json ? JSON.parse(json) : [];
  },

  async toggleFavorite(streamId: number, accountId?: string): Promise<number[]> {
    const favs = await this.getFavorites(accountId);
    const index = favs.indexOf(streamId);
    let updated: number[];
    if (index >= 0) {
      updated = favs.filter((id) => id !== streamId);
    } else {
      updated = [...favs, streamId];
    }
    await this.setScopedItem(KEYS.FAVORITES, JSON.stringify(updated), accountId);
    return updated;
  },

  async getFavoriteChannels(accountId?: string): Promise<LiveChannel[]> {
    const json = await this.getScopedItem(KEYS.FAVORITE_CHANNELS_DATA, accountId);
    if (!json) return [];
    try {
      const data: Record<string, LiveChannel> = JSON.parse(json);
      return Object.values(data);
    } catch {
      return [];
    }
  },

  async saveFavoriteChannel(channel: LiveChannel, accountId?: string): Promise<void> {
    const favs = await this.getFavorites(accountId);
    if (!favs.includes(channel.stream_id)) {
      favs.push(channel.stream_id);
      await this.setScopedItem(KEYS.FAVORITES, JSON.stringify(favs), accountId);
    }
    const json = await this.getScopedItem(KEYS.FAVORITE_CHANNELS_DATA, accountId);
    const data: Record<string, LiveChannel> = json ? JSON.parse(json) : {};
    data[String(channel.stream_id)] = channel;
    await this.setScopedItem(KEYS.FAVORITE_CHANNELS_DATA, JSON.stringify(data), accountId);
  },

  async removeFavoriteChannel(streamId: number, accountId?: string): Promise<void> {
    const favs = await this.getFavorites(accountId);
    const updatedFavs = favs.filter((id) => id !== streamId);
    await this.setScopedItem(KEYS.FAVORITES, JSON.stringify(updatedFavs), accountId);

    const json = await this.getScopedItem(KEYS.FAVORITE_CHANNELS_DATA, accountId);
    if (json) {
      const data: Record<string, LiveChannel> = JSON.parse(json);
      delete data[String(streamId)];
      await this.setScopedItem(KEYS.FAVORITE_CHANNELS_DATA, JSON.stringify(data), accountId);
    }
  },

  async toggleFavoriteChannel(channel: LiveChannel, accountId?: string): Promise<boolean> {
    const favs = await this.getFavorites(accountId);
    const isFav = favs.includes(channel.stream_id);
    if (isFav) {
      await this.removeFavoriteChannel(channel.stream_id, accountId);
      return false;
    } else {
      await this.saveFavoriteChannel(channel, accountId);
      return true;
    }
  },

  // Favorites (Filmes VOD) - Escopado por Conta
  async getMovieFavorites(accountId?: string): Promise<number[]> {
    const json = await this.getScopedItem(KEYS.FAVORITES_MOVIES, accountId);
    return json ? JSON.parse(json) : [];
  },

  async getFavoriteMovies(accountId?: string): Promise<VodMovie[]> {
    const json = await this.getScopedItem(KEYS.FAVORITE_MOVIES_DATA, accountId);
    if (!json) return [];
    try {
      const data: Record<string, VodMovie> = JSON.parse(json);
      return Object.values(data);
    } catch {
      return [];
    }
  },

  async saveFavoriteMovie(movie: VodMovie, accountId?: string): Promise<void> {
    const favs = await this.getMovieFavorites(accountId);
    if (!favs.includes(movie.stream_id)) {
      favs.push(movie.stream_id);
      await this.setScopedItem(KEYS.FAVORITES_MOVIES, JSON.stringify(favs), accountId);
    }
    const json = await this.getScopedItem(KEYS.FAVORITE_MOVIES_DATA, accountId);
    const data: Record<string, VodMovie> = json ? JSON.parse(json) : {};
    data[String(movie.stream_id)] = movie;
    await this.setScopedItem(KEYS.FAVORITE_MOVIES_DATA, JSON.stringify(data), accountId);
  },

  async removeFavoriteMovie(streamId: number, accountId?: string): Promise<void> {
    const favs = await this.getMovieFavorites(accountId);
    const updatedFavs = favs.filter((id) => id !== streamId);
    await this.setScopedItem(KEYS.FAVORITES_MOVIES, JSON.stringify(updatedFavs), accountId);

    const json = await this.getScopedItem(KEYS.FAVORITE_MOVIES_DATA, accountId);
    if (json) {
      const data: Record<string, VodMovie> = JSON.parse(json);
      delete data[String(streamId)];
      await this.setScopedItem(KEYS.FAVORITE_MOVIES_DATA, JSON.stringify(data), accountId);
    }
  },

  async toggleFavoriteMovie(movie: VodMovie, accountId?: string): Promise<boolean> {
    const favs = await this.getMovieFavorites(accountId);
    const isFav = favs.includes(movie.stream_id);
    if (isFav) {
      await this.removeFavoriteMovie(movie.stream_id, accountId);
      return false;
    } else {
      await this.saveFavoriteMovie(movie, accountId);
      return true;
    }
  },

  async toggleMovieFavorite(streamId: number, accountId?: string): Promise<number[]> {
    const favs = await this.getMovieFavorites(accountId);
    const index = favs.indexOf(streamId);
    let updated: number[];
    if (index >= 0) {
      updated = favs.filter((id) => id !== streamId);
    } else {
      updated = [...favs, streamId];
    }
    await this.setScopedItem(KEYS.FAVORITES_MOVIES, JSON.stringify(updated), accountId);
    return updated;
  },

  // Favorites (Séries VOD) - Escopado por Conta
  async getSeriesFavorites(accountId?: string): Promise<number[]> {
    const json = await this.getScopedItem(KEYS.FAVORITES_SERIES, accountId);
    return json ? JSON.parse(json) : [];
  },

  async getFavoriteSeries(accountId?: string): Promise<SeriesItem[]> {
    const json = await this.getScopedItem(KEYS.FAVORITE_SERIES_DATA, accountId);
    if (!json) return [];
    try {
      const data: Record<string, SeriesItem> = JSON.parse(json);
      return Object.values(data);
    } catch {
      return [];
    }
  },

  async saveFavoriteSeries(series: SeriesItem, accountId?: string): Promise<void> {
    const favs = await this.getSeriesFavorites(accountId);
    if (!favs.includes(series.series_id)) {
      favs.push(series.series_id);
      await this.setScopedItem(KEYS.FAVORITES_SERIES, JSON.stringify(favs), accountId);
    }
    const json = await this.getScopedItem(KEYS.FAVORITE_SERIES_DATA, accountId);
    const data: Record<string, SeriesItem> = json ? JSON.parse(json) : {};
    data[String(series.series_id)] = series;
    await this.setScopedItem(KEYS.FAVORITE_SERIES_DATA, JSON.stringify(data), accountId);
  },

  async removeFavoriteSeries(seriesId: number, accountId?: string): Promise<void> {
    const favs = await this.getSeriesFavorites(accountId);
    const updatedFavs = favs.filter((id) => id !== seriesId);
    await this.setScopedItem(KEYS.FAVORITES_SERIES, JSON.stringify(updatedFavs), accountId);

    const json = await this.getScopedItem(KEYS.FAVORITE_SERIES_DATA, accountId);
    if (json) {
      const data: Record<string, SeriesItem> = JSON.parse(json);
      delete data[String(seriesId)];
      await this.setScopedItem(KEYS.FAVORITE_SERIES_DATA, JSON.stringify(data), accountId);
    }
  },

  async toggleFavoriteSeries(series: SeriesItem, accountId?: string): Promise<boolean> {
    const favs = await this.getSeriesFavorites(accountId);
    const isFav = favs.includes(series.series_id);
    if (isFav) {
      await this.removeFavoriteSeries(series.series_id, accountId);
      return false;
    } else {
      await this.saveFavoriteSeries(series, accountId);
      return true;
    }
  },

  async toggleSeriesFavorite(seriesId: number, accountId?: string): Promise<number[]> {
    const favs = await this.getSeriesFavorites(accountId);
    const index = favs.indexOf(seriesId);
    let updated: number[];
    if (index >= 0) {
      updated = favs.filter((id) => id !== seriesId);
    } else {
      updated = [...favs, seriesId];
    }
    await this.setScopedItem(KEYS.FAVORITES_SERIES, JSON.stringify(updated), accountId);
    return updated;
  },

  // Parental Control (PIN de 4 dígitos para Adultos/XXX)
  async getParentalPin(): Promise<string> {
    const pin = await AsyncStorage.getItem(KEYS.PARENTAL_PIN);
    return pin ? pin.trim() : '0000';
  },

  async setParentalPin(newPin: string): Promise<void> {
    await AsyncStorage.setItem(KEYS.PARENTAL_PIN, newPin.trim());
  },

  async verifyParentalPin(inputPin: string): Promise<boolean> {
    const stored = await this.getParentalPin();
    return stored === inputPin.trim();
  },

  // Normaliza o título do filme para comparar versões diferentes (ex: Mestres do Universo)
  normalizeMovieTitle(raw: string): string {
    if (!raw) return '';
    return raw
      .toLowerCase()
      .replace(/\[.*?\]|\(.*?\)/g, '')
      .replace(/\b(4k|uhd|fhd|hd|sd|dual|dublado|legendado|leg|dub|nacional|pedido|pedidos|lancamento|lancamentos)\b/gi, '')
      .replace(/[^a-z0-9]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  },

  // Extrai chave base de identificação da série para garantir que apenas o último episódio visto seja mantido
  extractSeriesBaseKey(item: Partial<WatchProgressItem>): string | null {
    if (item.seriesId) return `series_id_${item.seriesId}`;
    if (item.seriesTitle) return `series_title_${item.seriesTitle.trim().toLowerCase()}`;
    if (item.type === 'series' && item.title) {
      const base = item.title.split(/[•\-–—]/)[0]?.trim().toLowerCase();
      if (base) return `series_title_${base}`;
    }
    return null;
  },

  // Watch Progress (Continuar Assistindo) - Escopado por Conta
  async saveWatchProgress(
    item: Partial<WatchProgressItem> & { id: number | string; positionSec: number; durationSec: number },
    accountId?: string
  ): Promise<void> {
    const json = await this.getScopedItem(KEYS.WATCH_PROGRESS, accountId);
    const progress: Record<string, WatchProgressItem> = json ? JSON.parse(json) : {};

    // Quando for Série: guarda somente o último visto e remove qualquer outro episódio anterior da mesma série
    if (item.type === 'series') {
      const targetKey = this.extractSeriesBaseKey(item);
      for (const [key, existing] of Object.entries(progress)) {
        if (existing.type === 'series') {
          const existingKey = this.extractSeriesBaseKey(existing);
          const isSameSeries =
            (targetKey && existingKey && targetKey === existingKey) ||
            (item.seriesId && existing.seriesId && String(item.seriesId) === String(existing.seriesId)) ||
            (item.seriesTitle && existing.seriesTitle && item.seriesTitle.trim().toLowerCase() === existing.seriesTitle.trim().toLowerCase());
          if (isSameSeries) {
            delete progress[key];
          }
        }
      }
    }

    // Quando for Filme: remove qualquer outra versão anterior do mesmo filme (título normalizado igual)
    // para garantir que a versão que deu certo substitua a versão quebrada
    if (item.type === 'movie' && item.title) {
      const targetNorm = this.normalizeMovieTitle(item.title);
      if (targetNorm.length >= 2) {
        for (const [key, existing] of Object.entries(progress)) {
          if (existing.type === 'movie' && key !== String(item.id)) {
            const existingNorm = this.normalizeMovieTitle(existing.title || '');
            if (existingNorm === targetNorm) {
              // Se a versão existente já tinha link confirmado que deu certo (streamUrl) e o item novo NÃO tem,
              // preserva o link e o ID da versão que funcionou!
              if (existing.streamUrl && !item.streamUrl) {
                item.streamUrl = existing.streamUrl;
                item.id = existing.id;
                if (existing.extension) item.extension = existing.extension;
              } else {
                delete progress[key];
              }
            }
          }
        }
      }
    }

    progress[String(item.id)] = {
      id: item.id,
      title: item.title || 'Continuar Assistindo',
      poster: item.poster,
      type: item.type || 'movie',
      positionSec: item.positionSec,
      durationSec: item.durationSec,
      extension: item.extension || 'mp4',
      streamUrl: item.streamUrl,
      seriesId: item.seriesId,
      seriesTitle: item.seriesTitle,
      seasonNum: item.seasonNum,
      episodeNum: item.episodeNum,
      timestamp: Date.now(),
      extra: item.extra,
    };

    await this.setScopedItem(KEYS.WATCH_PROGRESS, JSON.stringify(progress), accountId);
  },

  async getWatchProgress(id: number | string, title?: string, accountId?: string): Promise<WatchProgressItem | null> {
    const json = await this.getScopedItem(KEYS.WATCH_PROGRESS, accountId);
    if (!json) return null;
    const progress: Record<string, WatchProgressItem> = JSON.parse(json);
    const strId = String(id);
    if (progress[strId]) {
      const direct = progress[strId];
      if (direct.streamUrl) return direct;
    }

    // Se tiver título e for filme, busca se há outra versão do mesmo filme com link salvo que funcionou
    if (title) {
      const norm = this.normalizeMovieTitle(title);
      if (norm.length >= 2) {
        const movieWithUrl = Object.values(progress).find(
          (item) => item.type === 'movie' && this.normalizeMovieTitle(item.title) === norm && !!item.streamUrl
        );
        if (movieWithUrl) return movieWithUrl;
      }
    }

    if (progress[strId]) return progress[strId];

    // Busca alternativa por seriesId, episodeId ou título da série
    const found = Object.values(progress).find((item) => {
      if (item.type !== 'series') return false;
      if (String(item.seriesId) === strId || String(item.id) === strId) return true;
      if (title && item.seriesTitle && item.seriesTitle.trim().toLowerCase() === title.trim().toLowerCase()) return true;
      return false;
    });
    return found || null;
  },

  async getAllWatchProgress(accountId?: string): Promise<WatchProgressItem[]> {
    const json = await this.getScopedItem(KEYS.WATCH_PROGRESS, accountId);
    if (!json) return [];
    try {
      const progress: Record<string, WatchProgressItem> = JSON.parse(json);
      const validItems = Object.values(progress).filter((item) => {
        if (item.durationSec > 60 && item.positionSec >= (item.durationSec - 30)) {
          return false;
        }
        return item.positionSec > 2 || !!item.streamUrl;
      });

      const seriesMap = new Map<string, WatchProgressItem>();
      const movieMap = new Map<string, WatchProgressItem>();
      const otherItems: WatchProgressItem[] = [];

      for (const item of validItems) {
        if (item.type === 'series') {
          const sKey = this.extractSeriesBaseKey(item) || String(item.id);
          const existing = seriesMap.get(sKey);
          if (!existing || item.timestamp > existing.timestamp) {
            seriesMap.set(sKey, item);
          }
        } else if (item.type === 'movie') {
          const mKey = this.normalizeMovieTitle(item.title || '') || String(item.id);
          const existing = movieMap.get(mKey);
          if (!existing) {
            movieMap.set(mKey, item);
          } else {
            // Prioriza a versão que tem streamUrl salva; se ambos tiverem ou nenhum tiver, o mais recente
            const itemHasUrl = !!item.streamUrl;
            const existingHasUrl = !!existing.streamUrl;
            if (itemHasUrl && !existingHasUrl) {
              movieMap.set(mKey, item);
            } else if (!itemHasUrl && existingHasUrl) {
              // mantém o existing com URL
            } else if (item.timestamp > existing.timestamp) {
              movieMap.set(mKey, item);
            }
          }
        } else {
          otherItems.push(item);
        }
      }

      const deduplicated = [
        ...otherItems,
        ...Array.from(movieMap.values()),
        ...Array.from(seriesMap.values()),
      ];
      return deduplicated.sort((a, b) => b.timestamp - a.timestamp);
    } catch {
      return [];
    }
  },

  async removeWatchProgress(id: number | string, accountId?: string): Promise<void> {
    const json = await this.getScopedItem(KEYS.WATCH_PROGRESS, accountId);
    if (!json) return;
    try {
      const progress: Record<string, WatchProgressItem> = JSON.parse(json);
      const strId = String(id);
      if (progress[strId]) {
        delete progress[strId];
        await this.setScopedItem(KEYS.WATCH_PROGRESS, JSON.stringify(progress), accountId);
      }
    } catch {}
  },

  // Minha Lista (Filmes e Séries adicionados à lista) - Escopado por Conta
  async getMyList(accountId?: string): Promise<MediaListItem[]> {
    const json = await this.getScopedItem(KEYS.MY_LIST, accountId);
    if (!json) return [];
    try {
      const list: MediaListItem[] = JSON.parse(json);
      return list.sort((a, b) => b.addedAt - a.addedAt);
    } catch {
      return [];
    }
  },

  async addToMyList(item: MediaListItem, accountId?: string): Promise<void> {
    const list = await this.getMyList(accountId);
    const filtered = list.filter((i) => String(i.id) !== String(item.id));
    filtered.unshift({ ...item, addedAt: Date.now() });
    await this.setScopedItem(KEYS.MY_LIST, JSON.stringify(filtered), accountId);
  },

  async removeFromMyList(id: number | string, accountId?: string): Promise<void> {
    const list = await this.getMyList(accountId);
    const filtered = list.filter((i) => String(i.id) !== String(id));
    await this.setScopedItem(KEYS.MY_LIST, JSON.stringify(filtered), accountId);
  },

  async isInMyList(id: number | string, accountId?: string): Promise<boolean> {
    const list = await this.getMyList(accountId);
    return list.some((i) => String(i.id) === String(id));
  },

  async toggleMyList(item: MediaListItem, accountId?: string): Promise<boolean> {
    const inList = await this.isInMyList(item.id, accountId);
    if (inList) {
      await this.removeFromMyList(item.id, accountId);
      return false;
    } else {
      await this.addToMyList(item, accountId);
      return true;
    }
  },

  // Assistir Depois (Filmes e Séries salvos para ver mais tarde) - Escopado por Conta
  async getWatchLater(accountId?: string): Promise<MediaListItem[]> {
    const json = await this.getScopedItem(KEYS.WATCH_LATER, accountId);
    if (!json) return [];
    try {
      const list: MediaListItem[] = JSON.parse(json);
      return list.sort((a, b) => b.addedAt - a.addedAt);
    } catch {
      return [];
    }
  },

  async addToWatchLater(item: MediaListItem, accountId?: string): Promise<void> {
    const list = await this.getWatchLater(accountId);
    const filtered = list.filter((i) => String(i.id) !== String(item.id));
    filtered.unshift({ ...item, addedAt: Date.now() });
    await this.setScopedItem(KEYS.WATCH_LATER, JSON.stringify(filtered), accountId);
  },

  async removeFromWatchLater(id: number | string, accountId?: string): Promise<void> {
    const list = await this.getWatchLater(accountId);
    const filtered = list.filter((i) => String(i.id) !== String(id));
    await this.setScopedItem(KEYS.WATCH_LATER, JSON.stringify(filtered), accountId);
  },

  async isInWatchLater(id: number | string, accountId?: string): Promise<boolean> {
    const list = await this.getWatchLater(accountId);
    return list.some((i) => String(i.id) === String(id));
  },

  async toggleWatchLater(item: MediaListItem, accountId?: string): Promise<boolean> {
    const inList = await this.isInWatchLater(item.id, accountId);
    if (inList) {
      await this.removeFromWatchLater(item.id, accountId);
      return false;
    } else {
      await this.addToWatchLater(item, accountId);
      return true;
    }
  },

  // App Settings
  async getSettings(): Promise<AppSettings> {
    const json = await AsyncStorage.getItem(KEYS.SETTINGS);
    return json ? { ...DEFAULT_SETTINGS, ...JSON.parse(json) } : DEFAULT_SETTINGS;
  },

  async saveSettings(settings: Partial<AppSettings>): Promise<AppSettings> {
    const current = await this.getSettings();
    const updated = { ...current, ...settings };
    await AsyncStorage.setItem(KEYS.SETTINGS, JSON.stringify(updated));
    return updated;
  },

  // Gerenciamento de recarregamento da lista IPTV (3 a 5 dias)
  async getPlaylistReloadDays(): Promise<number> {
    const s = await this.getSettings();
    return s.playlistReloadDays || 3;
  },

  async setPlaylistReloadDays(days: number): Promise<void> {
    await this.saveSettings({ playlistReloadDays: days });
  },

  async isPlaylistReloadDue(): Promise<boolean> {
    const s = await this.getSettings();
    const days = s.playlistReloadDays || 3;
    const last = s.lastPlaylistReloadTimestamp || 0;
    const intervalMs = days * 24 * 60 * 60 * 1000;
    return Date.now() - last >= intervalMs;
  },

  async markPlaylistReloaded(): Promise<void> {
    await this.saveSettings({ lastPlaylistReloadTimestamp: Date.now() });
  },
};
