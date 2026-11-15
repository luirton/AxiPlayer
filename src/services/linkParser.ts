export interface ParsedIptvLink {
  serverUrl: string;
  username?: string;
  password?: string;
  isXtreamCompatible: boolean;
  type?: 'm3u' | 'hls' | 'ssiptv' | 'generic';
  originalUrl: string;
}

/**
 * Analisa e extrai credenciais de URLs de IPTV (M3U Completo, Links Curtos, HLS, SSIPTV, etc.)
 * 
 * Exemplos suportados:
 * 1. http://primelux.online:80/get.php?username=luirton16&password=_16LuirTON16-&type=m3u_plus&output=mpegts
 * 2. http://e.primelux.online/p/luirton16/_16LuirTON16-/m3u
 * 3. http://primelux.online:80/get.php?username=luirton16&password=_16LuirTON16-&type=m3u_plus&output=hls
 * 4. http://e.primelux.online/p/luirton16/_16LuirTON16-/hls
 * 5. http://e.primelux.online/p/luirton16/_16LuirTON16-/ssiptv
 * 6. http://servidor.com:8080/live/usuario/senha/12345.ts
 */
export function parseIptvLink(rawUrl: string): ParsedIptvLink {
  const originalUrl = rawUrl.trim();
  if (!originalUrl) {
    return {
      serverUrl: '',
      isXtreamCompatible: false,
      originalUrl: '',
    };
  }

  let formatted = originalUrl;
  if (!formatted.startsWith('http://') && !formatted.startsWith('https://')) {
    formatted = 'http://' + formatted;
  }

  try {
    // 1. Extração por Query Parameters (ex: get.php?username=X&password=Y)
    const usernameParamMatch = formatted.match(/[?&]username=([^&]+)/i);
    const passwordParamMatch = formatted.match(/[?&]password=([^&]+)/i);

    if (usernameParamMatch && passwordParamMatch) {
      const username = decodeURIComponent(usernameParamMatch[1]);
      const password = decodeURIComponent(passwordParamMatch[1]);

      // Extrai a base do servidor (protocolo + host + porta)
      const serverMatch = formatted.match(/^(https?:\/\/[^\/?#]+)/i);
      const serverUrl = serverMatch ? serverMatch[1] : '';

      let type: 'm3u' | 'hls' | 'ssiptv' | 'generic' = 'm3u';
      if (/output=hls/i.test(formatted) || /type=m3u_hls/i.test(formatted)) {
        type = 'hls';
      }

      return {
        serverUrl,
        username,
        password,
        isXtreamCompatible: true,
        type,
        originalUrl,
      };
    }

    // 2. Extração por Links Curtos (ex: /p/usuario/senha/m3u ou /p/usuario/senha/hls ou /p/usuario/senha/ssiptv)
    const shortLinkMatch = formatted.match(/^(https?:\/\/[^\/]+)\/p\/([^\/]+)\/([^\/]+)(?:\/(m3u|hls|ssiptv))?/i);
    if (shortLinkMatch) {
      const serverUrl = shortLinkMatch[1];
      const username = decodeURIComponent(shortLinkMatch[2]);
      const password = decodeURIComponent(shortLinkMatch[3]);
      const formatType = (shortLinkMatch[4] || 'm3u').toLowerCase() as 'm3u' | 'hls' | 'ssiptv';

      return {
        serverUrl,
        username,
        password,
        isXtreamCompatible: true,
        type: formatType,
        originalUrl,
      };
    }

    // 3. Extração por Stream Paths (ex: /live/usuario/senha/..., /movie/usuario/senha/...)
    const streamPathMatch = formatted.match(/^(https?:\/\/[^\/]+)\/(?:live|movie|series|playlist)\/([^\/]+)\/([^\/]+)/i);
    if (streamPathMatch) {
      const serverUrl = streamPathMatch[1];
      const username = decodeURIComponent(streamPathMatch[2]);
      const password = decodeURIComponent(streamPathMatch[3]);

      return {
        serverUrl,
        username,
        password,
        isXtreamCompatible: true,
        type: 'generic',
        originalUrl,
      };
    }

    // 4. Link M3U genérico (sem credenciais explícitas na URL)
    const baseMatch = formatted.match(/^(https?:\/\/[^\/?#]+)/i);
    return {
      serverUrl: baseMatch ? baseMatch[1] : formatted,
      isXtreamCompatible: false,
      type: 'generic',
      originalUrl,
    };
  } catch (err) {
    return {
      serverUrl: formatted,
      isXtreamCompatible: false,
      originalUrl,
    };
  }
}
