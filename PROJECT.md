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
| **Engine de Reprodução** | **ExoPlayer (`expo-video`)** nativo de alta fluidez + fallback com watchdog automático |
| **Navegação TV** | Suporte a foco D-pad (`hasTVPreferredFocus`, `focusable`, `tvParallaxProperties`, `FocusableItem`) |
| **Backend** | **Arquitetura Direta (Zero Backend Intermediário)**: O app consome diretamente a API Xtream Codes do provedor e APIs públicas para enriquecimento de posters |
| **Monetização / Assinatura** | **Nenhuma.** O fluxo de `/api/devices/init`, `/expirado.tsx` e cobrança PIX foi 100% extirpado |

---

## 3. Identidade Visual e Design

* **Tema Base:** Dark Cinema OLED (`#050505` / `#121212`) com elementos de alto contraste.
* **Paleta de Cores de Destaque:**
  * Ciano Elétrico (`#00E5FF`) e Roxo Neon (`#A855F7`) nos destaques e botões de ação principal.
  * Ouro / Âmbar Brilhante (`#FFD700` / `#F5A623`) para favoritos e notas de classificação.
  * Vermelho Carmesim (`#E50914`) para indicadores de canais ao vivo e ações destrutivas.
  * Branco Puro (`#FFFFFF`) e Cinza Metálico (`#8E8E93`) para tipografia e metadados.
* **Identidade Visual:** Silhueta de TV retrô translúcida com antenas neon em gradiente Sunset/Fire, exibindo a letra **A** e o símbolo de Play integrados (`assets/brand/axi_player_icon.jpg`).

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
* **Isolamento de Dados por Conta (`Account-Scoped Storage`):**
  * Todas as coleções locais (`Favoritos`, `Continuar Assistindo`, `Minha Lista` e `Assistir Depois`) são escopadas pelo ID da conta ativa (`getAccountScopedKey`), garantindo que listas de provedores ou perfis diferentes nunca se misturem.

### 4.2 Dashboard Principal (Home)
* **Banner Hero Cinematográfico:** Título em destaque com pôster em alta definição, nota IMDb e botão *"Assistir agora"*.
* **Categorias Dinâmicas de Filmes e Séries (`HomeCategories`):**
  * Fileiras horizontais com paletas de cores gradientes exclusivas para cada gênero.
  * Algoritmo de limpeza de títulos (`cleanCategoryName`) que remove prefixos poluídos de IPTV (como `[VOD]`, `FILMES |`, emojis e símbolos).
* **⭐ Canais Favoritos:** Carrossel dinâmico dos canais de TV favoritados pelo usuário com acesso e reprodução com 1 toque.
* **▶ Continuar Assistindo:**
  * Histórico de vídeos em andamento com barra de progresso em tempo real (porcentagem assistida).
  * Botão de exclusão rápida (`✕`) direto no card para limpar itens concluídos sem sair da Home.
  * Retomada instantânea do vídeo exatamente no segundo onde parou, utilizando o stream validado no watchdog.
* **🕒 Assistir Depois:** Carrossel com badge indicativo de tipo (`Filme` / `Série`) e abertura direta no player ou tela de detalhes.
* **Atualização em Tempo Real:** Recarregamento automático ao alternar contas ou retornar à tela via `useFocusEffect`.

### 4.3 Módulo TV Ao Vivo & EPG
* **⭐ Categoria "Canais Favoritos" Dinâmica:** Criada automaticamente no topo da lista assim que qualquer canal é favoritado.
* **🔒 Controle Parental Estrito com PIN de 4 Dígitos:**
  * Categorias e canais adultos / XXX (`xxx`, `adulto`, `+18`, etc.) **sempre exigem o PIN numérico** a cada clique (nunca permanecem liberados permanentemente após desbloqueio).
  * **Proteção de Inicialização:** Ao entrar na tela de TV ao vivo, o app nunca inicia automaticamente qualquer canal ou categoria adulta no player de fundo.
* Grade de canais com logos, programa atual e botão de favoritar direto.
* Mini Player no topo com visualização em tempo real do canal selecionado, botão `[ ⛶ Abrir ]` para tela cheia e botões de Cast e Favoritar.
* Troca rápida de canal via D-pad (Cima / Baixo) durante a reprodução.

