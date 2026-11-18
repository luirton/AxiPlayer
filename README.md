# 🚀 Axi Player

<p align="center">
  <img src="assets/icon.png" width="120" height="120" alt="Axi Player Logo" style="border-radius: 24px;" />
</p>

<p align="center">
  <strong>Player moderno de IPTV & OTT para Android (Smartphones, Tablets e Android TV / TV Box)</strong><br />
  Alta performance • Interface limpa • Sem mensalidades • Sem bloqueios<br />
  <sub>Created by <a href="https://github.com/luirton">Luirton Gurgel</a></sub>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React_Native-0.88-blue.svg?logo=react" alt="React Native" />
  <img src="https://img.shields.io/badge/Expo_SDK-58-black.svg?logo=expo" alt="Expo" />
  <img src="https://img.shields.io/badge/TypeScript-6.0-blue.svg?logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Platform-Android_%7C_Tablet_%7C_Android_TV-green.svg?logo=android" alt="Android" />
  <img src="https://img.shields.io/badge/License-MIT-orange.svg" alt="License" />
</p>

---

## 📺 Visão Geral

O **Axi Player** é um reprodutor de mídia e IPTV de última geração construído com **React Native** e **Expo SDK 58**. Desenvolvido com foco em velocidade, estabilidade e experiência do usuário, ele traz um design inspirado no layout clássico do IBO Smarters / AtivePlay, totalmente livre de paywalls, ativações mensais ou telas de expiração.

Compatível com telas sensíveis ao toque (celulares e tablets) e controles remotos D-Pad (Android TV e TV Box).

---

## ✨ Principais Recursos

### 📡 TV Ao Vivo
- **Player Redimensionável In-Place**: O mini-player expande instantaneamente para tela cheia (*Fullscreen*) sem recarregar o stream, sem cortes de áudio e sem delay de buffer. Ao voltar, o vídeo continua reproduzindo sem pausas no topo da lista.
- **⭐ Categoria "Canais Favoritos" Dinâmica**: Criada automaticamente no topo da lista de categorias assim que um canal é favoritado pelo usuário.
- **🔒 Controle Parental Estrito com PIN de 4 Dígitos**: Categorias e canais adultos / XXX são rigorosamente protegidos. **Sempre que clicar na categoria ou canal adulto, solicita o PIN de 4 dígitos** (não permanece liberado permanentemente). Além disso, ao entrar em TV ao vivo, nenhum vídeo adulto inicia automaticamente. O PIN pode ser alterado a qualquer momento em Configurações (padrão inicial: `0000`).
- **Troca Rápida de Canais**: Botões de avanço e retrocesso (`|◀` e `▶|`) para navegação sequencial sem sair da tela cheia.
- **Gaveta Rápida de Canais**: Alterne entre canais da mesma categoria através de um menu lateral transparente durante a reprodução.
- **Guia de Programação (EPG) Inteligente**: Decodificação automática de Base64 UTF-8 (compatível com acentuação e caracteres em português) e formatação de horários (`19:30 - 21:00`).
- **Transmitir para TV**: Botão de pareamento Cast / Smart TV integrado.
- **Abertura Direta**: Toque no canal da lista para abrir imediatamente em tela cheia.

### 🏠 Tela Inicial (Home)
- **Chips Reordenados**: Navegação intuitiva no topo com `[ Tudo ]`, `[ Ao vivo ]` (redirecionamento direto), `[ Séries ]` e `[ Filmes ]`.
- **⭐ Canais Favoritos**: Listagem em carrossel horizontal de todos os canais favoritados para play instantâneo com 1 toque.
- **🕒 Assistir Depois (Exibição Única)**: Carrossel horizontal de filmes e séries salvos para ver mais tarde, direcionando para a tela de informações completas ao tocar.
- **▶ Continuar Assistindo**: Histórico automático com barra de progresso visual (laranja/ouro) no rodapé do pôster, direcionando para a tela de detalhes com informações antes do play.
- **Filmes Recentes**: Carrossel com os lançamentos mais recentes retornados pelo provedor, abrindo a tela de informações detalhadas ao tocar.
- **Streaming Brands**: Acesso rápido aos catálogos de **Netflix**, **Prime Video**, **Disney+**, **Max**, **Globoplay**, **Apple TV+** e **Paramount+** com escolha entre filmes ou séries.

### 🎬 Filmes (VOD) e Séries
- **Capas e Metadados Inteligentes (IMDb + iTunes BR)**:
  - Busca automática em APIs públicas do **IMDb** e **Apple iTunes Brasil** para preencher pôsteres ausentes ou corrigir capas trocadas pelo provedor.
  - Correspondência estrita de títulos (`isTitleMatch`) evitando posters incorretos.
  - Componente universal `EnrichedPosterImage` com cache local no dispositivo (`AsyncStorage`).
