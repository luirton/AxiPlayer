import { XtreamClient } from './xtreamClient';
import { storage } from './storage';
import { VodMovie, IptvCategory } from '../types/iptv';

export interface AlternativeMovieVersion {
  stream_id: number;
  name: string;
  category_name: string;
  category_id: string;
  container_extension: string;
  stream_icon?: string;
  added?: string;
  isCurrent?: boolean;
}

/**
 * Normaliza o título para comparação de versões (remove tags como 4K, 2026, Dublado, etc.)
 */
export function normalizeTitle(raw: string): string {
  if (!raw) return '';
  return raw
    .toLowerCase()
    .replace(/\[.*?\]|\(.*?\)/g, '')
    .replace(/\b(4k|uhd|fhd|hd|sd|dual|dublado|legendado|leg|dub|nacional|pedido|pedidos|lancamento|lancamentos)\b/gi, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Busca versões alternativas de um mesmo filme em outras categorias da lista IPTV
 */
export async function findAlternativeMovieVersions(
  title: string,
  currentStreamId: number,
  currentCategoryId?: string
): Promise<AlternativeMovieVersion[]> {
  const normTitle = normalizeTitle(title);
  if (!normTitle || normTitle.length < 2) return [];

  const results: AlternativeMovieVersion[] = [];

  try {
    const account = await storage.getActiveAccount();
    if (!account) return [];

    const client = new XtreamClient(account.serverUrl, account.username, account.password);
    const categories: IptvCategory[] = await client.getVodCategories().catch(() => []);
    if (!categories || categories.length === 0) return [];

    // Priorizar categorias comuns de filmes (evitando apenas favoritos)
    const checkCats = categories
      .filter((c) => c && c.category_id !== 'favorites')
      .slice(0, 20);

    // Processamento em lotes concorrentes (chunks de 4) para rápida resposta
    const chunkSize = 4;
    for (let i = 0; i < checkCats.length; i += chunkSize) {
      const chunk = checkCats.slice(i, i + chunkSize);
      await Promise.allSettled(
        chunk.map(async (cat) => {
          try {
            const movies: VodMovie[] = await client.getVodStreams(cat.category_id);
            if (!Array.isArray(movies)) return;

            const matches = movies.filter(
              (m) => m && Number(m.stream_id) !== Number(currentStreamId) && normalizeTitle(m.name) === normTitle
            );

            for (const match of matches) {
              // Evita duplicar o mesmo stream_id nos resultados
              if (!results.some((r) => Number(r.stream_id) === Number(match.stream_id))) {
                results.push({
                  stream_id: match.stream_id,
                  name: match.name,
                  category_name: cat.category_name,
                  category_id: match.category_id || cat.category_id,
                  container_extension: match.container_extension || 'mp4',
                  stream_icon: match.stream_icon,
                  added: match.added,
                  isCurrent: false,
                });
              }
            }
          } catch {}
        })
      );
    }
  } catch (err) {
    console.warn('Erro ao buscar versões alternativas:', err);
  }

  return results;
}
