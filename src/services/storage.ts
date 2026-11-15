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

  // Favorites
  async getFavorites(): Promise<number[]> {
    const json = await AsyncStorage.getItem(KEYS.FAVORITES);
    return json ? JSON.parse(json) : [];
  },

  async toggleFavorite(streamId: number): Promise<number[]> {
    const favs = await this.getFavorites();
    const index = favs.indexOf(streamId);
    let updated: number[];
    if (index >= 0) {
      updated = favs.filter((id) => id !== streamId);
    } else {
      updated = [...favs, streamId];
    }
    await AsyncStorage.setItem(KEYS.FAVORITES, JSON.stringify(updated));
    return updated;
  },

  // Watch Progress (VOD)
  async saveWatchProgress(id: number | string, positionSec: number, durationSec: number): Promise<void> {
    const json = await AsyncStorage.getItem(KEYS.WATCH_PROGRESS);
    const progress = json ? JSON.parse(json) : {};
    progress[id] = { positionSec, durationSec, timestamp: Date.now() };
    await AsyncStorage.setItem(KEYS.WATCH_PROGRESS, JSON.stringify(progress));
  },

  async getWatchProgress(id: number | string): Promise<{ positionSec: number; durationSec: number } | null> {
    const json = await AsyncStorage.getItem(KEYS.WATCH_PROGRESS);
    if (!json) return null;
    const progress = JSON.parse(json);
    return progress[id] || null;
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
};