- **Carregamento Instantâneo Sob Demanda (Otimizado para 20.000+ Títulos)**:
  - Eliminação de travamentos por downloads de arquivos JSON massivos: o app busca conteúdos por categoria (`category_id`), renderizando as telas em menos de **250 ms**.
  - Cache em memória de alta performance evitando tráfego de rede redundante.
- **Abertura Cinematográfica Premium (Design 16:9)**:
  - Banner backdrop 16:9 de alta resolução com gradiente cinematográfico OLED escuro e botão voltar flutuante.
  - Título em destaque, ano de lançamento, gênero e informações de áudio/vídeo.
  - Botão de destaque em pílula gradiente ciano/roxo: `[ ▷ Assistir ]`.
  - **Inclusão Automática**: Ao tocar em "Assistir" ou selecionar qualquer episódio de série, o título é adicionado automaticamente à **Minha Lista**.
  - **3 Ações Rápidas**: `+ Minha lista` (ou `✓ Na lista`), `🕒 Assistir depois` (ou `✓ Salvo`) e `⭐ [Nota]` (Favoritar).
  - Sinopse com expansão `Ver mais / Ver menos`, elenco e direção.
  - **Recomendações Inteligentes**:
    - Em Filmes: Carrossel `Você também pode gostar` com recomendados da mesma categoria.
    - Em Séries: Abas `Episódios` e `Títulos semelhantes`.
  - **Temporadas e Episódios**: Seletor de temporadas e lista de episódios vertical mantendo o padrão visual elegante.
- **🔒 Proteção Parental Estrita**: Categorias e filmes/séries adultos ou XXX exigem validação do PIN de 4 dígitos sempre antes de abrir os detalhes ou reproduzir.

### 🎮 Player Avançado com Controles Gestuais & OSD
- **Controle de Navegação Temporal (VOD)**:
  - Barra de progresso interativa para buscar momentos específicos no vídeo.
  - Botões dedicados de pular 10 segundos para trás (`↺ 10`) e 10 segundos para frente (`↻ 10`).
- **Controles Gestuais por Swipe**:
  - Deslizar na lateral esquerda da tela ajusta o **Brilho**.
  - Deslizar na lateral direita ajusta o **Volume**.
- **OSD Inteligente e Fiel à Reprodução**:
  - Os botões e a timeline somem após 4 segundos de inatividade para exibição imersiva.
  - **Toque para Reexibir**: Tocar em qualquer ponto da tela reativa os controles na hora.

### 📋 Gerenciador de Listas & Coleções no Menu
- **Seção "Minhas Listas & Coleções" em Configurações**:
  - Acesso direto e contadores em tempo real de `⭐ Meus Favoritos`, `📑 Minha Lista` e `🕒 Assistir Depois`.
  - Modal com abas dedicadas, subfiltros para Favoritos (`Todos`, `Ao Vivo`, `Filmes`, `Séries`), play rápido e remoção instantânea.

### 🔍 Tela de Busca Global Inteligente (`/search`)
- **Acesso Rápido**: Acionada pelo ícone de busca em Filmes, Séries ou na Home.
- **Filtros Otimizados**: Abas ordenadas por `[ Todos ]` (inicial padrão), `[ Filmes ]` e `[ Séries ]` com carregamento focado e veloz.
- **Contador em Tempo Real**: `Resultado da busca (X)` com atualização dinâmica.
- **Grade Responsiva**: Pôsteres enriquecidos com notas e títulos.
- **Modal de Detalhes Integrado**: Ao tocar em qualquer filme ou série, abre diretamente o modal cinematográfico na própria tela de busca, permitindo ler sinopse, ver elenco e dar play sem ser redirecionado para o menu anterior.

### ⚙️ Configurações & Perfil
- **Intervalo de Recarregamento de Lista**: Escolha entre 3 a 5 dias para atualizar o cache da lista IPTV sem onerar o consumo de dados.
- **Alteração do PIN de Controle Parental**: Interface para alterar a senha de 4 dígitos com confirmação e validação do PIN anterior.
- **Preferências de Reprodução**: Escolha entre stream HLS (`.m3u8`) ou MPEG-TS (`.ts`) e seleção de motor do player.

### 🧭 Navegação Imersiva e FloatingTabBar
- **Menu em Pílula Flutuante Elevado**: Barra de navegação suspensa com margem inferior segura, garantindo que nunca fique coberta pelos gestos ou botões do sistema.
- **Modo Imersivo Android**: Ocultamento automático da barra de navegação virtual do sistema operacional (`immersive mode`), aproveitando 100% da área da tela OLED.

