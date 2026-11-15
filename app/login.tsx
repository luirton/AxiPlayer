import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../src/theme/colors';
import { XtreamClient } from '../src/services/xtreamClient';
import { storage } from '../src/services/storage';
import { SavedAccount } from '../src/types/iptv';
import { FocusableItem } from '../src/components/common/FocusableItem';
import { parseIptvLink, ParsedIptvLink } from '../src/services/linkParser';
import { fetchAndParseM3u } from '../src/services/m3uParser';

export default function LoginScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'link' | 'xtream'>('link');

  // Xtream Form Fields
  const [profileName, setProfileName] = useState('');
  const [serverUrl, setServerUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Link Form Fields (M3U, HLS, Link Curto, SSIPTV)
  const [linkInput, setLinkInput] = useState('');
  const [parsedLink, setParsedLink] = useState<ParsedIptvLink | null>(null);

  // Saved Accounts List
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([]);

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    const list = await storage.getAccounts();
    setSavedAccounts(list);
  };

  // Monitor link input changes to extract credentials in real-time
  const handleLinkInputChange = (text: string) => {
    setLinkInput(text);
    if (text.trim().length > 10) {
      const parsed = parseIptvLink(text);
      setParsedLink(parsed);
    } else {
      setParsedLink(null);
    }
  };

  // Auto-fill in manual tab if user pastes a full link in serverUrl field
  const handleServerUrlChange = (text: string) => {
    let clean = text.trim();
    if (clean.includes('get.php') || clean.includes('/p/') || clean.includes('username=')) {
      const parsed = parseIptvLink(clean);
      if (parsed.serverUrl) setServerUrl(parsed.serverUrl);
      if (parsed.username) setUsername(parsed.username);
      if (parsed.password) setPassword(parsed.password);
      return;
    }
    // Converte automaticamente caso usuário digite https na porta 80
    if (clean.startsWith('https://') && (clean.includes(':80/') || clean.endsWith(':80'))) {
      clean = clean.replace('https://', 'http://');
    }
    setServerUrl(clean);
  };

  const handleLinkLogin = async () => {
    if (!linkInput.trim()) {
      Alert.alert('Link obrigatório', 'Por favor, cole o link da sua lista (M3U, HLS, SSIPTV ou Link Curto).');
      return;
    }

    const parsed = parseIptvLink(linkInput);
    setLoading(true);

    try {
      // 1. Se identificamos credenciais Xtream no link
      if (parsed.username && parsed.password && parsed.serverUrl) {
        let authSuccess = false;
        let lastErrorMsg = '';

        // Tentativa A: URL original extraída
        try {
          const client = new XtreamClient(parsed.serverUrl, parsed.username, parsed.password);
          const auth = await client.authenticate();

          const account: SavedAccount = {
            id: `${parsed.username}@${parsed.serverUrl}`,
            name: profileName || auth.user_info.username || 'Minha Lista',
            serverUrl: parsed.serverUrl,
            username: parsed.username,
            password: parsed.password,
            createdAt: Date.now(),
            lastLogin: Date.now(),
          };

          await storage.saveAccount(account);
          await storage.setActiveAccount(account);
          authSuccess = true;
          router.replace('/(tabs)');
          return;
        } catch (apiErr: any) {
          lastErrorMsg = apiErr?.message || '';
          console.warn('Tentativa 1 com URL original falhou:', apiErr);
        }

        // Tentativa B: Fallback removendo ou ajustando porta comum (ex: :80 ou sem porta)
        if (!authSuccess && parsed.serverUrl.includes(':80')) {
          try {
            const altServer = parsed.serverUrl.replace(':80', '');
            const clientAlt = new XtreamClient(altServer, parsed.username, parsed.password);
            const authAlt = await clientAlt.authenticate();

            const account: SavedAccount = {
              id: `${parsed.username}@${altServer}`,
              name: profileName || authAlt.user_info.username || 'Minha Lista',
              serverUrl: altServer,
              username: parsed.username,
              password: parsed.password,
              createdAt: Date.now(),
              lastLogin: Date.now(),
            };

            await storage.saveAccount(account);
            await storage.setActiveAccount(account);
            authSuccess = true;
            router.replace('/(tabs)');
            return;
          } catch (altErr: any) {
            lastErrorMsg = altErr?.message || lastErrorMsg;
          }
        }

        // Tentativa C: Testar download direto do link M3U caso a API Xtream esteja bloqueada no provedor
        if (!authSuccess) {
          try {
            const m3uResult = await fetchAndParseM3u(linkInput.trim(), 15000);
            if (m3uResult.channels.length > 0) {
              const account: SavedAccount = {
                id: `${parsed.username}@${parsed.serverUrl}`,
                name: profileName || 'Lista M3U',
                serverUrl: parsed.serverUrl,
                username: parsed.username,
                password: parsed.password,
                createdAt: Date.now(),
                lastLogin: Date.now(),
              };
              await storage.saveAccount(account);
              await storage.setActiveAccount(account);
              router.replace('/(tabs)');
              return;
            }
          } catch (m3uErr) {
            console.warn('Tentativa M3U direto também falhou:', m3uErr);
          }

          throw new Error(lastErrorMsg || 'Não foi possível validar o link com o servidor IPTV.');
        }
      }

      // 2. Link M3U genérico (sem parâmetros explícitos de usuário/senha na URL)
      const m3uDirect = await fetchAndParseM3u(linkInput.trim(), 20000);
      if (m3uDirect.channels.length === 0) {
        throw new Error('Nenhum canal foi encontrado no link da lista fornecido.');
      }

      const accUsername = parsed.username || 'usuario_m3u';
      const accPassword = parsed.password || '';
      const accServer = parsed.serverUrl || linkInput.trim();

      const account: SavedAccount = {
        id: `${accUsername}@${accServer}`,
        name: profileName || 'Lista IPTV',
        serverUrl: accServer,
        username: accUsername,
        password: accPassword,
        createdAt: Date.now(),
        lastLogin: Date.now(),
      };

      await storage.saveAccount(account);
      await storage.setActiveAccount(account);
      router.replace('/(tabs)');
    } catch (err: any) {
      Alert.alert(
        'Falha ao conectar lista',
        (err?.message || 'Verifique se o link está correto, ativo e com conexão à internet.') +
          '\n\nDica: Se a sua lista usa usuário e senha, você também pode usar a aba "Dados Xtream" acima.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleXtreamLogin = async () => {
    if (!serverUrl || !username || !password) {
      Alert.alert('Campos obrigatórios', 'Por favor, preencha a URL do servidor, usuário e senha.');
      return;
    }

    setLoading(true);
    try {
      let cleanUrl = serverUrl.trim();
      if (cleanUrl.startsWith('https://') && (cleanUrl.includes(':80/') || cleanUrl.endsWith(':80'))) {
        cleanUrl = cleanUrl.replace('https://', 'http://');
      }

      let client = new XtreamClient(cleanUrl, username, password);
      let auth;

      try {
        auth = await client.authenticate();
      } catch (firstErr: any) {
        // Se tiver :80, tenta sem a porta
        if (cleanUrl.includes(':80')) {
          const altServer = cleanUrl.replace(':80', '');
          client = new XtreamClient(altServer, username, password);
          auth = await client.authenticate();
        } else {
          throw firstErr;
        }
      }

      const finalServerUrl = client.getServerUrl();
      const account: SavedAccount = {
        id: `${username}@${finalServerUrl}`,
        name: profileName || auth.user_info.username || 'Minha Lista',
        serverUrl: finalServerUrl,
        username,
        password,
        createdAt: Date.now(),
        lastLogin: Date.now(),
      };

      await storage.saveAccount(account);
      await storage.setActiveAccount(account);

      router.replace('/(tabs)');
    } catch (err: any) {
      Alert.alert(
        'Erro ao conectar',
        (err?.message || 'Verifique os dados de acesso e a conexão com a internet.') +
          '\n\nCertifique-se de que a URL inclui http:// e a porta correta fornecida pelo seu provedor.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSelectSavedAccount = async (account: SavedAccount) => {
    setLoading(true);
    try {
      let fixedServer = account.serverUrl;
      if (fixedServer.startsWith('https://') && (fixedServer.includes(':80/') || fixedServer.endsWith(':80'))) {
        fixedServer = fixedServer.replace('https://', 'http://');
      }
      const fixedAccount = {
        ...account,
        serverUrl: fixedServer,
        id: `${account.username}@${fixedServer}`,
      };
      await storage.saveAccount(fixedAccount);
      await storage.setActiveAccount(fixedAccount);
      router.replace('/(tabs)');
    } catch (err: any) {
      Alert.alert('Erro', 'Não foi possível carregar a conta selecionada.');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveAccount = async (id: string) => {
    await storage.removeAccount(id);
    loadAccounts();
  };

  const getFormatBadgeLabel = (type?: string) => {
    switch (type) {
      case 'm3u':
        return 'M3U Completo / Link Curto';
      case 'hls':
        return 'Transmissão HLS';
      case 'ssiptv':
        return 'Formato SSIPTV';
      default:
        return 'Lista IPTV';
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Header Branding */}
        <View style={styles.header}>
          <Image
            source={require('../assets/icon.png')}
            style={styles.logo}
            contentFit="contain"
          />
          <Text style={styles.title}>Axi Player</Text>
          <Text style={styles.subtitle}>Streaming de alta performance • Sem mensalidade</Text>
        </View>

        {/* Tab Selector */}
        <View style={styles.tabContainer}>
          <FocusableItem
            style={[styles.tabButton, activeTab === 'link' && styles.tabButtonActive]}
            onPress={() => setActiveTab('link')}
          >
            <Ionicons
              name="link-outline"
              size={18}
              color={activeTab === 'link' ? colors.primary : colors.textMuted}
            />
            <Text style={[styles.tabText, activeTab === 'link' && styles.tabTextActive]}>
              Link da Lista (M3U / HLS / Curto)
            </Text>
          </FocusableItem>

          <FocusableItem
            style={[styles.tabButton, activeTab === 'xtream' && styles.tabButtonActive]}
            onPress={() => setActiveTab('xtream')}
          >
            <Ionicons
              name="server-outline"
              size={18}
              color={activeTab === 'xtream' ? colors.primary : colors.textMuted}
            />
            <Text style={[styles.tabText, activeTab === 'xtream' && styles.tabTextActive]}>
              Servidor / Usuário
            </Text>
          </FocusableItem>
        </View>

        {/* Form Card */}
        <View style={styles.card}>
          {activeTab === 'link' ? (
            <>
              <Text style={styles.inputLabel}>Nome do Perfil (opcional)</Text>
              <TextInput
                style={styles.input}
                placeholder="Ex: Minha Lista Prime"
                placeholderTextColor={colors.textMuted}
                value={profileName}
                onChangeText={setProfileName}
              />

              <Text style={styles.inputLabel}>Cole o Link da Lista</Text>
              <TextInput
                style={[styles.input, styles.inputMultiline]}
                placeholder="http://servidor.com/get.php?username=... ou link curto /p/.../m3u"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                multiline
                numberOfLines={3}
                value={linkInput}
                onChangeText={handleLinkInputChange}
              />

              {/* Detected Credentials Card */}
              {parsedLink && parsedLink.username ? (
                <View style={styles.detectedCard}>
                  <View style={styles.detectedHeader}>
                    <Ionicons name="checkmark-circle" size={18} color="#00E676" />
                    <Text style={styles.detectedTitle}>Credenciais Identificadas</Text>
                    <View style={styles.formatBadge}>
                      <Text style={styles.formatBadgeText}>{getFormatBadgeLabel(parsedLink.type)}</Text>
                    </View>
                  </View>

                  <View style={styles.detectedRow}>
                    <Text style={styles.detectedLabel}>Servidor:</Text>
                    <Text style={styles.detectedValue} numberOfLines={1}>
                      {parsedLink.serverUrl}
                    </Text>
                  </View>

                  <View style={styles.detectedRow}>
                    <Text style={styles.detectedLabel}>Usuário:</Text>
                    <Text style={styles.detectedValue}>{parsedLink.username}</Text>
                  </View>

                  <View style={styles.detectedRow}>
                    <Text style={styles.detectedLabel}>Senha:</Text>
                    <Text style={styles.detectedValue}>••••••••••••</Text>
                  </View>
                </View>
              ) : null}

              <FocusableItem
                style={styles.submitButtonContainer}
                onPress={handleLinkLogin}
                disabled={loading}
              >
                <LinearGradient
                  colors={[colors.primaryCrimson, colors.primary, colors.primaryAmber]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.submitGradient}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="flash-outline" size={22} color="#fff" />
                      <Text style={styles.submitText}>Entrar com este Link</Text>
                    </>
                  )}
                </LinearGradient>
              </FocusableItem>
            </>
          ) : (
            <>
              <Text style={styles.inputLabel}>Nome do Perfil (opcional)</Text>
              <TextInput
                style={styles.input}
                placeholder="Ex: Minha TV Sala"
                placeholderTextColor={colors.textMuted}
                value={profileName}
                onChangeText={setProfileName}
              />

              <Text style={styles.inputLabel}>URL do Servidor / DNS</Text>
              <TextInput
                style={styles.input}
                placeholder="http://servidor.com:8080"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                value={serverUrl}
                onChangeText={handleServerUrlChange}
              />

              <Text style={styles.inputLabel}>Usuário</Text>
              <TextInput
                style={styles.input}
                placeholder="Seu usuário"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                value={username}
                onChangeText={setUsername}
              />

              <Text style={styles.inputLabel}>Senha</Text>
              <TextInput
                style={styles.input}
                placeholder="Sua senha"
                placeholderTextColor={colors.textMuted}
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />

              <FocusableItem
                style={styles.submitButtonContainer}
                onPress={handleXtreamLogin}
                disabled={loading}
              >
                <LinearGradient
                  colors={[colors.primaryCrimson, colors.primary, colors.primaryAmber]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.submitGradient}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="log-in-outline" size={22} color="#fff" />
                      <Text style={styles.submitText}>Entrar no Axi Player</Text>
                    </>
                  )}
                </LinearGradient>
              </FocusableItem>
            </>
          )}
        </View>

        {/* Saved Accounts Section */}
        {savedAccounts.length > 0 && (
          <View style={styles.savedSection}>
            <Text style={styles.savedTitle}>Listas Salvas</Text>
            {savedAccounts.map((item) => (
              <View key={item.id} style={styles.savedCard}>
                <FocusableItem
                  style={styles.savedInfo}
                  onPress={() => handleSelectSavedAccount(item)}
                >
                  <Ionicons name="tv-outline" size={24} color={colors.primary} />
                  <View style={styles.savedTextWrapper}>
                    <Text style={styles.savedName}>{item.name}</Text>
                    <Text style={styles.savedUser} numberOfLines={1}>
                      {item.username} • {item.serverUrl}
                    </Text>
                  </View>
                </FocusableItem>

                <Pressable
                  style={styles.removeBtn}
                  onPress={() => handleRemoveAccount(item.id)}
                >
                  <Ionicons name="trash-outline" size={20} color="#ff4444" />
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 40 : 60,
    paddingBottom: 40,
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logo: {
    width: 90,
    height: 90,
    marginBottom: 12,
    borderRadius: 22,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 0.8,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 4,
    textAlign: 'center',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#16161d',
    borderRadius: 14,
    padding: 4,
    marginBottom: 20,
    width: '100%',
    maxWidth: 480,
    borderWidth: 1,
    borderColor: '#242432',
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 8,
  },
  tabButtonActive: {
    backgroundColor: '#242432',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
  },
  tabTextActive: {
    color: '#fff',
  },
  card: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#14141a',
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: '#242430',
  },
  inputLabel: {
    color: '#bbb',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    backgroundColor: '#1c1c24',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#2a2a36',
  },
  inputMultiline: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  detectedCard: {
    backgroundColor: '#12221a',
    borderRadius: 12,
    padding: 14,
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#00E67644',
  },
  detectedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  detectedTitle: {
    color: '#00E676',
    fontSize: 13,
    fontWeight: '800',
    flex: 1,
  },
  formatBadge: {
    backgroundColor: 'rgba(0,230,118,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  formatBadgeText: {
    color: '#00E676',
    fontSize: 10,
    fontWeight: '700',
  },
  detectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 8,
  },
  detectedLabel: {
    color: '#888',
    fontSize: 12,
    width: 60,
  },
  detectedValue: {
    color: '#ddd',
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  submitButtonContainer: {
    marginTop: 22,
    borderRadius: 12,
    overflow: 'hidden',
  },
  submitGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 10,
  },
  submitText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  savedSection: {
    width: '100%',
    maxWidth: 480,
    marginTop: 28,
  },
  savedTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  savedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#14141a',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#242430',
  },
  savedInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  savedTextWrapper: {
    flex: 1,
  },
  savedName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  savedUser: {
    color: '#888',
    fontSize: 12,
    marginTop: 2,
  },
  removeBtn: {
    padding: 8,
  },
});
