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
* Acesso rápido em grade responsiva (com suporte a controle remoto):
  * 📺 **TV Ao Vivo** (Canais organizados por categorias)
  * 🎬 **Filmes** (Catálogo VOD com busca e filtros)
  * 🍿 **Séries** (Organização por temporadas e episódios)
  * ⭐ **Favoritos** (Canais e conteúdos favoritados)
  * 🕒 **Continuar Assistindo / Histórico**
  * 📅 **Guia de Programação (EPG)**

### 4.3 Módulo TV Ao Vivo & EPG
* Lista de categorias com contagem de canais.
* Grade de canais com logos dos canais, programa atual e barra de progresso.
* Janela de pré-visualização rápida ou tela cheia instantânea.
* Troca rápida de canal via D-pad (Cima / Baixo) durante a reprodução.

### 4.4 Módulo Filmes & Séries (VOD)
* **Navegação Moderna por Abas Horizontais (Fiel à Imagem de Referência):**
  * Barra de abas horizontais no topo com scroll fluido: `[ Para você ]`, `[ Lançamentos ]`, `[ Séries Pedidos ]`, `[ Ação ]`, etc.
  * Aba ativa destacada com texto em branco `#FFFFFF` e sublinhado âmbar/ouro `#FFA000`.
* **Card Hero Imersivo de Destaque:**
  * Pôster em alta definição vertical ocupando 100% da largura.
  * Gradiente OLED escuro com título em destaque.
  * Metadados em tempo real: Nota (ex: `⭐ 8.0`), Ano de lançamento e Gêneros.
  * Botão de ação em pílula gradiente Sunset/Fire `[ ▶ Assistir agora ]`.
  * Sinopse / plot descritivo elegante.
* **Carrosséis Horizontais de Conteúdo:**
  * Cabeçalho de categoria com badge de contagem (ex: `84`) e ação rápida `Ver todos >`.
  * Carrossel de pôsteres cinematográficos em proporção 2:3 com nota e título.
  * Grade complementar para exploração rápida de mais títulos.
* Para Séries:
  * Modal avançado de Temporadas (Temporada 1, 2, etc.) e Episódios com duração e reprodução direta.

### 4.5 Player Avançado (Fiel ao Modelo IBO Smarters)
* **Controles completíssimos:**
  * Passar canal para trás (`|◀`) e para frente (`▶|`) instantaneamente.
  * Play / Pause (`⏸` / `▶`).
  * Botão **Transmitir para TV** (Chromecast / Smart TV).
  * **Controles por Gesto na Tela (Swipe):**
    * Lado esquerdo da tela: Ajuste de **Brilho** com indicador HUD em tempo real.
    * Lado direito da tela: Ajuste de **Volume** com indicador HUD em tempo real.
  * Barra de timeline amarela com indicador "Ao vivo".
  * Gaveta lateral de canais (`[ ≡ Canais ]`): troca rápida de canal sem sair da reprodução.
  * Guia de programação interativo (`[ 📅 Programação ]`).
  * Botão de favoritar canal (`[ ⭐ Favoritar ]`).

### 4.6 Interface Mobile & TV (Fiel aos Screenshots)
* **Barra de Navegação Flutuante em Pílula:**
  * `[ ≡ Menu ]`, `[ 🏠 Início ]`, `[ ((•)) TV ao vivo ]` com pílula de destaque em gradiente laranja/ouro.
* **Tela de Início:**
  * Chips de filtro (`Tudo`, `Séries`, `Filmes`, `Categorias`).
  * Card Hero vertical de destaque com botão gradiente `[ ▷ Assistir agora ]`.
  * Carrossel de jogos e canais ao vivo abaixo.
* **Tela de TV Ao Vivo:**
  * Mini Player no topo com visualização em tempo real do canal selecionado, botão `[ ⛶ Abrir ]` para tela cheia e botões de Cast e Favoritar.
  * Lista de categorias em acordeão expansível com indicador de canais e botão `Abrir >` / `Fechar v`.

### 4.6 Configurações
* **Perfis & Parental Control:** Bloqueio de categorias por PIN de 4 dígitos.
* **Formato de Transmissão:** Escolha entre MPEG-TS (`.ts`) ou HLS (`.m3u8`).
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