### 🔗 Suporte Universal a Listas e Links
Aceita autenticação direta ou importação colando a URL da lista:
1. **Xtream Codes API**: Conexão nativa via `Servidor + Usuário + Senha`.
2. **M3U Completo com Parâmetros**: `http://servidor:porta/get.php?username=...&password=...&type=m3u_plus`
3. **Links Curtos M3U**: `http://servidor/p/{usuario}/{senha}/m3u`
4. **Links HLS**: `http://servidor:porta/get.php?username=...&password=...&output=hls`
5. **Links Curtos HLS**: `http://servidor/p/{usuario}/{senha}/hls`
6. **Links SSIPTV**: `http://servidor/p/{usuario}/{senha}/ssiptv`
7. **Detecção Automática**: Ao colar qualquer um dos links acima, o app extrai automaticamente o servidor, login e senha em tempo real.

---

## 📁 Estrutura do Projeto

```text
axi-player/
├── app/
│   ├── (tabs)/
│   │   ├── _layout.tsx       # Navegação com FloatingTabBar personalizada
│   │   ├── index.tsx         # Início com banners de streaming e destaques
│   │   ├── live.tsx          # TV Ao Vivo com Player In-Place e Categorias
│   │   ├── movies.tsx        # Catálogo de Filmes com filtros inteligentes
│   │   ├── series.tsx        # Catálogo de Séries com temporadas e episódios
│   │   └── settings.tsx      # Configurações do app e gerenciamento de contas
│   ├── _layout.tsx           # Configuração raiz (StatusBar, NavigationBar)
│   ├── index.tsx             # Splash screen com roteamento automático
│   ├── login.tsx             # Login por Link M3U/Curto ou Xtream API
│   └── player/
│       └── [id].tsx          # Player de vídeo para Filmes e Séries
├── assets/                   # Ícones, logo moderna e splash screen
├── src/
│   ├── components/
│   │   ├── common/           # FocusableItem (D-Pad para Android TV e toque)
│   │   ├── home/             # StreamingBrands (Cartões estilizados das plataformas)
│   │   └── navigation/       # FloatingTabBar flutuante com auto-hide em fullscreen
│   ├── services/
│   │   ├── epgParser.ts      # Decodificador Base64 UTF-8 e formatador de horários
│   │   ├── linkParser.ts     # Analisador de links M3U, HLS e links curtos
│   │   ├── storage.ts        # Armazenamento seguro de contas, favoritos e histórico
│   │   ├── uiState.ts        # Gerenciamento de estado de tela cheia
│   │   └── xtreamClient.ts   # Cliente direto da API Xtream Codes (player_api.php)
│   ├── theme/
│   │   └── colors.ts         # Paleta Dark OLED com detalhes em degradê de fogo
│   └── types/
│       └── iptv.ts           # Interfaces e modelos TypeScript do IPTV/OTT
├── app.json                  # Manifesto e plugins do Expo
├── eas.json                  # Configurações de compilação do APK nativo
└── package.json              # Dependências e scripts do projeto
```

---

## 🛠️ Como Executar Localmente

### Pré-requisitos
- [Node.js](https://nodejs.org/) (versão 18 ou superior)
- [npm](https://www.npmjs.com/) ou [yarn](https://yarnpkg.com/)

### 1. Clonar o repositório
```bash
git clone https://github.com/luirton/AxiPlayer.git
cd AxiPlayer
```

### 2. Instalar as dependências
```bash
npm install
```

### 3. Iniciar o servidor de desenvolvimento
```bash
npx expo start
```
- Pressione `a` para abrir no emulador Android conectado via ADB.
- Ou escaneie o QR Code com o aplicativo Expo Go ou Development Client.

---

## 📦 Como Gerar o APK Instalável (.apk)

O projeto já está configurado com [EAS Build](https://expo.dev/eas) para compilar o APK pronto para instalação no seu celular, tablet ou TV Box:

```bash
# 1. Faça login na sua conta Expo (gratuita)
npx eas-cli login

# 2. Inicie a compilação do APK na nuvem
npx eas-cli build -p android --profile preview
```

Ao término do processo, um link direto e um QR Code serão exibidos para download imediato do arquivo `AxiPlayer.apk`.

---

## 🎨 Paleta de Cores e Identidade

- **Fundo Primário:** `#0A0A0C` (Preto OLED profundo)
- **Superfícies e Cartões:** `#14141A` / `#16161F`
- **Acentos:** `#FF6A00` a `#FFA000` (Gradiente Sunset / Fire)
- **Destaques de Categoria:** `#F5A623` (Âmbar vibrante)
- **Barra de Navegação do Sistema:** `#000000` (100% preta com botões visíveis)

---

## 📄 Licença

Distribuído sob a licença MIT. Consulte `LICENSE` para obter mais informações.
