# 🚀 Axi Player

<p align="center">
  <img src="assets/icon.png" width="120" height="120" alt="Axi Player Logo" style="border-radius: 24px;" />
</p>

<p align="center">
  <strong>Player moderno de IPTV & OTT para Android (Smartphones, Tablets e Android TV / TV Box)</strong><br />
  Alta performance • Interface limpa • Sem mensalidades • Sem bloqueios
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
- **Troca Rápida de Canais**: Botões de avanço e retrocesso (`|◀` e `▶|`) para navegação sequencial sem sair da tela cheia.
- **Gaveta Rápida de Canais**: Alterne entre canais da mesma categoria através de um menu lateral transparente durante a reprodução.
- **Guia de Programação (EPG) Inteligente**: Decodificação automática de Base64 UTF-8 (compatível com acentuação e caracteres em português) e formatação de horários (`19:30 - 21:00`).
- **Transmitir para TV**: Botão de pareamento Cast / Smart TV integrado.
- **Abertura Direta**: Toque no canal da lista para abrir imediatamente em tela cheia.

### 🎛️ Gestos Touch Intuitivos
- **Controle de Brilho**: Deslize verticalmente na **metade esquerda** da tela do player para ajustar o brilho.
- **Controle de Volume**: Deslize verticalmente na **metade direita** da tela do player para ajustar o volume nativo.
- **Indicadores HUD**: Feedback visual na tela com ícones dinâmicos e porcentagens em tempo real.
- **Modo Imersivo**: Ocultamento automático da barra de navegação do Android durante a reprodução.

### 🎬 Filmes (VOD) e Séries
- **Navegação Moderna por Abas Horizontais**: Abas de categorias no topo com scroll suave (`Para você`, `Lançamentos`, `Ação`, etc.) com indicador ativo em âmbar/ouro.
- **Card Hero Imersivo de Destaque**: Pôster vertical em alta definição com gradiente cinematográfico OLED, nota, ano de lançamento, sinopse e botão de reprodução direta `[ ▶ Assistir agora ]`.
- **Carrosséis Horizontais de Conteúdo**: Seções organizadas por categoria com badge contador e botão `Ver todos >`, exibindo pôsteres em proporção 2:3 com nota e título.
- **Destaque de Plataformas de Streaming**: Acesso rápido aos catálogos de **Netflix**, **Prime Video**, **Disney+**, **Max**, **Globoplay**, **Apple TV+** e **Paramount+**.
- **Filtros e Busca Dedicada**: Campo de pesquisa espaçoso em largura total com limpeza em um clique e banner informativo de filtros ativos.
- **Detalhes de Séries**: Navegação fluida por temporadas e episódios com sinopse, duração e capas em alta definição.

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