### 4.4 Módulo Filmes & Séries (VOD)
* **Detecção Inteligente de Versões de Vídeo (`iptvVersions.ts`):**
  * Identificação automática de resoluções (`4K`, `FHD`, `1080p`, `HD`, `720p`, `SD`) e formatos de áudio (`Dublado`, `Legendado`, `Dual Áudio`, `Nacional`).
  * Modal interativo de seleção de versão para que o usuário escolha a qualidade ideal para sua velocidade de conexão.
* **Enriquecimento Inteligente de Capas e Metadados (IMDb API + iTunes BR):**
  * Mecanismo automatizado em `src/services/metadataEnricher.ts` para buscar pôsteres oficiais em alta resolução quando o provedor IPTV não fornecer imagem ou fornecer imagem corrompida.
  * Prioridade 1: IMDb Public API. Prioridade 2: iTunes Search API (Brasil).
  * Validação estrita de títulos (`isTitleMatch`) para evitar capas trocadas.
  * Componente `EnrichedPosterImage` com cache local no AsyncStorage (`@axi_enrich_v4_`).
* **Carga Otimizada Sob Demanda (Alta Performance para 20.000+ Títulos):**
  * Consultas segmentadas por categoria (`category_id`) ao invés de downloads maciços de listas inteiras.
  * Carregamento em menos de 250 ms utilizando a primeira categoria ativa da lista do usuário.
  * Cache em memória estático (`XtreamClient.apiCache`) de 10 minutos para evitar requisições redundantes.
* **Abertura e Tela de Detalhes Cinematográfica (Design Premium 16:9):**
  * Backdrop imersivo 16:9 no topo com gradiente suave na base e botão de voltar flutuante.
  * Título em destaque, ano de lançamento, gênero, elenco, direção e sinopse expansível.
  * Botão grande em pílula gradiente ciano/roxo: `[ ▷ Assistir ]`.
  * **3 Ações Rápidas em Linha:** `+ Minha lista`, `🕒 Assistir depois` e `⭐ Favoritar`.
  * Para Séries: Seletor de temporadas e lista de episódios com minutagem individual.

### 4.5 Gerenciador de Listas & Coleções no Menu
* **Seção "Minhas Listas & Coleções" em Configurações:**
  * Indicadores com contagem em tempo real para:
    * `⭐ Meus Favoritos` (Canais, Filmes e Séries)
    * `▶ Continuar Assistindo` (Histórico com progresso e tempo assistido)
    * `📑 Minha Lista` (Títulos adicionados à lista pessoal)
    * `🕒 Assistir Depois` (Títulos marcados para mais tarde)
* **Modal Gerenciador Completo:**
  * 4 Abas superiores: *Favoritos*, *Continuar*, *Minha Lista* e *Depois*.
  * **Filtro de Categorias Universal:** Seletor de chips dinâmico (`Todos`, `Ao Vivo`, `Filmes`, `Séries`) visível e ativo em todas as abas.
  * Ações rápidas por item: botão `[ ▶ ]` para reprodução direta no player e `[ 🗑 ]` para exclusão individual com confirmação.
  * Layout blindado contra colisões com a barra de status e quebras de flexbox no Android.

### 4.6 Player Avançado com Watchdog Automático
* **Watchdog de 10 Segundos e Auto-Fallback:**
  * Se o link de vídeo retornar erro ou demorar mais de 10 segundos para carregar, o player testa automaticamente as extensões e formatos alternativos suportados (`.m3u8`, `.ts`, `.mp4`).
  * Em caso de falha de todos os links, exibe uma mensagem amigável ao usuário informando instabilidade no servidor ou vídeo indisponível.
* **Controles Completos e OSD Interativo:**
  * Botões dedicados de retrocesso (`↺ 10`) e avanço (`↻ 10`) rápido de 10 segundos.
  * Timeline interativa com arraste livre e tempo formatado (`MM:SS` / `HH:MM:SS`).
  * OSD inteligente que oculta após 4 segundos de inatividade e reativa com toque simples.
