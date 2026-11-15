import {
  XtreamAuthResponse,
  IptvCategory,
  LiveChannel,
  VodMovie,
  SeriesItem,
  SeriesInfoResponse,
  EpgProgram,
} from '../types/iptv';
import { parseRawEpgItem } from './epgParser';

export class XtreamClient {
  private serverUrl: string;
  private username: string;
  private password?: string;

  constructor(serverUrl: string, username: string, password?: string) {
    this.serverUrl = this.normalizeUrl(serverUrl);
    this.username = username.trim();
    this.password = password?.trim();
  }

  private normalizeUrl(url: string): string {
    let clean = url.trim();
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = 'http://' + clean;
    }
    return clean.replace(/\/+$/, '');
  }

  private getBaseApiUrl(): string {
    const encodedUser = encodeURIComponent(this.username);
    const encodedPass = this.password ? encodeURIComponent(this.password) : '';
    return `${this.serverUrl}/player_api.php?username=${encodedUser}&password=${encodedPass}`;
  }

  public async authenticate(): Promise<XtreamAuthResponse> {
    const url = this.getBaseApiUrl();
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Falha na conexão com o servidor (${response.status})`);
    }
    const data = await response.json();
    if (!data.user_info || data.user_info.auth === 0 || data.user_info.status !== 'Active') {
      const msg = data.user_info?.message || 'Usuário ou senha inválidos ou conta inativa.';
      throw new Error(msg);
    }
    return data;
  }

  public async getLiveCategories(): Promise<IptvCategory[]> {
    const url = `${this.getBaseApiUrl()}&action=get_live_categories`;
    const res = await fetch(url);
    return res.json();
  }

  public async getLiveStreams(categoryId?: string): Promise<LiveChannel[]> {
    let url = `${this.getBaseApiUrl()}&action=get_live_streams`;
    if (categoryId && categoryId !== 'all') {
      url += `&category_id=${categoryId}`;
    }
    const res = await fetch(url);
    return res.json();
  }

  public async getVodCategories(): Promise<IptvCategory[]> {
    const url = `${this.getBaseApiUrl()}&action=get_vod_categories`;
    const res = await fetch(url);
    return res.json();
  }

  public async getVodStreams(categoryId?: string): Promise<VodMovie[]> {
    let url = `${this.getBaseApiUrl()}&action=get_vod_streams`;
    if (categoryId && categoryId !== 'all') {
      url += `&category_id=${categoryId}`;
    }
    const res = await fetch(url);
    return res.json();
  }

  public async getVodInfo(vodId: number): Promise<any> {
    const url = `${this.getBaseApiUrl()}&action=get_vod_info&vod_id=${vodId}`;
    const res = await fetch(url);
    return res.json();
  }

  public async getSeriesCategories(): Promise<IptvCategory[]> {
    const url = `${this.getBaseApiUrl()}&action=get_series_categories`;
    const res = await fetch(url);
    return res.json();
  }

  public async getSeries(categoryId?: string): Promise<SeriesItem[]> {
    let url = `${this.getBaseApiUrl()}&action=get_series`;
    if (categoryId && categoryId !== 'all') {
      url += `&category_id=${categoryId}`;
    }
    const res = await fetch(url);
    return res.json();
  }

  public async getSeriesInfo(seriesId: number): Promise<SeriesInfoResponse> {
    const url = `${this.getBaseApiUrl()}&action=get_series_info&series_id=${seriesId}`;
    const res = await fetch(url);
    return res.json();
  }

  public async getShortEpg(streamId: number): Promise<EpgProgram[]> {
    try {
      const url = `${this.getBaseApiUrl()}&action=get_short_epg&stream_id=${streamId}&limit=10`;
      const res = await fetch(url);
      const data = await res.json();
      const listings = data?.epg_listings || [];
      return listings.map((item: any) => parseRawEpgItem(item));
    } catch (e) {
      console.warn('Error fetching EPG:', e);
      return [];
    }
  }

  // Stream URL Generators
  public getLiveStreamUrl(streamId: number, extension: 'ts' | 'm3u8' = 'm3u8'): string {
    return `${this.serverUrl}/live/${encodeURIComponent(this.username)}/${encodeURIComponent(this.password || '')}/${streamId}.${extension}`;
  }

  public getMovieStreamUrl(streamId: number, containerExtension: string = 'mp4'): string {
    const ext = containerExtension.replace(/^\./, '');
    return `${this.serverUrl}/movie/${encodeURIComponent(this.username)}/${encodeURIComponent(this.password || '')}/${streamId}.${ext}`;
  }

  public getEpisodeStreamUrl(episodeId: string | number, containerExtension: string = 'mp4'): string {
    const ext = containerExtension.replace(/^\./, '');
    return `${this.serverUrl}/series/${encodeURIComponent(this.username)}/${encodeURIComponent(this.password || '')}/${episodeId}.${ext}`;
  }
}
