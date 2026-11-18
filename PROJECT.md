# Projeto: Axi Player (Streaming IPTV & VOD)

## 1. Visão Geral
O **Axi Player** é um aplicativo completo de streaming IPTV e VOD de alta performance, desenhado para funcionar de maneira universal e responsiva em:
* **Smartphones & Tablets** (Android / iOS)
* **Android TV & TV Box** (Navegação otimizada para controle remoto / D-pad)

O projeto é inspirado na arquitetura e usabilidade do *IBO Smarters*, porém desenvolvido como um app totalmente livre, moderno e **sem nenhuma trava de pagamento, mensalidade ou ativação de dispositivo**.

---

## 2. Decisões de Arquitetura e Stack

| Componente | Definição |
| :--- | :--- |
| **Nome do App** | **Axi Player** |
| **Autor / Criador** | **Luirton Gurgel** ([GitHub: @luirton](https://github.com/luirton)) |
| **Plataformas** | Android Mobile, Android TV, TV Box, Tablets (e compatível com iOS) |
| **Stack Principal** | **React Native + Expo** (Expo Router, TypeScript) |
| **Engine de Reprodução** | **ExoPlayer (`react-native-video`)** para HLS/DASH/MP4 + **LibVLC (`react-native-vlc-media-player`)** para streams legados/TS |
| **Navegação TV** | Suporte a foco D-pad (`hasTVPreferredFocus`, `focusable`, `tvParallaxProperties`) |
| **Backend** | **Arquitetura Direta (Zero Backend Intermediário)**: O app consome diretamente a API Xtream Codes do servidor do usuário e a API do TMDB |
| **Monetização / Assinatura** | **Nenhuma.** O fluxo de `/api/devices/init`, `/expirado.tsx` e cobrança PIX foi 100% extirpado |

---

## 3. Identidade Visual e Design

* **Tema Base:** Dark Cinema OLED (`#050505` / `#121212`) com elementos de alto contraste.
* **Paleta de Cores de Destaque:**
  * Vermelho Carmesim (`#E52D27`)
  * Laranja Radiante (`#FF6A00`)
  * Âmbar / Ouro Brilhante (`#FFA000`)
  * Branco Puro (`#FFFFFF`) e Cinza Metálico (`#8E8E93`) para tipografia e metadados.
* **Identidade Escolhida:** **Opção 2 (Evolução Clássica Glassmorphic)**
  * Silhueta de TV retrô translúcida com antenas neon em gradiente Sunset/Fire, exibindo a letra **A** e o símbolo de Play integrados.
  * Arquivo oficial salvo em: `assets/brand/axi_player_icon.jpg`.

---

## 4. Funcionalidades Detalhadas

### 4.1 Autenticação e Gestão de Listas
* **Login Xtream Codes API:**
  * Campos: Nome do Perfil, URL do Servidor / DNS, Usuário e Senha.
  * Validação automática de status de conta, data de expiração da lista e formatos suportados.
* **Login via Lista M3U / M3U8:**
  * Inserção de link direto M3U ou carregamento de arquivo local.
* **Multi-contas:**
  * Salvar múltiplos logins e alternar entre provedores sem precisar relogar.

### 4.2 Dashboard Principal (Home)
* Banner hero dinâmico com lançamentos em destaque e pôsteres em alta definição (TMDB).
* **Chips de Navegação Rápida:** `[ Tudo ]`, `[ Ao vivo ]` (logo após Tudo, com redirecionamento direto), `[ Séries ]`, `[ Filmes ]`.
* **⭐ Canais Favoritos:** Carrossel dinâmico dos canais de TV favoritados pelo usuário com acesso e reprodução com 1 toque.
* **🕒 Assistir Depois (Exibição Única):** Carrossel dinâmico de filmes e séries salvos para ver mais tarde com badge indicativo de tipo (`Filme` / `Série`). Ao tocar em qualquer título, abre diretamente a tela de detalhes com informações completas e backdrop 16:9.
* **▶ Continuar Assistindo:** Histórico com barra de progresso visual (laranja/ouro) no rodapé das miniaturas de filmes e séries iniciados. Ao tocar, direciona para a tela de detalhes antes de reproduzir.
* **Marcas de Streaming:** Carrossel de plataformas (Netflix, Prime Video, Disney+, Max, etc.) com modal de escolha entre Filmes e Séries.
* **Filmes Recentes:** Carrossel com os lançamentos mais recentes retornados pelo provedor IPTV, abrindo a tela de informações detalhadas com 1 toque.

### 4.3 Módulo TV Ao Vivo & EPG
* **⭐ Categoria "Canais Favoritos" Dinâmica:** Criada automaticamente no topo da lista assim que qualquer canal é favoritado com a estrela.
* **🔒 Controle Parental Estrito com PIN de 4 Dígitos:**
  * Categorias e canais adultos / XXX (`xxx`, `adulto`, `+18`, etc.) **sempre exigem o PIN numérico** a cada clique (nunca permanecem liberados permanentemente após desbloqueio).
  * **Proteção de Inicialização:** Ao entrar na tela de TV ao vivo, o app nunca inicia automaticamente qualquer canal ou categoria adulta no player de fundo.
* Lista de categorias em acordeão expansível com contagem de canais e indicador de status (bloqueado/desbloqueado).
* Grade de canais com logos, programa atual e botão de favoritar direto.
* Mini Player no topo com visualização em tempo real do canal selecionado, botão `[ ⛶ Abrir ]` para tela cheia e botões de Cast e Favoritar.
* Troca rápida de canal via D-pad (Cima / Baixo) durante a reprodução.

### 4.4 Módulo Filmes & Séries (VOD)
* **Enriquecimento Inteligente de Capas e Metadados (IMDb API + iTunes BR):**
  * Mecanismo automatizado em `src/services/metadataEnricher.ts` para buscar pôsteres oficiais em alta resolução e metadados quando o provedor IPTV não fornecer imagem ou fornecer imagem corrompida.
  * **Prioridade 1 - IMDb Public API:** Consulta `https://v3.sg.media-imdb.com/suggestion/x/${slug}.json` obtendo capas originais da CDN da Amazon.
  * **Prioridade 2 - iTunes Search API (Brasil):** Consulta com filtro `country=BR` para localização fiel em português.
  * **Validação Estrita de Títulos (`isTitleMatch`):** Algoritmo de proximidade de strings para impedir a exibição de capas de filmes não relacionados com nomes similares.
  * **Componente `EnrichedPosterImage`:** Componente universal com fallback visual gracioso e cache local no AsyncStorage (`@axi_enrich_v4_`).
* **Carga Otimizada Sob Demanda (Alta Performance para 20.000+ Títulos):**
  * Substituição de downloads brutos de catálogos inteiros (arquivos de 25 MB+ que travavam a memória) por consultas segmentadas por categoria (`category_id`).
  * As abas "Para você" e telas iniciais carregam em menos de **250 ms** utilizando a primeira categoria ativa da lista do usuário.
  * Cache em memória estático (`XtreamClient.apiCache`) de 10 minutos para evitar requisições redundantes.
* **Abertura e Tela de Detalhes Cinematográfica (Design Premium 16:9):**
  * Backdrop imersivo 16:9 no topo com gradiente suave na base e botão de voltar flutuante.
  * Título em destaque, ano de lançamento, gênero e formato de áudio/vídeo.
  * Botão grande em pílula gradiente ciano/roxo: `[ ▷ Assistir ]`.
  * **Regra de Auto-Inclusão:** Clicar em "Assistir" ou em qualquer episódio inclui automaticamente o título na **Minha Lista**.
  * **3 Ações Rápidas em Linha:**
    1. `+ Minha lista` (ou `✓ Na lista`)
    2. `🕒 Assistir depois` (ou `✓ Salvo`)
    3. `⭐ [Nota]` (Favoritar)
  * Sinopse descritiva com expansor `Ver mais / Ver menos`, elenco e direção.
  * **Recomendações Baseadas na Categoria:**
    * Filmes: Seção horizontal `Você também pode gostar` com outros títulos da mesma categoria.
    * Séries: Abas `Episódios` e `Títulos semelhantes`.
  * Para Séries:
    * Seletor horizontal de temporadas (Temporada 1, 2, etc.) e lista vertical de episódios no estilo do app, com duração e botão de play individual (com auto-inclusão na Minha Lista).
* **🔒 Proteção Parental Estrita:** Filmes e séries de categorias adultas exigem validação do PIN de 4 dígitos antes da exibição dos detalhes ou reprodução.

### 4.5 Gerenciador de Listas & Coleções no Menu
* **Seção "Minhas Listas & Coleções" em Configurações:**
  * Indicadores com contagem em tempo real para:
    * `⭐ Meus Favoritos` (Canais, Filmes e Séries)
    * `📑 Minha Lista`
    * `🕒 Assistir Depois`
  * **Modal Gerenciador Completo:**
    * Abas superiores para alternar entre Favoritos, Minha Lista e Assistir Depois.
    * Subfiltros na aba de Favoritos: `Todos`, `Ao Vivo`, `Filmes`, `Séries`.
    * Ações rápidas por item: botão `[ ▶ ]` para reprodução direta e `[ 🗑 ]` para remoção instantânea da lista com atualização dinâmica dos dados.

### 4.5 Player Avançado (Filmes, Séries & TV Ao Vivo)
* **Controles completíssimos e OSD Interativo:**
  * **Modo TV Ao Vivo:**
    * Passar canal para trás (`|◀`) e para frente (`▶|`) instantaneamente.
    * Barra de timeline azul/ciano com indicador "LIVE" e resolução.
    * Gaveta lateral de canais (`[ ≡ Canais ]`): troca rápida sem sair da reprodução.
    * Guia de programação interativo (`[ 📅 Programação ]`).
    * Botão de favoritar canal (`[ ⭐ Favoritar ]`).
  * **Modo VOD (Filmes & Séries):**
    * Barra de progresso interativa para avanço/retrocesso livre.
    * Botões dedicados de pular 10 segundos para trás (`↺ 10`) e 10 segundos para frente (`↻ 10`).
    * Play / Pause centralizado (`⏸` / `▶`) com feedback visual imediato.
    * Indicadores de tempo transcorrido e duração total formatados (`MM:SS` ou `HH:MM:SS`).
  * **Controles por Gesto na Tela (Swipe):**
    * Lado esquerdo da tela: Ajuste fino de **Brilho** com HUD vertical visual.
    * Lado direito da tela: Ajuste fino de **Volume** com HUD vertical visual.
  * **Visibilidade Inteligente de Controles:**
    * OSD oculta automaticamente após 4 segundos de inatividade para imersão total.
    * Toque simples em qualquer área da tela reativa os controles imediatamente.
  * **Gravação Automática de Progresso:** A cada 5 segundos salva a minutagem atual para permitir "Continuar Assistindo".

### 4.6 Interface Mobile & TV
* **Barra de Navegação Flutuante em Pílula:**
  * `[ ≡ Menu ]`, `[ 🏠 Início ]`, `[ ((•)) TV ao vivo ]` com pílula de destaque suspensa acima dos botões virtuais do Android.
* **Modo Imersivo Android:** Oculta a barra virtual do sistema operacional para evitar colisões com gestos e navegação.
* **Tela de Busca Global e Catálogo Completo (`/search`):**
  * Campo de busca integrado com limpeza rápida (`✕`).
  * Abas de filtragem ordenadas: `[ Todos ]` (inicial padrão), `[ Filmes ]`, `[ Séries ]`.
  * Carregamento direcionado por tipo para economia extrema de banda e renderização instantânea.
  * **Modal de Detalhes Integrado:** Ao clicar em qualquer filme ou série, o app abre diretamente o modal cinematográfico de detalhes (pôster enriquecido via IMDb/iTunes, sinopse expansível, metadados, atores, direção, botões de ação e assistir agora) na própria tela, eliminando redirecionamentos indesejados ao menu anterior.
  * Fallback automático caso o provedor IPTV rejeite listagem completa sem categoria.

### 4.7 Configurações & Perfil
* **Intervalo de Recarregamento da Lista IPTV:**
  * Opção no menu para definir a frequência de sincronização automática da lista (escolha de 3 a 5 dias), economizando recursos do dispositivo e dados de rede.
* **Controle dos Pais & PIN Parental:**
  * Configuração e alteração do PIN numérico de 4 dígitos com validação de PIN atual e confirmação.
* **Formato de Transmissão:** Escolha entre MPEG-TS (`.ts`) ou HLS (`.m3u8`).
* **Motor Padrão do Player:** Alternância entre ExoPlayer Nativo e LibVLC.
* **Cache & Armazenamento:** Opção de limpar cache do EPG e dados temporários.

---

## 5. Estrutura do Código do App

```text
axi-player/
├── app/                      # Rotas do Expo Router
│   ├── (auth)/
│   │   └── login.tsx         # Login Xtream Codes / M3U
│   ├── (tabs)/
│   │   ├── _layout.tsx
│   │   ├── index.tsx         # Dashboard Home
│   │   ├── live.tsx          # TV Ao Vivo
│   │   ├── movies.tsx        # Filmes (VOD)
│   │   ├── series.tsx        # Séries
│   │   └── settings.tsx      # Configurações
│   ├── player/
│   │   └── [id].tsx          # Player de vídeo avançado
│   ├── title/
│   │   └── [id].tsx          # Detalhes de Filme / Série + Episódios
│   └── _layout.tsx
├── src/
│   ├── components/           # Componentes reutilizáveis (Card, D-Pad focusable, Banner, etc.)
│   ├── services/             # Clientes de API (Xtream, TMDB, DNS DoH)
│   ├── hooks/                # Hooks personalizados (useTVNavigation, usePlayer, etc.)
│   ├── store/                # Gerenciamento de estado (Zustand / MMKV)
│   └── theme/                # Cores, tipografia e estilos globais
└── assets/                   # Ícones, logos e splashes do Axi Player
```