* **Gestos na Tela (Swipe):**
  * Deslize vertical no lado esquerdo da tela: Controle de **Brilho**.
  * Deslize vertical no lado direito da tela: Controle de **Volume**.
* **Gravação Automática de Progresso:** Salva o ponto exato da reprodução a cada 5 segundos no escopo da conta ativa.

### 4.7 Segurança e Prevenção de Falsos Positivos de Antivírus
* **Remoção de Permissões Invasivas:**
  * Eliminação de `MANAGE_EXTERNAL_STORAGE` (permissão que acionava alertas de spyware/trojan no AVG/Avast/Play Protect).
  * O app opera estritamente com permissões seguras de mídia (`READ_MEDIA_VIDEO`, `READ_MEDIA_IMAGES`) e armazenamento privado do aplicativo.
* **Configuração de Rede Blindada (`network_security_config.xml`):**
  * Remoção de `<certificates src="user" />` para impedir vulnerabilidades de interceptação MITM.
  * Manutenção de `<certificates src="system" />` e `cleartextTrafficPermitted="true"` para garantir compatibilidade com fluxos HTTP dos provedores IPTV.

### 4.8 Configurações & Preferências
* **Intervalo de Recarregamento da Lista IPTV:** Configuração da frequência de sincronização automática (3 a 5 dias).
* **Forçar Atualização Imediata:** Sincronização manual com o servidor com feedback visual.
* **Controle Parental & Alteração de PIN:** Troca do código de 4 dígitos com verificação de PIN anterior.
* **Preferências de Reprodução:** Escolha do formato de fluxo (`HLS / .m3u8` ou `MPEG-TS / .ts`) e motor (`ExoPlayer Nativo` ou `LibVLC`).
* **Limpeza de Cache:** Liberação de memória de EPG e miniaturas com 1 clique.

---

## 5. Estrutura do Código do App

```text
axi-player/
├── app/                              # Rotas do Expo Router
│   ├── (tabs)/
│   │   ├── _layout.tsx               # Barra de navegação inferior flutuante
│   │   ├── index.tsx                 # Dashboard Home (Hero, Categorias, Continuar, Favoritos)
│   │   ├── live.tsx                  # TV Ao Vivo, EPG e Mini-player
│   │   ├── movies.tsx                # Filmes VOD, Versões e Detalhes
│   │   ├── series.tsx                # Séries VOD, Temporadas e Episódios
│   │   └── settings.tsx              # Configurações, PIN Parental e Gerenciador de Listas
│   ├── player/
│   │   └── [id].tsx                  # Player de vídeo avançado com Watchdog e Gestos
│   ├── login.tsx                     # Login Xtream Codes e M3U
│   ├── search.tsx                    # Busca global com modal de detalhes integrado
│   └── _layout.tsx                   # Layout raiz com tema escuro e StatusBar
├── plugins/
│   └── withCleartextTraffic.js       # Plugin de configuração de rede (HTTP cleartext seguro)
├── src/
│   ├── components/
│   │   ├── common/
│   │   │   ├── EnrichedPosterImage.tsx # Pôster inteligente com fallback IMDb/iTunes
│   │   │   └── FocusableItem.tsx       # Componente com suporte a foco D-pad para Android TV
│   │   ├── home/
│   │   │   └── HomeCategories.tsx      # Fileiras de categorias de filmes e séries com gradientes
│   │   └── live/
│   │       ├── ChannelCard.tsx
│   │       └── EpgTimeline.tsx
│   ├── services/
│   │   ├── iptvVersions.ts           # Detecção de resoluções (4K/1080p) e áudios (Dub/Leg)
│   │   ├── metadataEnricher.ts       # Enriquecimento via APIs IMDb e iTunes BR
│   │   ├── parentalControl.ts        # Filtros de categorias adultas e validação de PIN
│   │   ├── permissions.ts            # Verificação e solicitação segura de permissões
│   │   ├── storage.ts                # Armazenamento escopado por conta (AsyncStorage)
│   │   └── xtreamClient.ts           # Cliente otimizado Xtream Codes com cache em memória
│   └── theme/
│       └── colors.ts                 # Paleta visual Dark Cinema OLED
└── assets/                           # Ícones, splash screens e identidade visual
```
