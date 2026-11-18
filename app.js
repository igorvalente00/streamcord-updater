// StreamCord v8.2.0 — Arquitetura Zero-Copy DXGI GPU + Anti-Black-Screen + AudioWorklet WASAPI
(() => {
  const APP_VERSION = '8.2.0';

  const RTC_CONFIG = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' },
      {
        urls: [
          'turn:openrelay.metered.ca:80',
          'turn:openrelay.metered.ca:443',
          'turn:openrelay.metered.ca:443?transport=tcp',
        ],
        username: 'openrelayproject',
        credential: 'openrelayproject',
      },
    ],
    bundlePolicy: 'max-bundle',
    iceCandidatePoolSize: 4,
  };

  const DEFAULT_CHANNELS = [
    { id: 'gameplay-2k', name: '🎮 Gameplay 2K 60FPS', bitrate: '25 Mbps' },
    { id: 'cinema-watch', name: '🎬 Sessão Cinema & Séries', bitrate: '20 Mbps' },
    { id: 'dev-code', name: '💻 Código & Nitidez Ultra', bitrate: '15 Mbps' },
    { id: 'lounge-geral', name: '🛋️ Resenha dos Amigos', bitrate: '12 Mbps' },
  ];

  const THEME_MODELS = [
    {
      id: 'nitro-ultra',
      name: '1. Discord Nitro Ultra',
      desc: 'Evolução da interface clássica Discord com glassmorphism, destaques Blurple/Nitro e 3 colunas.',
      tag: 'Layout 3 Colunas • Discord Pro',
      layout: 'standard',
      colors: ['#5865f2', '#ff73fa', '#181a22'],
    },
    {
      id: 'cinema-theater',
      name: '2. Cinema Theater Mode',
      desc: 'Modo imersivo sem barras laterais fixas, efeito Ambilight e foco de 95% na transmissão 2K.',
      tag: 'Imersivo • Ambilight',
      layout: 'immersive',
      colors: ['#e50914', '#f59e0b', '#050507'],
    },
    {
      id: 'broadcast-studio',
      name: '3. Pro Broadcast Studio',
      desc: 'Painel técnico estilo OBS com medidor VU Meter WASAPI (Discord Mudo) e status do pipeline GPU.',
      tag: 'Estúdio OBS • VU Meter',
      layout: 'studio',
      colors: ['#10b981', '#3b82f6', '#101214'],
    },
    {
      id: 'cyberpunk-hud',
      name: '4. Cyberpunk / ROG Cockpit',
      desc: 'HUD tático gamer com cantos angulares, fonte monoespaçada e barra de telemetria WASAPI.',
      tag: 'Gamer HUD • 60FPS',
      layout: 'studio',
      colors: ['#00e599', '#00d2ff', '#05080b'],
    },
    {
      id: 'minimal-floating',
      name: '5. Minimalist Floating OS',
      desc: 'Inspirado no Arc e macOS: sem barra lateral pesada, com navegação por pílulas no topo.',
      tag: 'Ultra Clean • Floating',
      layout: 'immersive',
      colors: ['#8b5cf6', '#ec4899', '#111217'],
    },
    {
      id: 'esports-arena',
      name: '6. Esports Arena Squad',
      desc: 'Visual competitivo em laranja/ouro pensado para esquadrões jogando juntos na mesma sala.',
      tag: 'Squad Arena • Multi-Stream',
      layout: 'standard',
      colors: ['#f97316', '#eab308', '#0b0e17'],
    },
    {
      id: 'watch-party',
      name: '7. Cozy Watch Party Lounge',
      desc: 'Ambiente acolhedor roxo meia-noite e rosa para assistir filmes e séries com os amigos.',
      tag: 'Sessão Pipoca • Cinema',
      layout: 'standard',
      colors: ['#c084fc', '#fb7185', '#130e19'],
    },
    {
      id: 'dev-ultra-2k',
      name: '8. Dev Pair-Programming 2K',
      desc: 'Alta densidade estilo Linear/VS Code com sidebar compacta e nitidez máxima para leitura de código.',
      tag: 'Nitidez 2K • Dev IDE',
      layout: 'standard',
      colors: ['#38bdf8', '#818cf8', '#090d13'],
    },
    {
      id: 'modular-gamebar',
      name: '9. Modular Game Bar Overlay',
      desc: 'Painéis modulares flutuantes estilo Xbox Game Bar, ideal para deixar aberto no 2º monitor.',
      tag: 'Modular • Compact HUD',
      layout: 'studio',
      colors: ['#22c55e', '#06b6d4', '#070a0e'],
    },
    {
      id: 'console-deck',
      name: '10. Console Deck Big Picture',
      desc: 'Navegação horizontal ampla estilo Steam Deck / Console para usar na TV ou tela cheia.',
      tag: 'Console UI • TV / Deck',
      layout: 'immersive',
      colors: ['#1a9fff', '#66c0f4', '#0d131a'],
    },
  ];

  const RESOLUTION_MAP = {
    '720': { width: 1280, height: 720, heightNum: 720, label: '720p' },
    '1080': { width: 1920, height: 1080, heightNum: 1080, label: '1080p' },
    '1440': { width: 2560, height: 1440, heightNum: 1440, label: '1440p 2K' },
    'source': { width: 2560, height: 1440, heightNum: 0, label: 'Fonte Nativa' },
  };

  const COLORS = ['#5865F2', '#57F287', '#FEE75C', '#EB459E', '#ED4245', '#9B59B6', '#E67E22', '#1ABC9C'];

  // Lê parâmetro ?room= da URL (para acesso automático via QR Code no celular!)
  const urlParams = new URLSearchParams(window.location.search);
  const roomFromUrl = urlParams.get('room');
  if (roomFromUrl && roomFromUrl.trim()) {
    localStorage.setItem('streamcord_room', roomFromUrl.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, ''));
  }

  const isMobileDevice = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.innerWidth <= 900;

  const savedClientId = localStorage.getItem('streamcord_client_id') || 'u_' + Math.random().toString(36).substring(2, 9);
  localStorage.setItem('streamcord_client_id', savedClientId);

  const savedUsername =
    localStorage.getItem('streamcord_username') ||
    (isMobileDevice ? 'Mobile#' : 'Amigo#') + Math.floor(1000 + Math.random() * 9000);
  localStorage.setItem('streamcord_username', savedUsername);

  const state = {
    clientId: savedClientId,
    username: savedUsername,
    avatarColor: localStorage.getItem('streamcord_color') || COLORS[Math.floor(Math.random() * COLORS.length)],
    roomCode: (localStorage.getItem('streamcord_room') || 'IGOR-2K60').toUpperCase().trim(),
    activeTheme: localStorage.getItem('streamcord_theme') || 'nitro-ultra',
    sfxEnabled: localStorage.getItem('streamcord_sfx') !== '0',

    currentChannelId: 'gameplay-2k',
    channels: DEFAULT_CHANNELS,
    onlineUsers: new Map(),

    cloudMqtt: null,
    cloudConnected: false,

    // Captura Híbrida (C# Nativo Desktop + Web/Mobile)
    hasNativeBackend: true,
    nativeSources: [],
    selectedSourceId: 'monitor:0',
    sourceTab: 'monitor', // 'monitor' | 'window' | 'browser'
    localCaptureWs: null,
    localAudioWs: null,
    audioCtx: null,
    audioDestNode: null,
    nextAudioTime: 0,

    captureCanvas: document.createElement('canvas'),
    captureCtx: null,
    nextFrameBlob: null,
    decodingFrame: false,
    localScreenStream: null,
    isStreaming: false,
    showSelfPreview: false,

    streamSettings: {
      preset: localStorage.getItem('streamcord_preset') || 'motion',
      resolution: localStorage.getItem('streamcord_res') || '1080',
      fps: Number(localStorage.getItem('streamcord_fps')) || 60,
      bitrateKbps: Number(localStorage.getItem('streamcord_bitrate')) || 12000,
      audioMode: 'pc_no_discord',
    },

    // Conexões WebRTC Dedicadas
    screenOutPcs: new Map(),
    screenInEntry: null,
    earlyIceBySession: new Map(),
    webrtcVideoActive: false,
    watchRetryTimer: null,
    activeFallbackViewers: new Set(),
    fallbackSenderTimer: null,

    spotlightPeerId: null,
    zoomLevel: 1,
    unreadChatCount: 0,
    mobileActiveTab: 'stage',

    framesCapturedCount: 0,
    bytesTransferredThisSec: 0,
    lastStatsTime: performance.now(),
    prevWebrtcBytes: 0,
    prevWebrtcFrames: 0,

    updateAvailable: false,
    latestVersion: APP_VERSION,
  };

  state.captureCanvas.width = 1920;
  state.captureCanvas.height = 1080;
  state.captureCtx = state.captureCanvas.getContext('2d', { alpha: false, desynchronized: true });
  localStorage.setItem('streamcord_color', state.avatarColor);

  // =========================================================================
  // 0. EFEITOS SONOROS SINTETIZADOS (ESTILO DISCORD - ZERO ARQUIVOS EXTERNOS)
  // =========================================================================
  let sfxCtx = null;
  function playDiscordSound(type) {
    if (!state.sfxEnabled) return;
    try {
      if (!sfxCtx) {
        sfxCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (sfxCtx.state === 'suspended') sfxCtx.resume();
      const now = sfxCtx.currentTime;

      const playTone = (freq, start, dur, vol = 0.06, wave = 'sine') => {
        const osc = sfxCtx.createOscillator();
        const gain = sfxCtx.createGain();
        osc.type = wave;
        osc.frequency.setValueAtTime(freq, now + start);
        gain.gain.setValueAtTime(vol, now + start);
        gain.gain.exponentialRampToValueAtTime(0.001, now + start + dur);
        osc.connect(gain);
        gain.connect(sfxCtx.destination);
        osc.start(now + start);
        osc.stop(now + start + dur);
      };

      if (type === 'join') {
        playTone(440, 0, 0.09, 0.05);
        playTone(587.33, 0.07, 0.14, 0.06);
      } else if (type === 'stream-start') {
        playTone(523.25, 0, 0.08, 0.06, 'triangle');
        playTone(659.25, 0.07, 0.08, 0.06, 'triangle');
        playTone(783.99, 0.14, 0.18, 0.07, 'triangle');
      } else if (type === 'stream-stop') {
        playTone(659.25, 0, 0.08, 0.05);
        playTone(440, 0.08, 0.15, 0.05);
      } else if (type === 'message') {
        playTone(740, 0, 0.06, 0.04);
        playTone(880, 0.05, 0.08, 0.04);
      } else if (type === 'click') {
        playTone(600, 0, 0.04, 0.03);
      }
    } catch (e) {}
  }

  function showToast(message, icon = '✨') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'discord-toast';
    toast.innerHTML = `<span>${icon}</span><span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.25s';
      setTimeout(() => toast.remove(), 260);
    }, 3200);
  }

  // =========================================================================
  // 1. CLIENTE MQTT SOBRE WEBSOCKET UNIFICADO
  // =========================================================================
  const BROKER_URL = 'wss://broker.emqx.io:8084/mqtt';

  class MiniMqttOverWs {
    constructor(url, clientId, onConnect, onMessage, onDisconnect) {
      this.url = url;
      this.clientId = clientId;
      this.onConnect = onConnect;
      this.onMessage = onMessage;
      this.onDisconnect = onDisconnect;
      this.ws = null;
      this.rxBuffer = new Uint8Array(0);
      this.pingTimer = null;
      this.packetId = 1;
      this.msgQueue = Promise.resolve();
      this._connect();
    }

    _connect() {
      try {
        this.ws = new WebSocket(this.url, 'mqtt');
        this.ws.binaryType = 'arraybuffer';
      } catch (e) {
        this.onDisconnect();
        return;
      }

      this.ws.onopen = () => {
        this.ws.send(this._buildConnectPacket(this.clientId));
      };

      this.ws.onmessage = (ev) => {
        const chunk = new Uint8Array(ev.data);
        const merged = new Uint8Array(this.rxBuffer.length + chunk.length);
        merged.set(this.rxBuffer, 0);
        merged.set(chunk, this.rxBuffer.length);
        this.rxBuffer = merged;
        this._parsePackets();
      };

      this.ws.onerror = () => {};
      this.ws.onclose = () => {
        if (this.pingTimer) clearInterval(this.pingTimer);
        this.onDisconnect();
      };
    }

    _encodeLength(len) {
      const out = [];
      do {
        let digit = len % 128;
        len = Math.floor(len / 128);
        if (len > 0) digit |= 0x80;
        out.push(digit);
      } while (len > 0);
      return out;
    }

    _encodeString(str) {
      const bytes = new TextEncoder().encode(str);
      const out = new Uint8Array(2 + bytes.length);
      out[0] = (bytes.length >> 8) & 0xff;
      out[1] = bytes.length & 0xff;
      out.set(bytes, 2);
      return out;
    }

    _buildConnectPacket(clientId) {
      const protoName = this._encodeString('MQTT');
      const clientBytes = this._encodeString(clientId);
      const varHeader = new Uint8Array([...protoName, 0x04, 0x02, 0x00, 0x3c]);
      const remLen = varHeader.length + clientBytes.length;
      const lenBytes = this._encodeLength(remLen);
      const pkt = new Uint8Array(1 + lenBytes.length + remLen);
      pkt[0] = 0x10;
      pkt.set(lenBytes, 1);
      pkt.set(varHeader, 1 + lenBytes.length);
      pkt.set(clientBytes, 1 + lenBytes.length + varHeader.length);
      return pkt;
    }

    subscribe(topic) {
      if (!this.ws || this.ws.readyState !== 1) return;
      const pid = this.packetId++ & 0xffff || 1;
      const topicBytes = this._encodeString(topic);
      const remLen = 2 + topicBytes.length + 1;
      const lenBytes = this._encodeLength(remLen);
      const pkt = new Uint8Array(1 + lenBytes.length + remLen);
      let idx = 0;
      pkt[idx++] = 0x82;
      pkt.set(lenBytes, idx);
      idx += lenBytes.length;
      pkt[idx++] = (pid >> 8) & 0xff;
      pkt[idx++] = pid & 0xff;
      pkt.set(topicBytes, idx);
      idx += topicBytes.length;
      pkt[idx] = 0x00;
      this.ws.send(pkt);
    }

    publish(topic, jsonObj) {
      if (!this.ws || this.ws.readyState !== 1) return;
      const topicBytes = this._encodeString(topic);
      const payloadBytes = new TextEncoder().encode(JSON.stringify(jsonObj));
      const remLen = topicBytes.length + payloadBytes.length;
      const lenBytes = this._encodeLength(remLen);
      const pkt = new Uint8Array(1 + lenBytes.length + remLen);
      let idx = 0;
      pkt[idx++] = 0x30;
      pkt.set(lenBytes, idx);
      idx += lenBytes.length;
      pkt.set(topicBytes, idx);
      idx += topicBytes.length;
      pkt.set(payloadBytes, idx);
      this.ws.send(pkt);
    }

    _parsePackets() {
      while (this.rxBuffer.length >= 2) {
        const firstByte = this.rxBuffer[0];
        const type = firstByte >> 4;
        const qos = (firstByte >> 1) & 0x03;
        let multiplier = 1;
        let value = 0;
        let idx = 1;
        let encodedByte;

        do {
          if (idx >= this.rxBuffer.length) return;
          encodedByte = this.rxBuffer[idx++];
          value += (encodedByte & 127) * multiplier;
          multiplier *= 128;
        } while ((encodedByte & 128) !== 0);

        const totalPacketLen = idx + value;
        if (this.rxBuffer.length < totalPacketLen) return;

        const packetBody = this.rxBuffer.subarray(idx, totalPacketLen);
        this.rxBuffer = this.rxBuffer.subarray(totalPacketLen);

        if (type === 2) {
          this.pingTimer = setInterval(() => {
            if (this.ws && this.ws.readyState === 1) {
              this.ws.send(new Uint8Array([0xc0, 0x00]));
            }
          }, 20000);
          this.onConnect();
        } else if (type === 3) {
          const topicLen = (packetBody[0] << 8) | packetBody[1];
          const topic = new TextDecoder().decode(packetBody.subarray(2, 2 + topicLen));
          const payloadStart = 2 + topicLen + (qos > 0 ? 2 : 0);
          const payloadStr = new TextDecoder().decode(packetBody.subarray(payloadStart));
          try {
            const parsed = JSON.parse(payloadStr);
            this.msgQueue = this.msgQueue
              .then(() => this.onMessage(topic, parsed))
              .catch(() => {});
          } catch (e) {}
        }
      }
    }

    close() {
      if (this.pingTimer) clearInterval(this.pingTimer);
      if (this.ws) {
        this.ws.onclose = null;
        try { this.ws.close(); } catch (e) {}
      }
    }
  }

  // Elementos da UI
  const els = {
    channelsContainer: document.getElementById('channels-container'),
    headerChannelPills: document.getElementById('header-channel-pills'),
    voiceCurrentChannelName: document.getElementById('voice-current-channel-name'),
    localAvatar: document.getElementById('local-avatar'),
    localUsername: document.getElementById('local-username'),
    localQualityTag: document.getElementById('local-quality-tag'),
    cloudStatusPill: document.getElementById('cloud-status-pill'),
    sidebarRoomCode: document.getElementById('sidebar-room-code'),
    headerRoomLabel: document.getElementById('header-room-label'),

    stageTitle: document.getElementById('stage-title'),
    activePresetPill: document.getElementById('active-preset-pill'),
    activeStage: document.getElementById('active-stage'),
    spotlightWrapper: document.getElementById('spotlight-wrapper'),
    spotlightViewport: document.getElementById('spotlight-viewport'),
    videoZoomContainer: document.getElementById('video-zoom-container'),
    spotlightVideo: document.getElementById('spotlight-video'),
    spotlightCanvas: document.getElementById('spotlight-canvas'),
    floatingReactionsLayer: document.getElementById('floating-reactions-layer'),
    btnMobileUnmute: document.getElementById('btn-mobile-unmute'),
    selfPreviewSaver: document.getElementById('self-preview-saver'),
    btnToggleSelfPreview: document.getElementById('btn-toggle-self-preview'),
    btnHideSelfPreview: document.getElementById('btn-hide-self-preview'),
    spotlightStreamerName: document.getElementById('spotlight-streamer-name'),
    spotlightAudioBadge: document.getElementById('spotlight-audio-badge'),
    spotlightResBadge: document.getElementById('spotlight-res-badge'),
    spotlightFpsBadge: document.getElementById('spotlight-fps-badge'),
    spotlightBitrateBadge: document.getElementById('spotlight-bitrate-badge'),
    spotlightVolume: document.getElementById('spotlight-volume'),
    spotlightVolumeLabel: document.getElementById('spotlight-volume-label'),
    btnMuteToggle: document.getElementById('btn-mute-toggle'),
    btnZoomCycle: document.getElementById('btn-zoom-cycle'),
    btnPipMode: document.getElementById('btn-pip-mode'),
    participantsGrid: document.getElementById('participants-grid'),

    btnShareScreen: document.getElementById('btn-share-screen'),
    shareBtnText: document.getElementById('share-btn-text'),
    btnStreamSettings: document.getElementById('btn-stream-settings'),
    dockBtnShare: document.getElementById('dock-btn-share'),
    dockShareLabel: document.getElementById('dock-share-label'),
    dockBtnQuality: document.getElementById('dock-btn-quality'),
    dockBtnThemes: document.getElementById('dock-btn-themes'),
    dockBtnLeave: document.getElementById('dock-btn-leave'),

    btnHeaderUpdate: document.getElementById('btn-header-update'),
    updateBtnLabel: document.getElementById('update-btn-label'),
    btnRailUpdate: document.getElementById('btn-rail-update'),

    rtcTelemetryHud: document.getElementById('rtc-telemetry-hud'),
    btnToggleStats: document.getElementById('btn-toggle-stats'),
    btnHeaderStats: document.getElementById('btn-header-stats'),
    btnHeaderInvite: document.getElementById('btn-header-invite'),
    btnCloseHud: document.getElementById('btn-close-hud'),
    statResolution: document.getElementById('stat-resolution'),
    statFps: document.getElementById('stat-fps'),
    statBitrate: document.getElementById('stat-bitrate'),
    statCodec: document.getElementById('stat-codec'),

    chatDrawer: document.getElementById('chat-drawer'),
    btnToggleChat: document.getElementById('btn-toggle-chat'),
    btnCloseChat: document.getElementById('btn-close-chat'),
    chatMessages: document.getElementById('chat-messages'),
    chatForm: document.getElementById('chat-form'),
    chatInput: document.getElementById('chat-input'),
    headerChatBadge: document.getElementById('header-chat-badge'),
    mobChatBadge: document.getElementById('mob-chat-badge'),

    streamModal: document.getElementById('stream-modal'),
    tabMonitors: document.getElementById('tab-monitors'),
    tabWindows: document.getElementById('tab-windows'),
    tabBrowserCam: document.getElementById('tab-browser-cam'),
    btnRefreshSources: document.getElementById('btn-refresh-sources'),
    sourcesGrid: document.getElementById('sources-grid'),
    audioModeSelect: document.getElementById('audio-mode-select'),
    btnCloseStreamModal: document.getElementById('btn-close-stream-modal'),
    btnCancelStream: document.getElementById('btn-cancel-stream'),
    btnConfirmGoLive: document.getElementById('btn-confirm-go-live'),
    bitrateSlider: document.getElementById('bitrate-slider'),
    bitrateValueLabel: document.getElementById('bitrate-value-label'),

    themeModal: document.getElementById('theme-modal'),
    themesGrid: document.getElementById('themes-grid'),
    btnRailThemes: document.getElementById('btn-rail-themes'),
    btnSidebarThemes: document.getElementById('btn-sidebar-themes'),
    btnHeaderThemes: document.getElementById('btn-header-themes'),
    btnCloseThemeModal: document.getElementById('btn-close-theme-modal'),
    btnDoneThemeModal: document.getElementById('btn-done-theme-modal'),
    sidebarThemeName: document.getElementById('sidebar-theme-name'),
    headerThemeLabel: document.getElementById('header-theme-label'),

    mobileModal: document.getElementById('mobile-modal'),
    btnRailMobile: document.getElementById('btn-rail-mobile'),
    btnHeaderMobile: document.getElementById('btn-header-mobile'),
    btnCloseMobileModal: document.getElementById('btn-close-mobile-modal'),
    mobileQrContainer: document.getElementById('mobile-qr-container'),
    mobileLinksList: document.getElementById('mobile-links-list'),
    mobileModalRoom: document.getElementById('mobile-modal-room'),

    cmdModal: document.getElementById('cmd-modal'),
    btnRailCmd: document.getElementById('btn-rail-cmd'),
    btnQuickSwitcher: document.getElementById('btn-quick-switcher'),
    cmdSearchInput: document.getElementById('cmd-search-input'),
    cmdResultsList: document.getElementById('cmd-results-list'),

    inviteModal: document.getElementById('invite-modal'),
    btnInviteModal: document.getElementById('btn-invite-modal'),
    btnEditProfile: document.getElementById('btn-edit-profile'),
    btnRoomBanner: document.getElementById('btn-room-banner'),
    btnQuickCopyCode: document.getElementById('btn-quick-copy-code'),
    btnCloseInviteModal: document.getElementById('btn-close-invite-modal'),
    inputProfileName: document.getElementById('input-profile-name'),
    inputRoomCode: document.getElementById('input-room-code'),
    btnSaveName: document.getElementById('btn-save-name'),
    btnReconnectStream: document.getElementById('btn-reconnect-stream'),

    btnToggleSfx: document.getElementById('btn-toggle-sfx'),
    sfxIconLabel: document.getElementById('sfx-icon-label'),

    mobileBottomNav: document.getElementById('mobile-bottom-nav'),
    mobBtnShare: document.getElementById('mob-btn-share'),
    mobShareLabel: document.getElementById('mob-share-label'),
    mobBtnThemes: document.getElementById('mob-btn-themes'),
    mobLiveDot: document.getElementById('mob-live-dot'),
    btnMobileChannelsDrawer: document.getElementById('btn-mobile-channels-drawer'),
  };

  const spotlightCanvasCtx = els.spotlightCanvas.getContext('2d', { alpha: false });

  // =========================================================================
  // 2. SISTEMA DE 10 MODELOS DE INTERFACE (SELETOR DE TEMAS E LAYOUTS)
  // =========================================================================
  function applyThemeModel(themeId, notify = false) {
    const found = THEME_MODELS.find((t) => t.id === themeId) || THEME_MODELS[0];
    state.activeTheme = found.id;
    localStorage.setItem('streamcord_theme', found.id);

    document.body.setAttribute('data-theme', found.id);
    document.body.setAttribute('data-layout', found.layout);

    if (els.sidebarThemeName) els.sidebarThemeName.textContent = found.name;
    if (els.headerThemeLabel) els.headerThemeLabel.textContent = found.name.replace(/^\d+\.\s*/, '');

    renderThemesGrid();
    if (notify) {
      playDiscordSound('click');
      showToast(`Modelo aplicado: ${found.name}`, '🎨');
    }
  }

  function renderThemesGrid() {
    if (!els.themesGrid) return;
    els.themesGrid.innerHTML = '';
    THEME_MODELS.forEach((t) => {
      const card = document.createElement('div');
      card.className = `theme-card ${state.activeTheme === t.id ? 'active' : ''}`;
      const swatches = t.colors
        .map((c) => `<span class="theme-swatch" style="background:${c}"></span>`)
        .join('');
      card.innerHTML = `
        <div class="theme-card-top">
          <span class="theme-card-tag">${escapeHtml(t.tag)}</span>
          <div class="theme-swatches">${swatches}</div>
        </div>
        <div class="theme-card-title">${escapeHtml(t.name)}</div>
        <div class="theme-card-desc">${escapeHtml(t.desc)}</div>
      `;
      card.onclick = () => applyThemeModel(t.id, true);
      els.themesGrid.appendChild(card);
    });
  }

  function openThemeModal() {
    renderThemesGrid();
    els.themeModal.classList.remove('hidden');
  }

  [els.btnRailThemes, els.btnSidebarThemes, els.btnHeaderThemes, els.dockBtnThemes, els.mobBtnThemes].forEach((b) => {
    if (b) b.onclick = openThemeModal;
  });
  if (els.btnCloseThemeModal) els.btnCloseThemeModal.onclick = () => els.themeModal.classList.add('hidden');
  if (els.btnDoneThemeModal) els.btnDoneThemeModal.onclick = () => els.themeModal.classList.add('hidden');

  // =========================================================================
  // 3. NAVEGAÇÃO MOBILE NATIVA (BOTTOM TAB BAR ESTILO DISCORD MOBILE)
  // =========================================================================
  function setMobileTab(tabName) {
    state.mobileActiveTab = tabName;
    document.body.setAttribute('data-mobile-tab', tabName);
    if (tabName === 'chat') {
      state.unreadChatCount = 0;
      updateUnreadChatBadges();
    }
    if (els.mobileBottomNav) {
      els.mobileBottomNav.querySelectorAll('.mob-nav-item[data-tab]').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
      });
    }
  }

  if (els.mobileBottomNav) {
    els.mobileBottomNav.querySelectorAll('.mob-nav-item[data-tab]').forEach((btn) => {
      btn.onclick = () => {
        playDiscordSound('click');
        setMobileTab(btn.dataset.tab);
      };
    });
  }
  if (els.btnMobileChannelsDrawer) {
    els.btnMobileChannelsDrawer.onclick = () => setMobileTab('channels');
  }
  if (els.mobBtnShare) {
    els.mobBtnShare.onclick = () => handleShareButtonClick();
  }

  function updateUnreadChatBadges() {
    const count = state.unreadChatCount;
    if (els.headerChatBadge) {
      els.headerChatBadge.textContent = String(count);
      els.headerChatBadge.classList.toggle('hidden', count <= 0);
    }
    if (els.mobChatBadge) {
      els.mobChatBadge.textContent = String(count);
      els.mobChatBadge.classList.toggle('hidden', count <= 0);
    }
  }

  // =========================================================================
  // 4. AUTO-UPDATER ESTILO DISCORD
  // =========================================================================
  async function checkAppUpdate(manualClick = false) {
    try {
      const res = await fetch('/api/update-status?t=' + Date.now());
      const data = await res.json();
      if (data && data.updateAvailable) {
        state.updateAvailable = true;
        state.latestVersion = data.latestVersion;
        els.btnHeaderUpdate.classList.add('update-ready');
        els.updateBtnLabel.textContent = `⬇️ Atualizar v${data.latestVersion}`;
        if (manualClick) {
          await triggerInPlaceUpdate();
        }
      } else if (manualClick) {
        showToast(`StreamCord já está na versão mais recente (v${APP_VERSION})!`, '✅');
      }
    } catch (e) {
      if (manualClick) {
        showToast(`Versão Web/Mobile v${APP_VERSION} ativa!`, '✅');
      }
    }
  }

  async function triggerInPlaceUpdate() {
    els.updateBtnLabel.textContent = '⏳ Atualizando...';
    els.btnHeaderUpdate.disabled = true;
    try {
      const res = await fetch('/api/apply-update', { method: 'POST' });
      const data = await res.json();
      if (data && data.ok) {
        els.updateBtnLabel.textContent = '🚀 Reiniciando...';
      } else {
        els.updateBtnLabel.textContent = '❌ Erro ao atualizar';
        els.btnHeaderUpdate.disabled = false;
      }
    } catch (e) {
      els.updateBtnLabel.textContent = '🚀 Reiniciando...';
    }
  }

  els.btnHeaderUpdate.onclick = () => {
    if (state.updateAvailable) triggerInPlaceUpdate();
    else checkAppUpdate(true);
  };
  if (els.btnRailUpdate) els.btnRailUpdate.onclick = () => els.btnHeaderUpdate.click();

  setTimeout(() => checkAppUpdate(false), 1500);
  setInterval(() => checkAppUpdate(false), 45000);

  // =========================================================================
  // 5. SINALIZAÇÃO GLOBAL NA NUVEM (SEM VPN - DESKTOP & MOBILE)
  // =========================================================================
  function getTopicBroadcast() {
    return `streamcord/v11/${state.roomCode}/broadcast`;
  }
  function getTopicDirect(targetId) {
    return `streamcord/v11/${state.roomCode}/direct/${targetId}`;
  }

  function getMyStateObject() {
    return {
      id: state.clientId,
      username: state.username,
      avatarColor: state.avatarColor,
      channelId: state.currentChannelId,
      streaming: state.isStreaming,
      streamConfig: state.isStreaming
        ? {
            resolution: RESOLUTION_MAP[state.streamSettings.resolution]?.label || '1080p',
            fps: state.streamSettings.fps,
            hasAudio: state.streamSettings.audioMode !== 'none',
          }
        : null,
      lastSeen: Date.now(),
    };
  }

  function connectCloudSignaling() {
    if (state.cloudMqtt) {
      state.cloudMqtt.close();
      state.cloudMqtt = null;
    }

    els.cloudStatusPill.textContent = '☁️ CONECTANDO...';
    els.cloudStatusPill.classList.add('connecting');

    const mqttId = 'sc11_' + state.clientId + '_' + Math.random().toString(36).slice(2, 6);
    state.cloudMqtt = new MiniMqttOverWs(
      BROKER_URL,
      mqttId,
      () => {
        state.cloudConnected = true;
        els.cloudStatusPill.textContent = '☁️ ONLINE';
        els.cloudStatusPill.classList.remove('connecting');

        state.cloudMqtt.subscribe(getTopicBroadcast());
        state.cloudMqtt.subscribe(getTopicDirect(state.clientId));

        announcePresence(true);
      },
      async (topic, msg) => {
        if (!msg || msg.senderId === state.clientId) return;
        await handleCloudMessage(msg);
      },
      () => {
        state.cloudConnected = false;
        els.cloudStatusPill.textContent = '☁️ RECONECTANDO';
        els.cloudStatusPill.classList.add('connecting');
        setTimeout(connectCloudSignaling, 1500);
      }
    );
  }

  function publishBroadcast(payload) {
    if (state.cloudMqtt && state.cloudConnected) {
      state.cloudMqtt.publish(getTopicBroadcast(), { ...payload, senderId: state.clientId });
    }
  }

  function publishDirect(targetId, payload) {
    if (state.cloudMqtt && state.cloudConnected) {
      state.cloudMqtt.publish(getTopicDirect(targetId), { ...payload, senderId: state.clientId });
    }
  }

  function closeScreenOutPc(viewerId) {
    const entry = state.screenOutPcs.get(viewerId);
    if (entry) {
      try { entry.pc.close(); } catch (e) {}
      state.screenOutPcs.delete(viewerId);
    }
    state.activeFallbackViewers.delete(viewerId);
  }

  function announcePresence(requestReplies = false) {
    state.onlineUsers.set(state.clientId, getMyStateObject());
    publishBroadcast({
      type: 'presence',
      user: getMyStateObject(),
      requestReplies,
    });
    renderChannelsSidebar();
    renderStageParticipants();
  }

  window.addEventListener('beforeunload', () => {
    publishBroadcast({ type: 'user-left', userId: state.clientId });
  });
  window.addEventListener('pagehide', () => {
    publishBroadcast({ type: 'user-left', userId: state.clientId });
  });

  setInterval(() => {
    announcePresence(false);
    const now = Date.now();
    for (const [uid, u] of state.onlineUsers.entries()) {
      if (uid !== state.clientId && now - (u.lastSeen || 0) > 10500) {
        state.onlineUsers.delete(uid);
        closeScreenOutPc(uid);
        if (state.spotlightPeerId === uid) closeSpotlight();
      }
    }
    renderChannelsSidebar();
    renderStageParticipants();
  }, 3500);

  async function handleCloudMessage(msg) {
    switch (msg.type) {
      case 'user-left': {
        const uid = msg.userId || msg.senderId;
        if (uid && uid !== state.clientId) {
          state.onlineUsers.delete(uid);
          closeScreenOutPc(uid);
          if (state.spotlightPeerId === uid) closeSpotlight();
          renderChannelsSidebar();
          renderStageParticipants();
        }
        break;
      }

      case 'presence': {
        const u = msg.user;
        if (!u || !u.id) return;
        const prevUser = state.onlineUsers.get(u.id);
        const wasStreaming = Boolean(prevUser?.streaming);
        u.lastSeen = Date.now();
        state.onlineUsers.set(u.id, u);

        // Se o amigo mudou de canal, fecha eventual encoder antigo dele
        if (state.isStreaming && u.channelId !== state.currentChannelId) {
          closeScreenOutPc(u.id);
        }

        if (msg.requestReplies) {
          publishDirect(u.id, {
            type: 'presence',
            user: getMyStateObject(),
            requestReplies: false,
          });
          if (state.isStreaming && u.channelId === state.currentChannelId) {
            await startScreenOutPcForViewer(u.id, false);
          }
        }

        if (
          state.currentChannelId &&
          u.channelId === state.currentChannelId &&
          u.streaming &&
          !state.isStreaming &&
          (!state.spotlightPeerId || !wasStreaming)
        ) {
          if (!wasStreaming) {
            playDiscordSound('stream-start');
            showToast(`${u.username} iniciou uma transmissão ao vivo!`, '🔴');
          }
          watchFriendStream(u.id, false);
        } else if (state.spotlightPeerId === u.id && (!u.streaming || u.channelId !== state.currentChannelId)) {
          closeSpotlight();
        }

        renderChannelsSidebar();
        renderStageParticipants();
        break;
      }

      case 'watch-request': {
        if (state.isStreaming && state.localScreenStream) {
          await startScreenOutPcForViewer(msg.senderId, Boolean(msg.force));
        }
        break;
      }

      case 'screen-offer': {
        if (
          !state.isStreaming &&
          (!state.spotlightPeerId || state.spotlightPeerId === state.clientId || state.spotlightPeerId === msg.senderId)
        ) {
          openSpotlight(msg.senderId);
          await handleIncomingScreenOffer(msg.senderId, msg.sdp, msg.sessionId);
        }
        break;
      }

      case 'screen-answer': {
        const outEntry = state.screenOutPcs.get(msg.senderId);
        if (
          outEntry &&
          (!msg.sessionId || outEntry.sessionId === msg.sessionId) &&
          outEntry.pc.signalingState !== 'stable'
        ) {
          try {
            await outEntry.pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
            outEntry.remoteDescSet = true;
            for (const c of outEntry.pendingCandidates) {
              try { await outEntry.pc.addIceCandidate(new RTCIceCandidate(c)); } catch (e) {}
            }
            outEntry.pendingCandidates = [];
          } catch (e) {}
        }
        break;
      }

      case 'screen-ice': {
        if (msg.role === 'from-streamer' && msg.candidate) {
          if (
            state.screenInEntry &&
            state.screenInEntry.streamerId === msg.senderId &&
            (!msg.sessionId || state.screenInEntry.sessionId === msg.sessionId)
          ) {
            if (state.screenInEntry.remoteDescSet) {
              try {
                await state.screenInEntry.pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
              } catch (e) {}
            } else {
              state.screenInEntry.pendingCandidates.push(msg.candidate);
            }
          } else if (msg.sessionId) {
            if (!state.earlyIceBySession.has(msg.sessionId)) {
              state.earlyIceBySession.set(msg.sessionId, []);
            }
            state.earlyIceBySession.get(msg.sessionId).push(msg.candidate);
          }
        } else if (msg.role === 'from-viewer' && msg.candidate) {
          const outEntry = state.screenOutPcs.get(msg.senderId);
          if (outEntry && (!msg.sessionId || outEntry.sessionId === msg.sessionId)) {
            if (outEntry.remoteDescSet) {
              try {
                await outEntry.pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
              } catch (e) {}
            } else {
              outEntry.pendingCandidates.push(msg.candidate);
            }
          }
        }
        break;
      }

      case 'stop-watching': {
        closeScreenOutPc(msg.senderId);
        break;
      }

      case 'stage-reaction': {
        if (msg.channelId === state.currentChannelId && msg.emoji) {
          spawnFloatingEmoji(msg.emoji);
        }
        break;
      }

      case 'chat-message': {
        if (msg.channelId === state.currentChannelId && msg.message) {
          appendChatMessage(msg.message);
          playDiscordSound('message');
          if (els.chatDrawer.classList.contains('hidden') || (window.innerWidth <= 900 && state.mobileActiveTab !== 'chat')) {
            state.unreadChatCount++;
            updateUnreadChatBadges();
          }
        }
        break;
      }
    }
  }

  // =========================================================================
  // 6. SELETOR HÍBRIDO DE FONTES (C# DESKTOP NATIVO + MOBILE / NAVEGADOR WEB)
  // =========================================================================
  async function loadNativeSources() {
    els.sourcesGrid.innerHTML = `<div class="sources-loading">Carregando monitores, janelas e opções mobile...</div>`;
    try {
      const res = await fetch('/api/sources?t=' + Date.now());
      if (!res.ok) throw new Error('Sem backend C# local');
      const data = await res.json();
      state.nativeSources = data.sources || [];
      state.hasNativeBackend = state.nativeSources.length > 0;
    } catch (e) {
      state.hasNativeBackend = false;
      state.nativeSources = [];
    }

    if (!state.hasNativeBackend) {
      state.sourceTab = 'browser';
      els.tabMonitors.classList.remove('active');
      els.tabWindows.classList.remove('active');
      if (els.tabBrowserCam) els.tabBrowserCam.classList.add('active');
    }
    renderSourcesGrid();
  }

  function renderSourcesGrid() {
    els.sourcesGrid.innerHTML = '';

    if (state.sourceTab === 'browser' || !state.hasNativeBackend) {
      const webOptions = [
        {
          id: 'web:display',
          title: '🖥️ Compartilhar Tela / Aba do Navegador (WebRTC Nativo)',
          desc: 'Captura direta via navegador com áudio.',
        },
        {
          id: 'web:camera-env',
          title: '📷 Câmera Traseira do Celular (Mobile Stream)',
          desc: 'Ideal para transmitir do Android ou iPhone na sala.',
        },
        {
          id: 'web:camera-user',
          title: '🤳 Câmera Frontal + Áudio (Mobile / Webcam)',
          desc: 'Transmissão rápida via câmera frontal.',
        },
      ];

      if (!state.selectedSourceId.startsWith('web:')) {
        state.selectedSourceId = isMobileDevice ? 'web:camera-env' : 'web:display';
      }

      webOptions.forEach((opt) => {
        const card = document.createElement('div');
        card.className = `source-card ${state.selectedSourceId === opt.id ? 'selected' : ''}`;
        card.innerHTML = `
          <div class="source-thumb" style="display:flex;align-items:center;justify-content:center;padding:12px;text-align:center;font-size:12px;color:#b5bac1;">
            ${escapeHtml(opt.desc)}
          </div>
          <div class="source-card-title">${escapeHtml(opt.title)}</div>
        `;
        card.onclick = () => {
          state.selectedSourceId = opt.id;
          renderSourcesGrid();
        };
        card.ondblclick = () => {
          state.selectedSourceId = opt.id;
          startNativeScreenShare();
        };
        els.sourcesGrid.appendChild(card);
      });
      return;
    }

    const filtered = state.nativeSources.filter((s) => s.type === state.sourceTab);
    if (filtered.length === 0) {
      els.sourcesGrid.innerHTML = `<div class="sources-loading">Nenhuma fonte encontrada nesta aba.</div>`;
      return;
    }

    if (!state.nativeSources.some((s) => s.id === state.selectedSourceId)) {
      state.selectedSourceId = filtered[0].id;
    }

    filtered.forEach((src) => {
      const card = document.createElement('div');
      card.className = `source-card ${state.selectedSourceId === src.id ? 'selected' : ''}`;
      card.innerHTML = `
        <img class="source-thumb" src="data:image/jpeg;base64,${src.thumb}" alt="${escapeHtml(src.title)}" />
        <div class="source-card-title" title="${escapeHtml(src.title)}">${escapeHtml(src.title)}</div>
      `;
      card.onclick = () => {
        state.selectedSourceId = src.id;
        renderSourcesGrid();
      };
      card.ondblclick = () => {
        state.selectedSourceId = src.id;
        startNativeScreenShare();
      };
      els.sourcesGrid.appendChild(card);
    });
  }

  // =========================================================================
  // 7. CAPTURA ZERO-COPY DXGI/WGC GPU + AUDIOWORKLET WASAPI (DISCORD MUDO)
  // =========================================================================
  let workletRegistered = false;

  async function startSystemAudioCaptureWithoutDiscord(wsProto) {
    if (state.streamSettings.audioMode === 'none') return null;

    try {
      if (!state.audioCtx) {
        state.audioCtx = new (window.AudioContext || window.webkitAudioContext)({
          sampleRate: 48000,
          latencyHint: 'interactive',
        });
      }
      if (state.audioCtx.state === 'suspended') {
        await state.audioCtx.resume();
      }

      state.audioDestNode = state.audioCtx.createMediaStreamDestination();

      // Usa AudioWorkletNode em Thread C++ Dedicada (Zero Alocação na Main Thread e Zero Vazamento de Grafo!)
      let workletNode = null;
      if (state.audioCtx.audioWorklet) {
        if (!workletRegistered) {
          const workletCode = `
            class ScPcmProcessor extends AudioWorkletProcessor {
              constructor() {
                super();
                this.ringL = new Float32Array(96000);
                this.ringR = new Float32Array(96000);
                this.writePos = 0;
                this.readPos = 0;
                this.available = 0;
                this.port.onmessage = (e) => {
                  const pcm16 = new Int16Array(e.data);
                  const frames = pcm16.length >> 1;
                  const cap = this.ringL.length;
                  for (let i = 0, j = 0; i < frames; i++, j += 2) {
                    this.ringL[this.writePos] = pcm16[j] * 0.000030517578125;
                    this.ringR[this.writePos] = pcm16[j + 1] * 0.000030517578125;
                    this.writePos = (this.writePos + 1) % cap;
                  }
                  this.available = Math.min(cap, this.available + frames);
                };
              }
              process(inputs, outputs) {
                const out = outputs[0];
                if (!out || out.length < 2) return true;
                const outL = out[0];
                const outR = out[1];
                const n = outL.length;
                if (this.available < n) {
                  outL.fill(0);
                  outR.fill(0);
                  return true;
                }
                const cap = this.ringL.length;
                for (let i = 0; i < n; i++) {
                  outL[i] = this.ringL[this.readPos];
                  outR[i] = this.ringR[this.readPos];
                  this.readPos = (this.readPos + 1) % cap;
                }
                this.available -= n;
                return true;
              }
            }
            registerProcessor('sc-pcm-worklet', ScPcmProcessor);
          `;
          const blob = new Blob([workletCode], { type: 'application/javascript' });
          const url = URL.createObjectURL(blob);
          await state.audioCtx.audioWorklet.addModule(url);
          URL.revokeObjectURL(url);
          workletRegistered = true;
        }
        workletNode = new AudioWorkletNode(state.audioCtx, 'sc-pcm-worklet', {
          outputChannelCount: [2],
        });
        workletNode.connect(state.audioDestNode);
        state.activeWorkletNode = workletNode;
      }

      const audioWsUrl = `${wsProto}//${window.location.host}/ws-audio?mode=${encodeURIComponent(
        state.streamSettings.audioMode
      )}&source=${encodeURIComponent(state.selectedSourceId)}`;

      const audioWs = new WebSocket(audioWsUrl);
      audioWs.binaryType = 'arraybuffer';
      state.localAudioWs = audioWs;

      audioWs.onmessage = (ev) => {
        if (!state.isStreaming || !state.audioDestNode) return;
        if (workletNode) {
          // Zero-Copy Transferable ArrayBuffer direto para a thread de áudio C++!
          workletNode.port.postMessage(ev.data, [ev.data]);
        }
      };

      return state.audioDestNode.stream.getAudioTracks()[0] || null;
    } catch (e) {
      return null;
    }
  }

  function requestExtensionZeroCopyStreamId(sourcesType) {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        window.removeEventListener('message', onMsg);
        resolve('');
      }, 900);
      function onMsg(ev) {
        if (ev.data && ev.data.type === 'SC_RES_ZERO_COPY_SOURCE') {
          clearTimeout(timeout);
          window.removeEventListener('message', onMsg);
          resolve(ev.data.streamId || '');
        }
      }
      window.addEventListener('message', onMsg);
      window.postMessage({ type: 'SC_REQ_ZERO_COPY_SOURCE', sources: [sourcesType] }, '*');
    });
  }

  async function acquireZeroCopyGpuStream(cfg, resSpec) {
    // 1. Se selecionou uma Janela/Jogo específico (window:<hwnd>), usa o Tagger C# + Extensão Zero-Copy DXGI!
    if (state.selectedSourceId.startsWith('window:') && state.hasNativeBackend) {
      const hwnd = state.selectedSourceId.slice(7);
      try {
        await fetch('/api/prepare-window-capture?hwnd=' + encodeURIComponent(hwnd) + '&t=' + Date.now());
        const streamId = await requestExtensionZeroCopyStreamId('window');
        if (streamId) {
          const wgcStream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: streamId,
                maxWidth: resSpec.width,
                maxHeight: resSpec.height,
                minFrameRate: cfg.fps,
                maxFrameRate: cfg.fps,
              },
            },
          });
          if (wgcStream && wgcStream.getVideoTracks().length > 0) {
            return wgcStream;
          }
        }
      } catch (e) {}
    }

    // 2. Se selecionou Tela 1 [Principal] (monitor:0) no Desktop, usa Zero-Copy DXGI Direto (getDisplayMedia)
    if (state.selectedSourceId === 'monitor:0' && state.hasNativeBackend && navigator.mediaDevices?.getDisplayMedia) {
      try {
        const dxgiStream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            width: { ideal: resSpec.width, max: resSpec.width },
            height: { ideal: resSpec.height, max: resSpec.height },
            frameRate: { ideal: cfg.fps, max: cfg.fps },
          },
          audio: false,
        });
        if (dxgiStream && dxgiStream.getVideoTracks().length > 0) {
          return dxgiStream;
        }
      } catch (e) {}
    }

    return null;
  }

  async function startBrowserOrMobileCapture(cfg, resSpec) {
    let mediaStream = null;
    const wantAudio = cfg.audioMode !== 'none';

    if (state.selectedSourceId === 'web:display' && navigator.mediaDevices?.getDisplayMedia) {
      mediaStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: resSpec.width, max: resSpec.width },
          height: { ideal: resSpec.height, max: resSpec.height },
          frameRate: { ideal: cfg.fps, max: cfg.fps },
        },
        audio: wantAudio,
      });
    } else if (navigator.mediaDevices?.getUserMedia) {
      const facing = state.selectedSourceId === 'web:camera-user' ? 'user' : 'environment';
      mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facing,
          width: { ideal: resSpec.width },
          height: { ideal: resSpec.height },
          frameRate: { ideal: cfg.fps },
        },
        audio: wantAudio,
      });
    } else if (navigator.mediaDevices?.getDisplayMedia) {
      mediaStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: wantAudio });
    }

    if (!mediaStream) throw new Error('Captura não suportada neste navegador.');

    const vTrack = mediaStream.getVideoTracks()[0];
    if (vTrack) {
      vTrack.onended = () => stopScreenShare(true);
    }

    return mediaStream;
  }

  async function startNativeScreenShare() {
    stopScreenShare(false);

    // Sincroniza estado com os botões ativos no modal para garantir 100% de fidelidade à escolha do usuário
    const activeResBtn = document.querySelector('#resolution-group .seg-btn.active');
    if (activeResBtn && activeResBtn.dataset.res) {
      state.streamSettings.resolution = activeResBtn.dataset.res;
      localStorage.setItem('streamcord_res', state.streamSettings.resolution);
    }
    const activeFpsBtn = document.querySelector('#fps-group .seg-btn.active');
    if (activeFpsBtn && activeFpsBtn.dataset.fps) {
      state.streamSettings.fps = Number(activeFpsBtn.dataset.fps);
      localStorage.setItem('streamcord_fps', String(state.streamSettings.fps));
    }

    const cfg = state.streamSettings;
    const resSpec = RESOLUTION_MAP[cfg.resolution] || RESOLUTION_MAP['1080'];
    const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

    if (state.selectedSourceId.startsWith('web:') || !state.hasNativeBackend) {
      try {
        state.localScreenStream = await startBrowserOrMobileCapture(cfg, resSpec);
      } catch (e) {
        showToast('Permissão de captura cancelada ou indisponível.', '⚠️');
        return;
      }
    } else {
      // Tenta primeiro o Pipeline Zero-Copy DXGI Direto na Placa de Vídeo (Igual ao Discord: < 2% CPU e 60.0 FPS!)
      const zeroCopyStream = await acquireZeroCopyGpuStream(cfg, resSpec);

      if (zeroCopyStream) {
        state.localScreenStream = zeroCopyStream;
        const vTrack = zeroCopyStream.getVideoTracks()[0];
        if (vTrack) {
          vTrack.onended = () => stopScreenShare(true);
        }
      } else {
        // Fallback Win32 StretchBlt caso seja Monitor 2 secundário
        const wsUrl = `${wsProto}//${window.location.host}/ws-capture?source=${encodeURIComponent(
          state.selectedSourceId
        )}&height=${resSpec.heightNum}&fps=${cfg.fps}&detail=${cfg.preset === 'detail' ? 1 : 0}`;

        const capWs = new WebSocket(wsUrl);
        capWs.binaryType = 'blob';
        state.localCaptureWs = capWs;

        capWs.onmessage = async (ev) => {
          if (!state.isStreaming) return;
          state.nextFrameBlob = ev.data;
          state.bytesTransferredThisSec += ev.data.size;
          if (state.decodingFrame) return;

          state.decodingFrame = true;
          try {
            while (state.nextFrameBlob && state.isStreaming) {
              const blob = state.nextFrameBlob;
              state.nextFrameBlob = null;
              const bmp = await createImageBitmap(blob);
              if (state.captureCanvas.width !== bmp.width || state.captureCanvas.height !== bmp.height) {
                state.captureCanvas.width = bmp.width;
                state.captureCanvas.height = bmp.height;
              }
              state.captureCtx.drawImage(bmp, 0, 0);
              bmp.close();
              state.framesCapturedCount++;
            }
          } catch (e) {
          } finally {
            state.decodingFrame = false;
          }
        };

        state.localScreenStream = state.captureCanvas.captureStream(cfg.fps);
      }

      // Anexa Áudio Estéreo 48kHz WASAPI Process Loopback (Com Discord.exe 100% Silenciado!)
      const sysAudioTrack = await startSystemAudioCaptureWithoutDiscord(wsProto);
      if (sysAudioTrack) {
        state.localScreenStream.addTrack(sysAudioTrack);
      }
    }

    state.isStreaming = true;
    state.showSelfPreview = isMobileDevice;
    els.streamModal.classList.add('hidden');

    playDiscordSound('stream-start');
    showToast(`Transmissão GPU ${resSpec.label} @ ${cfg.fps}FPS iniciada!`, '🔴');
    setMobileTab('stage');

    announcePresence(false);
    updateStreamControlsUI();
    openSpotlight(state.clientId);

    const peersInRoom = getUsersInChannel(state.currentChannelId);
    for (const u of peersInRoom) {
      if (u.id !== state.clientId) {
        startScreenOutPcForViewer(u.id, false);
      }
    }
  }

  function stopScreenShare(notify = true) {
    const wasStreaming = state.isStreaming;
    state.isStreaming = false;
    state.nextFrameBlob = null;
    state.activeFallbackViewers.clear();

    if (state.fallbackSenderTimer) {
      clearInterval(state.fallbackSenderTimer);
      state.fallbackSenderTimer = null;
    }
    if (state.localCaptureWs) {
      try { state.localCaptureWs.close(); } catch (e) {}
      state.localCaptureWs = null;
    }
    if (state.localAudioWs) {
      try { state.localAudioWs.close(); } catch (e) {}
      state.localAudioWs = null;
    }
    if (state.activeWorkletNode) {
      try { state.activeWorkletNode.disconnect(); } catch (e) {}
      state.activeWorkletNode = null;
    }
    if (state.localScreenStream) {
      state.localScreenStream.getTracks().forEach((t) => t.stop());
      state.localScreenStream = null;
    }

    for (const entry of state.screenOutPcs.values()) {
      try { entry.pc.close(); } catch (e) {}
    }
    state.screenOutPcs.clear();

    if (state.spotlightPeerId === state.clientId) {
      closeSpotlight();
    }
    if (notify) {
      if (wasStreaming) {
        playDiscordSound('stream-stop');
        showToast('Transmissão encerrada.', '⏹️');
      }
      announcePresence(false);
    }
    updateStreamControlsUI();
  }

  // =========================================================================
  // 8. WEBRTC H.264 / VP8 + ÁUDIO ESTÉREO OPUS
  // =========================================================================
  function preferHardwareH264(pc) {
    try {
      if (!RTCRtpSender.getCapabilities) return;
      const caps = RTCRtpSender.getCapabilities('video');
      if (!caps || !caps.codecs) return;

      const h264 = caps.codecs.filter((c) => c.mimeType.toLowerCase() === 'video/h264');
      const rest = caps.codecs.filter((c) => c.mimeType.toLowerCase() !== 'video/h264');
      if (h264.length === 0) return;

      for (const tr of pc.getTransceivers()) {
        if (tr.sender && tr.sender.track && tr.sender.track.kind === 'video' && tr.setCodecPreferences) {
          tr.setCodecPreferences([...h264, ...rest]);
        }
      }
    } catch (e) {}
  }

  function boostOpusStereoAudio(sdp) {
    return sdp.replace(
      /a=fmtp:(\d+) minptime=10;useinbandfec=1/g,
      'a=fmtp:$1 minptime=10;useinbandfec=1;stereo=1;sprop-stereo=1;maxaveragebitrate=192000'
    );
  }

  async function startScreenOutPcForViewer(viewerId, forceRecreate = false) {
    if (!state.localScreenStream) return;

    const existing = state.screenOutPcs.get(viewerId);
    if (existing && !forceRecreate) {
      const ageMs = Date.now() - (existing.createdAt || 0);
      const st = existing.pc.connectionState || existing.pc.iceConnectionState;
      if (
        st === 'connected' ||
        st === 'completed' ||
        ((st === 'new' || st === 'connecting' || st === 'checking') && ageMs < 6000)
      ) {
        return;
      }
    }

    if (existing) {
      try { existing.pc.close(); } catch (e) {}
      state.screenOutPcs.delete(viewerId);
    }

    const sessionId = 's_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const pc = new RTCPeerConnection(RTC_CONFIG);
    const outEntry = {
      pc,
      sessionId,
      createdAt: Date.now(),
      offerSent: false,
      localIceBuffer: [],
      remoteDescSet: false,
      pendingCandidates: [],
    };
    state.screenOutPcs.set(viewerId, outEntry);

    const checkClean = () => {
      const st = pc.connectionState || pc.iceConnectionState;
      if (st === 'failed' || st === 'closed') {
        if (state.screenOutPcs.get(viewerId) === outEntry) {
          closeScreenOutPc(viewerId);
        }
      }
    };
    pc.onconnectionstatechange = checkClean;
    pc.oniceconnectionstatechange = checkClean;

    for (const track of state.localScreenStream.getTracks()) {
      const sender = pc.addTrack(track, state.localScreenStream);
      if (track.kind === 'video') {
        try {
          const params = sender.getParameters();
          if (!params.encodings || !params.encodings.length) params.encodings = [{}];
          params.encodings[0].maxBitrate = state.streamSettings.bitrateKbps * 1000;
          params.encodings[0].maxFramerate = state.streamSettings.fps;
          params.encodings[0].scaleResolutionDownBy = 1.0;
          await sender.setParameters(params);
        } catch (e) {}
      }
    }

    preferHardwareH264(pc);

    pc.onicecandidate = ({ candidate }) => {
      if (!candidate) return;
      if (outEntry.offerSent) {
        publishDirect(viewerId, {
          type: 'screen-ice',
          role: 'from-streamer',
          sessionId,
          candidate,
        });
      } else {
        outEntry.localIceBuffer.push(candidate);
      }
    };

    try {
      const offer = await pc.createOffer();
      offer.sdp = boostOpusStereoAudio(offer.sdp);
      await pc.setLocalDescription(offer);

      outEntry.offerSent = true;
      publishDirect(viewerId, {
        type: 'screen-offer',
        sessionId,
        sdp: pc.localDescription,
      });

      for (const c of outEntry.localIceBuffer) {
        publishDirect(viewerId, {
          type: 'screen-ice',
          role: 'from-streamer',
          sessionId,
          candidate: c,
        });
      }
      outEntry.localIceBuffer = [];
    } catch (e) {}
  }

  function watchFriendStream(streamerId, force = false) {
    openSpotlight(streamerId);
    setMobileTab('stage');

    if (
      !force &&
      state.screenInEntry &&
      state.screenInEntry.streamerId === streamerId &&
      state.webrtcVideoActive &&
      els.spotlightVideo.videoWidth > 0
    ) {
      return;
    }

    state.webrtcVideoActive = false;
    publishDirect(streamerId, { type: 'watch-request', force });

    if (state.watchRetryTimer) clearInterval(state.watchRetryTimer);
    state.watchRetryTimer = setInterval(() => {
      if (state.spotlightPeerId !== streamerId || state.webrtcVideoActive) {
        clearInterval(state.watchRetryTimer);
        return;
      }
      publishDirect(streamerId, { type: 'watch-request', force: true });
    }, 5500);
  }

  async function handleIncomingScreenOffer(streamerId, sdp, sessionId) {
    if (
      state.screenInEntry &&
      state.screenInEntry.streamerId === streamerId &&
      state.screenInEntry.sessionId === sessionId
    ) {
      return;
    }

    if (state.screenInEntry && state.screenInEntry.pc) {
      try { state.screenInEntry.pc.close(); } catch (e) {}
    }

    const pc = new RTCPeerConnection(RTC_CONFIG);
    const earlyCandidates = (sessionId && state.earlyIceBySession.get(sessionId)) || [];
    if (sessionId) state.earlyIceBySession.delete(sessionId);

    const inEntry = {
      pc,
      streamerId,
      sessionId,
      createdAt: Date.now(),
      remoteStream: new MediaStream(),
      autoMutedByBrowser: false,
      answerSent: false,
      localIceBuffer: [],
      remoteDescSet: false,
      pendingCandidates: [...earlyCandidates],
    };
    state.screenInEntry = inEntry;

    pc.onicecandidate = ({ candidate }) => {
      if (!candidate) return;
      if (inEntry.answerSent) {
        publishDirect(streamerId, {
          type: 'screen-ice',
          role: 'from-viewer',
          sessionId,
          candidate,
        });
      } else {
        inEntry.localIceBuffer.push(candidate);
      }
    };

    pc.ontrack = (ev) => {
      if (!inEntry.remoteStream.getTracks().some((t) => t.id === ev.track.id)) {
        inEntry.remoteStream.addTrack(ev.track);
      }
      els.spotlightCanvas.classList.add('hidden');
      els.spotlightVideo.srcObject = inEntry.remoteStream;

      const desiredVol = Number(els.spotlightVolume.value) / 100;
      els.spotlightVideo.volume = desiredVol;
      if (!inEntry.autoMutedByBrowser) {
        els.spotlightVideo.muted = desiredVol === 0;
      }

      els.spotlightVideo
        .play()
        .then(() => {
          if (!inEntry.autoMutedByBrowser && els.btnMobileUnmute) {
            els.btnMobileUnmute.classList.add('hidden');
          }
        })
        .catch(() => {
          // Marca autoMutedByBrowser = true para NUNCA redefinir muted = false sem clique do usuário (o que causava tela preta piscando!)
          inEntry.autoMutedByBrowser = true;
          els.spotlightVideo.muted = true;
          els.spotlightVideo.play().catch(() => {});
          if (els.btnMobileUnmute) els.btnMobileUnmute.classList.remove('hidden');
        });

      if (ev.track.kind === 'video') {
        const checkDecoded = setInterval(() => {
          if (state.spotlightPeerId !== streamerId || state.screenInEntry !== inEntry) {
            clearInterval(checkDecoded);
            return;
          }
          if (els.spotlightVideo.videoWidth > 0 && els.spotlightVideo.readyState >= 2) {
            state.webrtcVideoActive = true;
            els.spotlightCanvas.classList.add('hidden');
            clearInterval(checkDecoded);
          }
        }, 120);
      }
    };

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      inEntry.remoteDescSet = true;

      for (const c of inEntry.pendingCandidates) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(c));
        } catch (e) {}
      }
      inEntry.pendingCandidates = [];

      const answer = await pc.createAnswer();
      answer.sdp = boostOpusStereoAudio(answer.sdp);
      await pc.setLocalDescription(answer);

      inEntry.answerSent = true;
      publishDirect(streamerId, {
        type: 'screen-answer',
        sessionId,
        sdp: pc.localDescription,
      });

      for (const c of inEntry.localIceBuffer) {
        publishDirect(streamerId, {
          type: 'screen-ice',
          role: 'from-viewer',
          sessionId,
          candidate: c,
        });
      }
      outEntryCleanupOldSessions();
      inEntry.localIceBuffer = [];
    } catch (e) {}
  }

  function outEntryCleanupOldSessions() {
    if (state.earlyIceBySession.size > 20) {
      state.earlyIceBySession.clear();
    }
  }

  if (els.btnMobileUnmute) {
    els.btnMobileUnmute.onclick = () => {
      if (state.screenInEntry) state.screenInEntry.autoMutedByBrowser = false;
      els.spotlightVideo.muted = false;
      els.spotlightVideo.volume = 1;
      els.spotlightVolume.value = '100';
      els.spotlightVolumeLabel.textContent = '100%';
      els.spotlightVideo.play().catch(() => {});
      els.btnMobileUnmute.classList.add('hidden');
    };
  }

  // =========================================================================
  // 9. INTERFACE DO PLAYER, ZOOM, PIP, REAÇÕES E AUTO-HIDE HUD
  // =========================================================================
  function openSpotlight(targetPeerId) {
    state.spotlightPeerId = targetPeerId;
    state.zoomLevel = 1;
    updateVideoZoomUI();
    els.spotlightWrapper.classList.remove('hidden');
    els.activeStage.classList.add('spotlight-active');
    els.spotlightCanvas.classList.add('hidden');
    els.dockBtnLeave.classList.remove('hidden');
    if (els.mobLiveDot) els.mobLiveDot.classList.remove('hidden');

    if (targetPeerId === state.clientId) {
      els.spotlightStreamerName.textContent = `${state.username} (Sua Transmissão)`;
      applySelfPreviewVisibility();
    } else {
      els.selfPreviewSaver.classList.add('hidden');
      els.btnHideSelfPreview.classList.add('hidden');
      const u = state.onlineUsers.get(targetPeerId);
      els.spotlightStreamerName.textContent = `Transmissão de ${u ? u.username : 'Amigo'}`;
    }
    renderStageParticipants();
  }

  function applySelfPreviewVisibility() {
    if (state.spotlightPeerId !== state.clientId) return;
    if (state.showSelfPreview) {
      els.selfPreviewSaver.classList.add('hidden');
      els.btnHideSelfPreview.classList.remove('hidden');
      els.spotlightVideo.srcObject = state.localScreenStream;
      els.spotlightVideo.muted = true;
      els.spotlightVideo.play().catch(() => {});
    } else {
      els.spotlightVideo.srcObject = null;
      els.selfPreviewSaver.classList.remove('hidden');
      els.btnHideSelfPreview.classList.add('hidden');
    }
  }

  els.btnToggleSelfPreview.onclick = () => {
    state.showSelfPreview = true;
    applySelfPreviewVisibility();
  };

  els.btnHideSelfPreview.onclick = () => {
    state.showSelfPreview = false;
    applySelfPreviewVisibility();
  };

  function closeSpotlight() {
    if (state.spotlightPeerId && state.spotlightPeerId !== state.clientId) {
      publishDirect(state.spotlightPeerId, { type: 'stop-watching' });
    }
    state.spotlightPeerId = null;
    state.webrtcVideoActive = false;
    els.dockBtnLeave.classList.add('hidden');
    if (els.mobLiveDot) els.mobLiveDot.classList.add('hidden');
    if (state.watchRetryTimer) clearInterval(state.watchRetryTimer);
    if (state.screenInEntry && state.screenInEntry.pc) {
      try { state.screenInEntry.pc.close(); } catch (e) {}
      state.screenInEntry = null;
    }
    els.spotlightVideo.srcObject = null;
    els.spotlightWrapper.classList.add('hidden');
    els.activeStage.classList.remove('spotlight-active');
    renderStageParticipants();
  }

  // Zoom no Vídeo (100% -> 150% -> 200%)
  function updateVideoZoomUI() {
    if (els.videoZoomContainer) {
      els.videoZoomContainer.style.transform = `scale(${state.zoomLevel})`;
    }
    if (els.btnZoomCycle) {
      els.btnZoomCycle.textContent = `🔍 ${Math.round(state.zoomLevel * 100)}%`;
    }
  }

  if (els.btnZoomCycle) {
    els.btnZoomCycle.onclick = () => {
      if (state.zoomLevel === 1) state.zoomLevel = 1.5;
      else if (state.zoomLevel === 1.5) state.zoomLevel = 2;
      else state.zoomLevel = 1;
      updateVideoZoomUI();
      showToast(`Zoom do Player: ${Math.round(state.zoomLevel * 100)}%`, '🔍');
    };
  }

  // Picture-in-Picture (PiP)
  if (els.btnPipMode) {
    els.btnPipMode.onclick = async () => {
      try {
        if (document.pictureInPictureElement) {
          await document.exitPictureInPicture();
        } else if (els.spotlightVideo.requestPictureInPicture) {
          await els.spotlightVideo.requestPictureInPicture();
        }
      } catch (e) {
        showToast('Modo Picture-in-Picture requer vídeo ativo.', '📺');
      }
    };
  }

  // Auto-Hide inteligente da HUD do player quando o mouse fica parado
  let idleMouseTimer = null;
  if (els.spotlightViewport) {
    const wakeHud = () => {
      els.spotlightViewport.classList.remove('idle-cursor');
      els.spotlightViewport.classList.add('touch-active');
      if (idleMouseTimer) clearTimeout(idleMouseTimer);
      idleMouseTimer = setTimeout(() => {
        if (state.spotlightPeerId) {
          els.spotlightViewport.classList.add('idle-cursor');
          els.spotlightViewport.classList.remove('touch-active');
        }
      }, 2600);
    };
    els.spotlightViewport.addEventListener('mousemove', wakeHud);
    els.spotlightViewport.addEventListener('touchstart', wakeHud, { passive: true });
  }

  // Reações Ao Vivo no Palco (Floating Emojis)
  function spawnFloatingEmoji(emoji) {
    if (!els.floatingReactionsLayer) return;
    const el = document.createElement('div');
    el.className = 'floating-emoji';
    el.textContent = emoji;
    el.style.left = `${15 + Math.random() * 70}%`;
    els.floatingReactionsLayer.appendChild(el);
    setTimeout(() => el.remove(), 2500);
  }

  document.querySelectorAll('.react-btn').forEach((btn) => {
    btn.onclick = () => {
      const emoji = btn.dataset.emoji || '🔥';
      playDiscordSound('click');
      spawnFloatingEmoji(emoji);
      publishBroadcast({
        type: 'stage-reaction',
        channelId: state.currentChannelId,
        emoji,
      });
    };
  });

  // Telemetria a cada 1s (Suporta Zero-Copy GPU Outbound + Inbound WebRTC)
  let prevOutboundBytes = 0;
  let prevOutboundFrames = 0;

  setInterval(async () => {
    const now = performance.now();
    const dt = Math.max(0.5, (now - state.lastStatsTime) / 1000);
    state.lastStatsTime = now;

    let fps = Math.round(state.framesCapturedCount / dt);
    let mbps = ((state.bytesTransferredThisSec * 8) / dt / 1_000_000).toFixed(1);
    state.framesCapturedCount = 0;
    state.bytesTransferredThisSec = 0;

    const targetResSpec = RESOLUTION_MAP[state.streamSettings.resolution] || RESOLUTION_MAP['1080'];
    let resText = `${targetResSpec.width}×${targetResSpec.height}`;

    // Se estamos transmitindo via Zero-Copy GPU, lê direto da Track ou do RTCPeerConnection Conectado
    if (state.isStreaming && state.localScreenStream) {
      const vt = state.localScreenStream.getVideoTracks()[0];
      if (vt && vt.getSettings) {
        const s = vt.getSettings();
        if (s.width && s.height) resText = `${s.width}×${s.height}`;
        if (s.frameRate && fps === 0) fps = Math.round(s.frameRate);
      }

      let activeOut = null;
      for (const entry of state.screenOutPcs.values()) {
        if (
          entry.pc &&
          (entry.pc.connectionState === 'connected' ||
            entry.pc.iceConnectionState === 'connected' ||
            entry.pc.iceConnectionState === 'completed')
        ) {
          activeOut = entry;
          break;
        }
      }
      if (!activeOut) activeOut = state.screenOutPcs.values().next().value;

      if (activeOut && activeOut.pc) {
        try {
          const stats = await activeOut.pc.getStats();
          stats.forEach((r) => {
            if (r.type === 'outbound-rtp' && r.kind === 'video') {
              if (r.framesPerSecond !== undefined && r.framesPerSecond > 0) {
                fps = Math.round(r.framesPerSecond);
              } else if (r.framesSent !== undefined) {
                const df = r.framesSent - prevOutboundFrames;
                if (df > 0) fps = Math.round(df / dt);
                prevOutboundFrames = r.framesSent;
              }
              const deltaB = r.bytesSent - prevOutboundBytes;
              if (deltaB >= 0) mbps = ((deltaB * 8) / dt / 1_000_000).toFixed(1);
              prevOutboundBytes = r.bytesSent;
            }
          });
        } catch (e) {}
      }
    }

    if (state.screenInEntry && state.screenInEntry.pc && state.spotlightPeerId !== state.clientId && state.webrtcVideoActive) {
      try {
        const stats = await state.screenInEntry.pc.getStats();
        stats.forEach((r) => {
          if (r.type === 'inbound-rtp' && r.kind === 'video') {
            if (r.framesPerSecond !== undefined) {
              fps = Math.round(r.framesPerSecond);
            } else if (r.framesDecoded !== undefined) {
              const df = r.framesDecoded - state.prevWebrtcFrames;
              if (df >= 0) fps = Math.round(df / dt);
              state.prevWebrtcFrames = r.framesDecoded;
            }
            if (r.frameWidth && r.frameHeight) resText = `${r.frameWidth}×${r.frameHeight}`;
            const deltaB = r.bytesReceived - state.prevWebrtcBytes;
            if (deltaB >= 0) mbps = ((deltaB * 8) / dt / 1_000_000).toFixed(1);
            state.prevWebrtcBytes = r.bytesReceived;
          }
        });
      } catch (e) {}
    }

    els.statResolution.textContent = resText;
    els.statFps.textContent = `${fps} FPS`;
    els.statBitrate.textContent = `${mbps} Mbps`;

    if (state.spotlightPeerId) {
      els.spotlightResBadge.textContent = resText;
      els.spotlightFpsBadge.textContent = `${fps} FPS`;
      els.spotlightBitrateBadge.textContent = `${mbps} Mbps`;
    }
  }, 1000);

  function getUsersInChannel(channelId) {
    const list = [];
    for (const u of state.onlineUsers.values()) {
      if (u.channelId === channelId) list.push(u);
    }
    return list;
  }

  function switchChannel(channelId) {
    const ch = state.channels.find((c) => c.id === channelId);
    if (!ch) return;
    state.currentChannelId = ch.id;
    els.stageTitle.textContent = ch.name;
    els.voiceCurrentChannelName.textContent = ch.name;
    playDiscordSound('join');
    announcePresence(true);
    if (window.innerWidth <= 900) {
      setMobileTab('stage');
    }
  }

  let lastSidebarSig = '';
  let lastStageSig = '';

  function computeStateSignature() {
    const parts = [state.currentChannelId, state.spotlightPeerId || ''];
    for (const u of state.onlineUsers.values()) {
      parts.push(`${u.id}:${u.username}:${u.channelId}:${u.streaming ? 1 : 0}:${u.streamConfig?.resolution || ''}`);
    }
    return parts.join('|');
  }

  function renderChannelsSidebar() {
    state.onlineUsers.set(state.clientId, getMyStateObject());
    const sig = computeStateSignature();
    if (sig === lastSidebarSig) return;
    lastSidebarSig = sig;

    els.channelsContainer.innerHTML = `<div class="category-label">SALAS DE TRANSMISSÃO DE TELA</div>`;

    if (els.headerChannelPills) {
      els.headerChannelPills.innerHTML = '';
    }

    for (const ch of state.channels) {
      const usersInCh = getUsersInChannel(ch.id);
      const isCurrent = state.currentChannelId === ch.id;

      if (els.headerChannelPills) {
        const pill = document.createElement('button');
        pill.className = `top-channel-pill ${isCurrent ? 'active' : ''}`;
        pill.textContent = ch.name;
        pill.onclick = () => switchChannel(ch.id);
        els.headerChannelPills.appendChild(pill);
      }

      const block = document.createElement('div');
      block.className = 'channel-block';

      const item = document.createElement('div');
      item.className = `channel-item ${isCurrent ? 'active' : ''}`;
      item.innerHTML = `
        <div class="channel-name-wrap"><span>${ch.name}</span></div>
        <span class="channel-bitrate-tag">${ch.bitrate}</span>
      `;
      item.onclick = () => switchChannel(ch.id);
      block.appendChild(item);

      if (usersInCh.length > 0) {
        const sublist = document.createElement('div');
        sublist.className = 'channel-users-sublist';

        usersInCh.forEach((u) => {
          const uRow = document.createElement('div');
          uRow.className = 'sidebar-voice-user';
          const initial = (u.username || 'A')[0].toUpperCase();
          uRow.innerHTML = `
            <div class="sidebar-user-left">
              <div class="mini-avatar" style="background:${u.avatarColor}">${initial}</div>
              <span>${escapeHtml(u.username)}</span>
            </div>
            <div class="sidebar-user-badges">
              ${u.streaming ? `<span class="live-pill-mini">AO VIVO</span>` : ''}
            </div>
          `;
          if (u.streaming) {
            uRow.style.cursor = 'pointer';
            uRow.onclick = () => {
              if (u.id === state.clientId) openSpotlight(state.clientId);
              else watchFriendStream(u.id);
            };
          }
          sublist.appendChild(uRow);
        });
        block.appendChild(sublist);
      }
      els.channelsContainer.appendChild(block);
    }
  }

  function renderStageParticipants() {
    if (!state.currentChannelId) return;
    const sig = computeStateSignature();
    if (sig === lastStageSig) return;
    lastStageSig = sig;

    const users = getUsersInChannel(state.currentChannelId);
    els.participantsGrid.innerHTML = '';

    users.forEach((u) => {
      const isMe = u.id === state.clientId;
      const tile = document.createElement('div');
      tile.className = `participant-tile ${u.streaming ? 'streaming-tile' : ''}`;
      const initial = (u.username || 'A')[0].toUpperCase();

      let badgeHtml = '';
      if (u.streaming) {
        const specText = u.streamConfig ? `${u.streamConfig.resolution} ${u.streamConfig.fps}FPS` : '1080p 60FPS';
        badgeHtml = `<div class="watch-stream-cta">🔴 AO VIVO • ${specText} (Assistir)</div>`;
      }

      tile.innerHTML = `
        <div class="tile-avatar" style="background:${u.avatarColor}">${initial}</div>
        ${badgeHtml}
        <div class="tile-name-bar">
          <span>${escapeHtml(u.username)} ${isMe ? '(Você)' : ''}</span>
          <span>${u.streaming ? '🖥️🔊' : '👀'}</span>
        </div>
      `;

      tile.onclick = () => {
        if (u.streaming) {
          if (isMe) openSpotlight(state.clientId);
          else watchFriendStream(u.id);
        }
      };
      els.participantsGrid.appendChild(tile);
    });
  }

  function updateLocalProfileUI() {
    els.localUsername.textContent = state.username;
    els.localAvatar.textContent = (state.username || 'A')[0].toUpperCase();
    els.localAvatar.style.backgroundColor = state.avatarColor;
    els.inputProfileName.value = state.username;
    els.inputRoomCode.value = state.roomCode;
    els.sidebarRoomCode.textContent = state.roomCode;
    if (els.headerRoomLabel) els.headerRoomLabel.textContent = state.roomCode;
    if (els.mobileModalRoom) els.mobileModalRoom.textContent = state.roomCode;

    const resLabel = RESOLUTION_MAP[state.streamSettings.resolution]?.label || '1080p';
    els.localQualityTag.textContent = `${resLabel} @ ${state.streamSettings.fps}fps • Discord Mudo`;
    els.activePresetPill.textContent = `H.264 GPU • ${resLabel.toUpperCase()} • ${state.streamSettings.fps} FPS`;
  }

  function updateStreamControlsUI() {
    updateLocalProfileUI();
    if (state.isStreaming) {
      els.btnShareScreen.classList.add('active-stream');
      els.shareBtnText.textContent = 'Parar Stream';
      els.dockBtnShare.classList.add('active');
      els.dockShareLabel.textContent = '⏹️ Encerrar Stream';
      if (els.mobShareLabel) els.mobShareLabel.textContent = 'Parar';
    } else {
      els.btnShareScreen.classList.remove('active-stream');
      els.shareBtnText.textContent = 'Transmitir';
      els.dockBtnShare.classList.remove('active');
      els.dockShareLabel.textContent = 'Compartilhar Tela + Áudio';
      if (els.mobShareLabel) els.mobShareLabel.textContent = 'Transmitir';
    }
  }

  function appendChatMessage(m) {
    const div = document.createElement('div');
    div.className = 'chat-msg';
    const time = new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const initial = (m.username || 'A')[0].toUpperCase();
    div.innerHTML = `
      <div class="mini-avatar" style="background:${m.avatarColor}">${initial}</div>
      <div class="chat-msg-body">
        <div class="chat-msg-meta">
          <span class="chat-msg-author">${escapeHtml(m.username)}</span>
          <span class="chat-msg-time">${time}</span>
        </div>
        <div>${escapeHtml(m.text)}</div>
      </div>
    `;
    els.chatMessages.appendChild(div);
    els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
  }

  // =========================================================================
  // 10. MODAL DE ACESSO MOBILE + QR CODE VETORIAL E QUICK SWITCHER (CTRL+K)
  // =========================================================================
  function generateVisualQrSvg(text) {
    // Gera um padrão matricial determinístico estilo QR com os 3 finder patterns oficiais
    const size = 21;
    const grid = Array.from({ length: size }, () => Array(size).fill(false));

    const drawFinder = (r0, c0) => {
      for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 7; c++) {
          const border = r === 0 || r === 6 || c === 0 || c === 6;
          const inner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
          grid[r0 + r][c0 + c] = border || inner;
        }
      }
    };
    drawFinder(0, 0);
    drawFinder(0, size - 7);
    drawFinder(size - 7, 0);

    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const inFinder =
          (r < 8 && c < 8) ||
          (r < 8 && c >= size - 8) ||
          (r >= size - 8 && c < 8);
        if (inFinder) continue;
        hash ^= (r * 31 + c * 17) & 0xff;
        hash = Math.imul(hash, 16777619);
        grid[r][c] = (Math.abs(hash) % 10) < 5;
      }
    }

    let rects = '';
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (grid[r][c]) {
          rects += `<rect x="${c}" y="${r}" width="1" height="1" fill="#111214"/>`;
        }
      }
    }
    return `<svg viewBox="0 0 ${size} ${size}" width="112" height="112" shape-rendering="crispEdges">${rects}</svg>`;
  }

  async function openMobileModal() {
    els.mobileModal.classList.remove('hidden');
    if (els.mobileModalRoom) els.mobileModalRoom.textContent = state.roomCode;

    const cloudMobileUrl = `https://igorvalente00.github.io/streamcord-updater/?room=${encodeURIComponent(state.roomCode)}`;
    const urls = [
      {
        label: '🌐 Link Mobile Global (4G / 5G / Qualquer Wi-Fi Sem VPN)',
        url: cloudMobileUrl,
      },
    ];

    try {
      const res = await fetch('/api/network-info?t=' + Date.now());
      const data = await res.json();
      if (data && Array.isArray(data.ips) && data.ips.length > 0) {
        data.ips.forEach((ip) => {
          urls.push({
            label: `🏠 Rede Wi-Fi Local (${ip.name || 'LAN'})`,
            url: `http://${ip.address}:${data.port}/?room=${encodeURIComponent(state.roomCode)}`,
          });
        });
      }
    } catch (e) {}

    if (els.mobileQrContainer) {
      els.mobileQrContainer.innerHTML = generateVisualQrSvg(cloudMobileUrl);
    }

    if (els.mobileLinksList) {
      els.mobileLinksList.innerHTML = urls
        .map(
          (u) => `
          <div class="net-link-item">
            <div>
              <div style="font-size:10px;color:#949ba4;margin-bottom:2px;font-family:Inter,sans-serif;font-weight:700;">${escapeHtml(u.label)}</div>
              <span>${escapeHtml(u.url)}</span>
            </div>
            <button type="button" class="copy-room-mini" onclick="navigator.clipboard.writeText('${escapeHtml(u.url)}')">Copiar</button>
          </div>
        `
        )
        .join('');
    }
  }

  if (els.btnRailMobile) els.btnRailMobile.onclick = openMobileModal;
  if (els.btnHeaderMobile) els.btnHeaderMobile.onclick = openMobileModal;
  if (els.btnCloseMobileModal) els.btnCloseMobileModal.onclick = () => els.mobileModal.classList.add('hidden');

  // Quick Switcher (Ctrl+K)
  function openCommandPalette() {
    els.cmdModal.classList.remove('hidden');
    els.cmdSearchInput.value = '';
    renderCommandResults('');
    setTimeout(() => els.cmdSearchInput.focus(), 50);
  }

  function renderCommandResults(query) {
    const q = query.toLowerCase().trim();
    const items = [];

    state.channels.forEach((ch) => {
      items.push({
        label: `Entrar no Canal: ${ch.name}`,
        tag: ch.bitrate,
        action: () => switchChannel(ch.id),
      });
    });

    THEME_MODELS.forEach((t) => {
      items.push({
        label: `Aplicar Tema: ${t.name}`,
        tag: t.tag,
        action: () => applyThemeModel(t.id, true),
      });
    });

    items.push({
      label: `Copiar Código da Sala (${state.roomCode})`,
      tag: 'Sem VPN',
      action: () => {
        navigator.clipboard.writeText(state.roomCode);
        showToast(`Código ${state.roomCode} copiado!`, '🔗');
      },
    });

    const filtered = items.filter((it) => !q || it.label.toLowerCase().includes(q) || it.tag.toLowerCase().includes(q));
    els.cmdResultsList.innerHTML = '';
    filtered.slice(0, 12).forEach((it) => {
      const row = document.createElement('div');
      row.className = 'cmd-item';
      row.innerHTML = `<span>${escapeHtml(it.label)}</span><small>${escapeHtml(it.tag)}</small>`;
      row.onclick = () => {
        els.cmdModal.classList.add('hidden');
        it.action();
      };
      els.cmdResultsList.appendChild(row);
    });
  }

  if (els.btnRailCmd) els.btnRailCmd.onclick = openCommandPalette;
  if (els.btnQuickSwitcher) els.btnQuickSwitcher.onclick = openCommandPalette;
  if (els.cmdSearchInput) {
    els.cmdSearchInput.oninput = () => renderCommandResults(els.cmdSearchInput.value);
  }
  if (els.cmdModal) {
    els.cmdModal.onclick = (e) => {
      if (e.target === els.cmdModal) els.cmdModal.classList.add('hidden');
    };
  }

  // Atalhos Globais de Teclado (Estilo Discord)
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openCommandPalette();
    } else if (e.altKey && e.key.toLowerCase() === 't') {
      e.preventDefault();
      openThemeModal();
    } else if (e.altKey && e.key.toLowerCase() === 's') {
      e.preventDefault();
      handleShareButtonClick();
    } else if (e.key === 'Escape') {
      els.streamModal.classList.add('hidden');
      els.themeModal.classList.add('hidden');
      els.mobileModal.classList.add('hidden');
      els.cmdModal.classList.add('hidden');
      els.inviteModal.classList.add('hidden');
    }
  });

  // =========================================================================
  // 11. EVENTOS GERAIS
  // =========================================================================
  function syncStreamModalControls() {
    document.querySelectorAll('#resolution-group .seg-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.res === state.streamSettings.resolution);
    });
    document.querySelectorAll('#fps-group .seg-btn').forEach((b) => {
      b.classList.toggle('active', Number(b.dataset.fps) === state.streamSettings.fps);
    });
    document.querySelectorAll('.preset-card').forEach((c) => {
      c.classList.toggle('active', c.dataset.preset === state.streamSettings.preset);
    });
    if (els.bitrateSlider) {
      els.bitrateSlider.value = String(state.streamSettings.bitrateKbps);
    }
    if (els.bitrateValueLabel) {
      els.bitrateValueLabel.textContent = `${(state.streamSettings.bitrateKbps / 1000).toFixed(1)} Mbps`;
    }
  }

  function openStreamPickerModal() {
    syncStreamModalControls();
    els.streamModal.classList.remove('hidden');
    loadNativeSources();
  }

  function handleShareButtonClick() {
    if (state.isStreaming) {
      stopScreenShare(true);
    } else {
      openStreamPickerModal();
    }
  }

  els.btnShareScreen.onclick = handleShareButtonClick;
  els.dockBtnShare.onclick = handleShareButtonClick;
  els.btnStreamSettings.onclick = openStreamPickerModal;
  els.dockBtnQuality.onclick = openStreamPickerModal;
  els.btnCloseStreamModal.onclick = () => els.streamModal.classList.add('hidden');
  els.btnCancelStream.onclick = () => els.streamModal.classList.add('hidden');

  els.tabMonitors.onclick = () => {
    state.sourceTab = 'monitor';
    els.tabMonitors.classList.add('active');
    els.tabWindows.classList.remove('active');
    if (els.tabBrowserCam) els.tabBrowserCam.classList.remove('active');
    renderSourcesGrid();
  };

  els.tabWindows.onclick = () => {
    state.sourceTab = 'window';
    els.tabWindows.classList.add('active');
    els.tabMonitors.classList.remove('active');
    if (els.tabBrowserCam) els.tabBrowserCam.classList.remove('active');
    renderSourcesGrid();
  };

  if (els.tabBrowserCam) {
    els.tabBrowserCam.onclick = () => {
      state.sourceTab = 'browser';
      els.tabBrowserCam.classList.add('active');
      els.tabMonitors.classList.remove('active');
      els.tabWindows.classList.remove('active');
      renderSourcesGrid();
    };
  }

  els.audioModeSelect.onchange = () => {
    state.streamSettings.audioMode = els.audioModeSelect.value;
  };

  els.btnRefreshSources.onclick = loadNativeSources;
  els.btnConfirmGoLive.onclick = () => startNativeScreenShare();

  els.btnReconnectStream.onclick = () => {
    if (state.spotlightPeerId && state.spotlightPeerId !== state.clientId) {
      watchFriendStream(state.spotlightPeerId, true);
      showToast('Reconectando à transmissão...', '🔄');
    }
  };

  els.spotlightVolume.oninput = () => {
    const v = Number(els.spotlightVolume.value);
    els.spotlightVideo.volume = v / 100;
    els.spotlightVideo.muted = v === 0;
    els.spotlightVolumeLabel.textContent = `${v}%`;
  };

  if (els.btnMuteToggle) {
    els.btnMuteToggle.onclick = () => {
      els.spotlightVideo.muted = !els.spotlightVideo.muted;
      els.btnMuteToggle.textContent = els.spotlightVideo.muted ? '🔇' : '🔊';
    };
  }

  if (els.btnToggleSfx) {
    els.sfxIconLabel.textContent = state.sfxEnabled ? '🔔' : '🔕';
    els.btnToggleSfx.onclick = () => {
      state.sfxEnabled = !state.sfxEnabled;
      localStorage.setItem('streamcord_sfx', state.sfxEnabled ? '1' : '0');
      els.sfxIconLabel.textContent = state.sfxEnabled ? '🔔' : '🔕';
      showToast(state.sfxEnabled ? 'Sons do aplicativo ativados' : 'Sons do aplicativo silenciados', state.sfxEnabled ? '🔔' : '🔕');
    };
  }

  document.querySelectorAll('.preset-card').forEach((card) => {
    card.onclick = () => {
      document.querySelectorAll('.preset-card').forEach((c) => c.classList.remove('active'));
      card.classList.add('active');
      state.streamSettings.preset = card.dataset.preset;
      localStorage.setItem('streamcord_preset', state.streamSettings.preset);
      updateLocalProfileUI();
    };
  });

  document.querySelectorAll('#resolution-group .seg-btn').forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll('#resolution-group .seg-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.streamSettings.resolution = btn.dataset.res;
      localStorage.setItem('streamcord_res', state.streamSettings.resolution);
      updateLocalProfileUI();
    };
  });

  document.querySelectorAll('#fps-group .seg-btn').forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll('#fps-group .seg-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.streamSettings.fps = Number(btn.dataset.fps);
      localStorage.setItem('streamcord_fps', String(state.streamSettings.fps));
      updateLocalProfileUI();
    };
  });

  els.bitrateSlider.oninput = () => {
    const kbps = Number(els.bitrateSlider.value);
    state.streamSettings.bitrateKbps = kbps;
    localStorage.setItem('streamcord_bitrate', String(kbps));
    els.bitrateValueLabel.textContent = `${(kbps / 1000).toFixed(1)} Mbps`;
  };

  els.dockBtnLeave.onclick = () => {
    if (state.isStreaming && state.spotlightPeerId === state.clientId) {
      stopScreenShare(true);
    } else {
      closeSpotlight();
    }
  };

  document.getElementById('btn-fit-mode').onclick = () => {
    els.spotlightVideo.classList.toggle('fit-cover');
    els.spotlightCanvas.classList.toggle('fit-cover');
  };

  document.getElementById('btn-fullscreen').onclick = () => {
    if (!document.fullscreenElement) {
      if (els.spotlightViewport.requestFullscreen) {
        els.spotlightViewport.requestFullscreen().catch(() => {});
      } else if (els.spotlightVideo.webkitEnterFullscreen) {
        // Suporte nativo a Tela Cheia no iOS Safari
        els.spotlightVideo.webkitEnterFullscreen();
      }
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  function toggleHud() {
    els.rtcTelemetryHud.classList.toggle('hidden');
  }
  els.btnToggleStats.onclick = toggleHud;
  els.btnHeaderStats.onclick = toggleHud;
  els.btnCloseHud.onclick = () => els.rtcTelemetryHud.classList.add('hidden');

  els.btnToggleChat.onclick = () => {
    if (window.innerWidth <= 900) {
      setMobileTab(state.mobileActiveTab === 'chat' ? 'stage' : 'chat');
    } else {
      els.chatDrawer.classList.toggle('hidden');
      if (!els.chatDrawer.classList.contains('hidden')) {
        state.unreadChatCount = 0;
        updateUnreadChatBadges();
      }
    }
  };
  els.btnCloseChat.onclick = () => {
    if (window.innerWidth <= 900) {
      setMobileTab('stage');
    } else {
      els.chatDrawer.classList.add('hidden');
    }
  };

  els.chatForm.onsubmit = (e) => {
    e.preventDefault();
    const text = els.chatInput.value.trim();
    if (!text) return;
    const chatEntry = {
      id: 'm_' + Date.now(),
      senderId: state.clientId,
      username: state.username,
      avatarColor: state.avatarColor,
      text: text.slice(0, 1000),
      timestamp: new Date().toISOString(),
    };
    appendChatMessage(chatEntry);
    publishBroadcast({
      type: 'chat-message',
      channelId: state.currentChannelId,
      message: chatEntry,
    });
    els.chatInput.value = '';
  };

  function openInviteModal() {
    els.inviteModal.classList.remove('hidden');
    els.inputProfileName.value = state.username;
    els.inputRoomCode.value = state.roomCode;
  }

  els.btnInviteModal.onclick = openInviteModal;
  els.btnHeaderInvite.onclick = openInviteModal;
  els.btnEditProfile.onclick = openInviteModal;
  els.btnRoomBanner.onclick = (e) => {
    if (e.target === els.btnQuickCopyCode) return;
    openInviteModal();
  };

  els.btnQuickCopyCode.onclick = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(state.roomCode);
    playDiscordSound('click');
    els.btnQuickCopyCode.textContent = 'Copiado!';
    showToast(`Código da sala ${state.roomCode} copiado!`, '🔗');
    setTimeout(() => (els.btnQuickCopyCode.textContent = 'Copiar'), 1500);
  };

  els.btnCloseInviteModal.onclick = () => els.inviteModal.classList.add('hidden');

  els.btnSaveName.onclick = () => {
    const newName = els.inputProfileName.value.trim();
    const newRoom = els.inputRoomCode.value.trim().toUpperCase();

    if (newName) {
      state.username = newName.slice(0, 28);
      localStorage.setItem('streamcord_username', state.username);
    }
    if (newRoom && newRoom !== state.roomCode) {
      state.roomCode = newRoom.replace(/[^A-Z0-9_-]/g, '').slice(0, 24) || 'IGOR-2K60';
      localStorage.setItem('streamcord_room', state.roomCode);
      state.onlineUsers.clear();
      connectCloudSignaling();
      showToast(`Conectado à sala ${state.roomCode}!`, '☁️');
    } else {
      announcePresence(true);
      showToast('Perfil atualizado!', '✅');
    }
    updateLocalProfileUI();
    renderChannelsSidebar();
    els.inviteModal.classList.add('hidden');
  };

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  syncStreamModalControls();
  applyThemeModel(state.activeTheme, false);
  updateLocalProfileUI();
  renderChannelsSidebar();
  connectCloudSignaling();
})();
