import AsyncStorage from '@react-native-async-storage/async-storage';
import { SavedAccount } from '../types/iptv';

const KEYS = {
  ACCOUNTS: '@axi_accounts',
  ACTIVE_ACCOUNT: '@axi_active_account',
  FAVORITES: '@axi_favorites',
  WATCH_PROGRESS: '@axi_watch_progress',
  SETTINGS: '@axi_settings',
};

export interface AppSettings {
  streamFormat: 'm3u8' | 'ts';
  playerEngine: 'exoplayer' | 'vlc';
  autoPlayNextEpisode: boolean;
  bufferSizeMs: number;
}

const DEFAULT_SETTINGS: AppSettings = {
  streamFormat: 'm3u8',
  playerEngine: 'exoplayer',
  autoPlayNextEpisode: true,
  bufferSizeMs: 5000,
};

export const storage = {
  // Accounts
  async getAccounts(): Promise<SavedAccount[]> {
    const json = await AsyncStorage.getItem(KEYS.ACCOUNTS);
    return json ? JSON.parse(json) : [];
  },

  async saveAccount(account: SavedAccount): Promise<void> {
    const list = await this.getAccounts();
    const index = list.findIndex((a) => a.id === account.id);
    if (index >= 0) {
      list[index] = account;
    } else {
      list.push(account);
    }
    await AsyncStorage.setItem(KEYS.ACCOUNTS, JSON.stringify(list));
  },

  async removeAccount(accountId: string): Promise<void> {
    const list = await this.getAccounts();
    const filtered = list.filter((a) => a.id !== accountId);
    await AsyncStorage.setItem(KEYS.ACCOUNTS, JSON.stringify(filtered));
  },

  async getActiveAccount(): Promise<SavedAccount | null> {
    const json = await AsyncStorage.getItem(KEYS.ACTIVE_ACCOUNT);
    return json ? JSON.parse(json) : null;
  },

  async setActiveAccount(account: SavedAccount | null): Promise<void> {
    if (!account) {
      await AsyncStorage.removeItem(KEYS.ACTIVE_ACCOUNT);
    } else {
      await AsyncStorage.setItem(KEYS.ACTIVE_ACCOUNT, JSON.stringify(account));
    }
  },

  // Favorites
  async getFavorites(): Promise<number[]> {
    const json = await AsyncStorage.getItem(KEYS.FAVORITES);
    return json ? JSON.parse(json) : [];
  },

  async toggleFavorite(streamId: number): Promise<boolean> {
    const favs = await this.getFavorites();
    let isFav = false;
    let updated: number[];
    if (favs.includes(streamId)) {
      updated = favs.filter((id) => id !== streamId);
      isFav = false;
    } else {
      updated = [...favs, streamId];
      isFav = true;
    }
    await AsyncStorage.setItem(KEYS.FAVORITES, JSON.stringify(updated));
    return isFav;
  },

  // Watch Progress
  async getWatchProgress(streamId: string | number): Promise<number> {
    const json = await AsyncStorage.getItem(KEYS.WATCH_PROGRESS);
    const map = json ? JSON.parse(json) : {};
    return map[streamId] || 0;
  },

  async saveWatchProgress(streamId: string | number, positionSec: number): Promise<void> {
    const json = await AsyncStorage.getItem(KEYS.WATCH_PROGRESS);
    const map = json ? JSON.parse(json) : {};
    map[streamId] = positionSec;
    await AsyncStorage.setItem(KEYS.WATCH_PROGRESS, JSON.stringify(map));
  },

  // Settings
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
};
