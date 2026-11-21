// StreamCord v9.14.0 — Google AI Studio UI 100% Fiel + Mixer WASAPI Relógio Mestre 10ms + Favoritos Persistentes
(() => {
  const APP_VERSION = '9.16.2';
  const IS_LOCAL_HOST = /^(127\.0\.0\.1|localhost|0\.0\.0\.0|\[::1\])$/i.test(window.location.hostname);

  const FALLBACK_STUN_SERVERS = [
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ];

  const RTC_CONFIG = {
    iceServers: [...FALLBACK_STUN_SERVERS],
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
    iceCandidatePoolSize: 0,
  };

  function getP2POnlyRtcConfig() {
    const stunOnly = (RTC_CONFIG.iceServers || []).filter((srv) => {
      if (!srv || !srv.urls) return false;
      const urls = Array.isArray(srv.urls) ? srv.urls : [srv.urls];
      return urls.every((u) => /^stun:/i.test(String(u)));
    });
    return {
      ...RTC_CONFIG,
      iceServers: stunOnly.length > 0 ? stunOnly : [...FALLBACK_STUN_SERVERS],
      iceCandidatePoolSize: 0,
    };
  }

  let iceServersFetchedAt = 0;
  let iceServersPromise = null;
  let turnQuotaState = {
    month: '',
    relayBytes: 0,
    limitBytes: 1020054732800,
    usedGb: 0,
    limitGb: 950,
    freeTierGb: 1000,
    locked: false,
  };

  function triggerTurnQuotaLockScreen(info) {
    if (info && typeof info === 'object') {
      turnQuotaState = { ...turnQuotaState, ...info, locked: true };
    } else {
      turnQuotaState.locked = true;
    }

    try {
      if (state.isStreaming) stopScreenShare(true);
    } catch (_) {}
    try {
      for (const sid of Array.from(state.watchedStreams.keys())) {
        closeWatchedStream(sid, true);
      }
    } catch (_) {}

    let overlay = document.getElementById('turn-quota-lock-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'turn-quota-lock-overlay';
      overlay.style.cssText =
        'position:fixed;inset:0;z-index:999999;background:rgba(10,12,18,0.95);backdrop-filter:blur(10px);display:flex;align-items:center;justify-content:center;padding:24px;color:#fff;font-family:inherit;';
      overlay.innerHTML = `
        <div style="max-width:520px;width:100%;background:#181a22;border:1px solid rgba(239,68,68,0.55);border-radius:16px;padding:28px;box-shadow:0 24px 64px rgba(0,0,0,0.65);text-align:center;">
          <div style="font-size:42px;margin-bottom:12px;">⛔</div>
          <h2 style="margin:0 0 10px;font-size:22px;color:#f87171;">Cota Gratuita Esgotada (1.000 GB/mês)</h2>
          <p style="margin:0 0 14px;font-size:14px;line-height:1.55;color:#d1d5db;">
            O teste/franquia gratuita mensal do <strong>Cloudflare Realtime TURN</strong> acabou neste mês
            (trava automática de segurança acionada em <strong id="turn-quota-used-label">950 GB</strong> para impedir qualquer cobrança na sua conta).
          </p>
          <p style="margin:0 0 18px;font-size:13px;line-height:1.5;color:#9ca3af;">
            O aplicativo foi travado automaticamente e só voltará a operar no dia <strong>1º do próximo mês</strong>, quando a franquia gratuita de 1.000 GB renovar.
          </p>
          <div style="display:inline-block;padding:8px 14px;border-radius:8px;background:rgba(239,68,68,0.14);border:1px solid rgba(239,68,68,0.35);font-size:12px;color:#fca5a5;">
            Trava de Proteção Financeira Ativa • v${APP_VERSION}
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
    }
    const usedEl = document.getElementById('turn-quota-used-label');
    if (usedEl) {
      usedEl.textContent = `${turnQuotaState.usedGb || 950} GB`;
    }
  }

  async function ensureTurnQuotaChecked() {
    try {
      const res = await fetch('/api/turn-quota', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (data && typeof data === 'object') {
        turnQuotaState = { ...turnQuotaState, ...data };
        if (data.locked) {
          triggerTurnQuotaLockScreen(data);
        }
      }
    } catch (_) {}
  }

  async function pollTurnRelayUsage() {
    if (turnQuotaState.locked) return;
    const activeEntries = [];
    for (const entry of state.screenOutPcs.values()) {
      if (entry && entry.pc) activeEntries.push(entry);
    }
    for (const ws of state.watchedStreams.values()) {
      if (ws && ws.inEntry && ws.inEntry.pc) activeEntries.push(ws.inEntry);
    }
    if (activeEntries.length === 0) return;

    let deltaTotal = 0;
    for (const entry of activeEntries) {
      const pc = entry.pc;
      const st = pc.connectionState || pc.iceConnectionState;
      if (st !== 'connected' && st !== 'completed') continue;
      try {
        const stats = await pc.getStats();
        let selectedPair = null;
        stats.forEach((report) => {
          if (report.type === 'candidate-pair' && (report.selected || (report.nominated && report.state === 'succeeded'))) {
            selectedPair = report;
          }
        });
        if (!selectedPair) continue;
        const localCand = selectedPair.localCandidateId ? stats.get(selectedPair.localCandidateId) : null;
        const remoteCand = selectedPair.remoteCandidateId ? stats.get(selectedPair.remoteCandidateId) : null;
        const isRelay =
          (localCand && localCand.candidateType === 'relay') ||
          (remoteCand && remoteCand.candidateType === 'relay');
        const proto = ((localCand && localCand.protocol) || (remoteCand && remoteCand.protocol) || 'udp').toLowerCase();

        // Atualiza rota detectada para o controlador adaptativo de bitrate (P2P vs TURN UDP/TCP)
        if ('isRelayed' in entry) {
          const changed = entry.isRelayed !== Boolean(isRelay) || entry.relayProtocol !== proto;
          if (changed) {
            entry.isRelayed = Boolean(isRelay);
            entry.relayProtocol = proto;
            rebalanceViewerBitrates();
          }
        }
        if (!isRelay) continue;

        const currentRelayBytes = (selectedPair.bytesSent || 0) + (selectedPair.bytesReceived || 0);
        const prevRelayBytes = entry._lastRelayBytes || 0;
        if (currentRelayBytes > prevRelayBytes) {
          deltaTotal += currentRelayBytes - prevRelayBytes;
          entry._lastRelayBytes = currentRelayBytes;
        }
      } catch (_) {}
    }

    if (deltaTotal > 0) {
      try {
        const res = await fetch('/api/turn-quota', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ addBytes: deltaTotal }),
        });
        if (res.ok) {
          const data = await res.json();
          turnQuotaState = { ...turnQuotaState, ...data };
          if (data.locked) {
            triggerTurnQuotaLockScreen(data);
          }
        }
      } catch (_) {}
    }
  }

  setInterval(() => {
    void pollTurnRelayUsage();
  }, 5000);

  async function ensureIceServersReady() {
    if (turnQuotaState.locked) {
      triggerTurnQuotaLockScreen(turnQuotaState);
      return;
    }
    if (iceServersFetchedAt > 0 && Date.now() - iceServersFetchedAt < 12 * 60 * 60 * 1000) {
      return;
    }
    if (iceServersPromise) return iceServersPromise;

    iceServersPromise = (async () => {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), 2500) : null;
      try {
        const res = await fetch('/api/ice-servers', {
          cache: 'no-store',
          signal: controller ? controller.signal : undefined,
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data && data.quotaExceeded) {
          triggerTurnQuotaLockScreen({ usedGb: 950, locked: true });
          return;
        }
        if (Array.isArray(data.iceServers) && data.iceServers.length > 0) {
          // Separa STUN no topo (P2P/IPv6 direto = 0 GB) e TURN UDP antes de TCP/TLS
          const stunFirst = [...FALLBACK_STUN_SERVERS];
          const turnServers = [];
          for (const srv of data.iceServers) {
            if (!srv) continue;
            const urls = Array.isArray(srv.urls) ? srv.urls : [srv.urls];
            const stunUrls = urls.filter((u) => /^stun:/i.test(u));
            const turnUdp = urls.filter((u) => /^turn/i.test(u) && /transport=udp/i.test(u));
            const turnOther = urls.filter((u) => /^turn/i.test(u) && !/transport=udp/i.test(u));
            if (stunUrls.length > 0) {
              stunFirst.push({ urls: stunUrls });
            }
            if (turnUdp.length > 0 || turnOther.length > 0) {
              turnServers.push({ ...srv, urls: [...turnUdp, ...turnOther] });
            }
          }
          RTC_CONFIG.iceServers = [...stunFirst, ...turnServers];
          if (!data.fallback) {
            iceServersFetchedAt = Date.now();
          }
        }
      } catch (_) {
        // Fallback silencioso para STUN padrão caso o endpoint local não esteja disponível
      } finally {
        if (timer) clearTimeout(timer);
        iceServersPromise = null;
      }
    })();

    return iceServersPromise;
  }

  function isRelayCandidate(candidate) {
    if (!candidate) return false;
    if (candidate.type === 'relay') return true;
    const str = candidate.candidate || '';
    return /\btyp relay\b/i.test(str);
  }

  const DEFAULT_CHANNELS = [
    { id: 'gameplay-2k', name: 'Arena 2K', bitrate: '25 Mbps', defaultRes: '1440', defaultFps: 60, defaultKbps: 20000 },
    { id: 'cinema-watch', name: 'Squad FPS', bitrate: '20 Mbps', defaultRes: '1080', defaultFps: 60, defaultKbps: 16000 },
    { id: 'dev-code', name: 'Co-op & Chill', bitrate: '15 Mbps', defaultRes: '1440', defaultFps: 60, defaultKbps: 15000 },
    { id: 'lounge-geral', name: 'Análise de Replay', bitrate: '12 Mbps', defaultRes: '1080', defaultFps: 60, defaultKbps: 10000 },
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
    '900': { width: 1600, height: 900, heightNum: 900, label: '900p FPS' },
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
    channels: JSON.parse(localStorage.getItem('streamcord_channels_' + (localStorage.getItem('streamcord_room') || 'IGOR-2K60').toUpperCase().trim()) || 'null') || DEFAULT_CHANNELS.map((c) => ({ ...c })),
    onlineUsers: new Map(),
    bannedUsers: new Map(),
    bannedFromRooms: new Set(),
    locallyMutedUsers: new Set(),

    cloudMqtt: null,
    cloudConnected: false,

    // Captura Híbrida (C# Nativo Desktop + Web/Mobile)
    hasNativeBackend: IS_LOCAL_HOST,
    hasUserInteracted: false,
    nativeSources: [],
    selectedSourceId: 'monitor:0',
    sourceTab: 'monitor', // 'monitor' | 'window' | 'browser'
    localCaptureWs: null,
    localAudioWs: null,
    nativeGpuWs: null,
    nativeGpuActive: false,
    nativeGpuEncoder: 'h264_nvenc',
    nativeGpuWidth: 0,
    nativeGpuHeight: 0,
    nativeGpuLastKeyframe: null,
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
      captureEngine: localStorage.getItem('streamcord_engine') || 'gpu_zerocopy',
      preset: localStorage.getItem('streamcord_preset') || 'motion',
      resolution: localStorage.getItem('streamcord_res') || '1080',
      fps: Number(localStorage.getItem('streamcord_fps')) || 60,
      bitrateKbps: Number(localStorage.getItem('streamcord_bitrate')) || 8000,
      audioMode: localStorage.getItem('streamcord_audio') || 'pc_no_discord',
    },

    // Conexões WebRTC Dedicadas (Multi-Stream Simultânea!)
    screenOutPcs: new Map(),
    watchedStreams: new Map(),
    focusedStreamerId: null,
    earlyIceBySession: new Map(),
    activeFallbackViewers: new Set(),
    fallbackSenderTimer: null,

    unreadChatCount: 0,
    mobileActiveTab: 'stage',

    framesCapturedCount: 0,
    bytesTransferredThisSec: 0,
    lastStatsTime: performance.now(),

    updateAvailable: false,
    latestVersion: APP_VERSION,
  };

  // Lazy init do canvas apenas se o fallback de emergência for acionado (economiza ~16MB de VRAM na GPU!)
  function ensureFallbackCanvas() {
    if (!state.captureCtx) {
      state.captureCanvas.width = 1920;
      state.captureCanvas.height = 1080;
      state.captureCtx = state.captureCanvas.getContext('2d', { alpha: false, desynchronized: true });
    }
  }
  localStorage.setItem('streamcord_color', state.avatarColor);

  // =========================================================================
  // 0. EFEITOS SONOROS SINTETIZADOS (ESTILO DISCORD - ZERO ARQUIVOS EXTERNOS)
  // =========================================================================
  let sfxCtx = null;
  function playDiscordSound(type) {
    if (!state.sfxEnabled || !state.hasUserInteracted) return;
    try {
      if (!sfxCtx) {
        sfxCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (sfxCtx.state === 'suspended') sfxCtx.resume().catch(() => {});
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
    multiStreamGrid: document.getElementById('multi-stream-grid'),
    floatingReactionsLayer: document.getElementById('floating-reactions-layer'),
    btnMobileUnmute: document.getElementById('btn-mobile-unmute'),
    participantsGrid: document.getElementById('participants-grid'),

    btnShareScreen: document.getElementById('btn-share-screen'),
    shareBtnText: document.getElementById('share-btn-text'),
    btnStreamSettings: document.getElementById('btn-stream-settings'),
    dockBtnShare: document.getElementById('dock-btn-share'),
    dockShareLabel: document.getElementById('dock-share-label'),
    dockBtnQuality: document.getElementById('dock-btn-quality'),
    dockBtnThemes: document.getElementById('dock-btn-themes'),
    dockBtnLeave: document.getElementById('dock-btn-leave'),
    dockLeaveLabel: document.getElementById('dock-leave-label'),

    btnHeaderUpdate: document.getElementById('btn-header-update'),
    updateBtnLabel: document.getElementById('update-btn-label'),
    btnLobbyUpdate: document.getElementById('btn-lobby-update'),
    lobbyUpdateLabel: document.getElementById('lobby-update-label'),
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
    captureEngineSelect: document.getElementById('capture-engine-select'),
    audioModeSelect: document.getElementById('audio-mode-select'),
    resolutionSelect: document.getElementById('resolution-select'),
    fpsSelect: document.getElementById('fps-select'),
    presetSelect: document.getElementById('preset-select'),
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
    btnCopyPsInstall: document.getElementById('btn-copy-ps-install'),
    btnCopyInvitePage: document.getElementById('btn-copy-invite-page'),
    btnCopyWebDirect: document.getElementById('btn-copy-web-direct'),

    btnToggleSfx: document.getElementById('btn-toggle-sfx'),
    sfxIconLabel: document.getElementById('sfx-icon-label'),
    btnDisconnectCall: document.getElementById('btn-disconnect-call'),
    avatarColorPicker: document.getElementById('avatar-color-picker'),

    channelManagerModal: document.getElementById('channel-manager-modal'),
    btnCloseChannelManager: document.getElementById('btn-close-channel-manager'),
    newChannelEmoji: document.getElementById('new-channel-emoji'),
    newChannelName: document.getElementById('new-channel-name'),
    btnCreateChannel: document.getElementById('btn-create-channel'),
    channelManagerList: document.getElementById('channel-manager-list'),
    bannedUsersList: document.getElementById('banned-users-list'),
    contextMenu: document.getElementById('discord-context-menu'),

    mobileBottomNav: document.getElementById('mobile-bottom-nav'),
    mobBtnShare: document.getElementById('mob-btn-share'),
    mobShareLabel: document.getElementById('mob-share-label'),
    mobBtnThemes: document.getElementById('mob-btn-themes'),
    mobLiveDot: document.getElementById('mob-live-dot'),
    btnMobileChannelsDrawer: document.getElementById('btn-mobile-channels-drawer'),
  };

  // Evita alocar contexto 2D extra na GPU para o spotlight-canvas ocioso

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
      saveProfileToServer();
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
  // 4. AUTO-UPDATER ESTILO DISCORD (Visível somente se houver atualização)
  // =========================================================================
  function syncUpdateButtonsUI(labelText = null, isDisabled = false) {
    const show = Boolean(state.updateAvailable);
    const buttons = [els.btnHeaderUpdate, els.btnLobbyUpdate];
    const labels = [els.updateBtnLabel, els.lobbyUpdateLabel];
    for (const btn of buttons) {
      if (!btn) continue;
      btn.classList.toggle('hidden', !show);
      btn.classList.toggle('update-ready', show);
      btn.disabled = Boolean(isDisabled);
    }
    if (labelText !== null) {
      for (const lbl of labels) {
        if (lbl) lbl.textContent = labelText;
      }
    }
  }

  async function checkAppUpdate(manualClick = false) {
    const prevLabel = els.updateBtnLabel ? els.updateBtnLabel.textContent : '⬇️ Atualizar';
    if (manualClick) {
      syncUpdateButtonsUI('🔍 Verificando...', true);
    }
    try {
      if (!IS_LOCAL_HOST) {
        const res = await fetch('./streamcord-update.json?t=' + Date.now(), { cache: 'no-store' });
        if (res.ok) {
          const manifest = await res.json();
          const latest = manifest && manifest.version ? String(manifest.version).trim() : APP_VERSION;
          if (latest !== APP_VERSION) {
            state.updateAvailable = true;
            state.latestVersion = latest;
            syncUpdateButtonsUI(`⬇️ Recarregar v${latest}`, false);
            if (manualClick) {
              window.location.reload();
              return;
            }
          } else {
            state.updateAvailable = false;
            syncUpdateButtonsUI('⬇️ Atualizar', false);
            if (manualClick) {
              showToast(`Versão Web/Mobile já está atualizada (v${APP_VERSION})!`, '✅');
            }
          }
        }
        return;
      }

      const res = await fetch('/api/update-status?t=' + Date.now(), { cache: 'no-store' });
      const data = await res.json();
      if (data && data.updateAvailable) {
        state.updateAvailable = true;
        state.latestVersion = data.latestVersion;
        syncUpdateButtonsUI(`⬇️ Atualizar v${data.latestVersion}`, false);
        if (manualClick) {
          await triggerInPlaceUpdate();
          return;
        }
      } else {
        state.updateAvailable = false;
        syncUpdateButtonsUI('⬇️ Atualizar', false);
        if (manualClick) {
          showToast(`StreamCord já está na versão mais recente (v${APP_VERSION})!`, '✅');
        }
      }
    } catch (e) {
      if (manualClick) {
        syncUpdateButtonsUI(prevLabel, false);
        showToast(`Versão Web/Mobile v${APP_VERSION} ativa!`, '✅');
      }
    } finally {
      if (manualClick && !state.isApplyingUpdate) {
        syncUpdateButtonsUI(null, false);
      }
    }
  }

  async function triggerInPlaceUpdate() {
    if (!IS_LOCAL_HOST) {
      window.location.reload();
      return;
    }
    state.isApplyingUpdate = true;
    syncUpdateButtonsUI('⏳ Baixando...', true);
    try {
      const res = await fetch('/api/apply-update', { method: 'POST', cache: 'no-store' });
      const data = await res.json();
      if (data && data.ok) {
        syncUpdateButtonsUI('🚀 Reiniciando...', true);
        showToast('Atualização baixada! Reiniciando StreamCord...', '🚀');
      } else {
        state.isApplyingUpdate = false;
        syncUpdateButtonsUI(state.updateAvailable ? `⬇️ Atualizar v${state.latestVersion}` : '⬇️ Atualizar', false);
        showToast(`Erro ao atualizar: ${(data && data.error) || 'Tente novamente'}`, '❌');
      }
    } catch (e) {
      state.isApplyingUpdate = false;
      syncUpdateButtonsUI(state.updateAvailable ? `⬇️ Atualizar v${state.latestVersion}` : '⬇️ Atualizar', false);
      showToast('Não foi possível concluir a atualização agora.', '❌');
    }
  }

  const handleUpdateBtnClick = () => {
    if (state.updateAvailable) triggerInPlaceUpdate();
    else checkAppUpdate(true);
  };
  if (els.btnHeaderUpdate) els.btnHeaderUpdate.onclick = handleUpdateBtnClick;
  if (els.btnLobbyUpdate) els.btnLobbyUpdate.onclick = handleUpdateBtnClick;
  if (els.btnRailUpdate) els.btnRailUpdate.onclick = handleUpdateBtnClick;

  syncUpdateButtonsUI('⬇️ Atualizar', false);
  setTimeout(() => checkAppUpdate(false), 500);
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

    if (els.cloudStatusPill) {
      els.cloudStatusPill.title = 'Conectando...';
      els.cloudStatusPill.classList.add('connecting');
    }

    const mqttId = 'sc11_' + state.clientId + '_' + Math.random().toString(36).slice(2, 6);
    state.cloudMqtt = new MiniMqttOverWs(
      BROKER_URL,
      mqttId,
      () => {
        state.cloudConnected = true;
        if (els.cloudStatusPill) {
          els.cloudStatusPill.title = 'Online';
          els.cloudStatusPill.classList.remove('connecting');
        }

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
        if (els.cloudStatusPill) {
          els.cloudStatusPill.title = 'Reconectando...';
          els.cloudStatusPill.classList.add('connecting');
        }
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
      state.screenOutPcs.delete(viewerId);
      if (entry.watchdogTimer) clearTimeout(entry.watchdogTimer);
      if (entry.relayFlushTimer) clearTimeout(entry.relayFlushTimer);
      if (entry.p2pFallbackTimer) clearTimeout(entry.p2pFallbackTimer);
      entry.pc.close();
      rebalanceViewerBitrates();
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
        if (state.watchedStreams.has(uid)) closeWatchedStream(uid);
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
          if (state.watchedStreams.has(uid)) closeWatchedStream(uid);
          renderChannelsSidebar();
          renderStageParticipants();
        }
        break;
      }

      case 'presence': {
        const u = msg.user;
        if (!u || !u.id) return;
        if (state.bannedUsers.has(u.id)) {
          publishDirect(u.id, { type: 'mod-action', action: 'ban', by: state.username });
          return;
        }
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
        }

        if (
          state.currentChannelId &&
          u.channelId === state.currentChannelId &&
          u.streaming &&
          !wasStreaming
        ) {
          playDiscordSound('stream-start');
          showToast(`${u.username} iniciou uma transmissão ao vivo!`, '🔴');
        } else if (state.watchedStreams.has(u.id) && (!u.streaming || u.channelId !== state.currentChannelId)) {
          closeWatchedStream(u.id);
        }

        renderChannelsSidebar();
        renderStageParticipants();
        break;
      }

      case 'watch-request': {
        if (!state.isStreaming || !state.localScreenStream) {
          publishDirect(msg.senderId, {
            type: 'stream-error',
            reason: 'Transmissão ainda está iniciando ou foi encerrada.',
          });
          break;
        }
        const entry = state.screenOutPcs.get(msg.senderId);
        const connected = entry && (entry.pc.connectionState === 'connected' || entry.pc.iceConnectionState === 'connected' || entry.pc.iceConnectionState === 'completed');
        if (!msg.retry || !entry || msg.force || (!connected && Date.now() - entry.createdAt >= 6000)) {
          publishDirect(msg.senderId, { type: 'watch-ack', channelId: state.currentChannelId });
          await startScreenOutPcForViewer(msg.senderId, Boolean(msg.force), false, msg.channelId || null);
        }
        break;
      }

      case 'watch-ack': {
        const ws = state.watchedStreams.get(msg.senderId);
        if (ws && !ws.offerReceived && !ws.webrtcVideoActive) {
          const u = state.onlineUsers.get(msg.senderId);
          setStreamCardStatus(ws, `📡 Pedido recebido por ${u ? u.username : 'Amigo'}, gerando oferta P2P...`);
        }
        break;
      }

      case 'stream-error': {
        const ws = state.watchedStreams.get(msg.senderId);
        if (ws && !ws.webrtcVideoActive) {
          setStreamCardStatus(ws, `⚠️ ${msg.reason || 'Não foi possível iniciar a transmissão.'}`, true);
        }
        break;
      }

      case 'screen-offer': {
        if (state.watchedStreams.has(msg.senderId)) {
          const allowTurn = typeof msg.allowTurn === 'boolean' ? msg.allowTurn : true;
          await handleIncomingScreenOffer(msg.senderId, msg.sdp, msg.sessionId, allowTurn);
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
            rebalanceViewerBitrates();
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
          const ws = state.watchedStreams.get(msg.senderId);
          const inEntry = ws?.inEntry;
          if (
            inEntry &&
            inEntry.streamerId === msg.senderId &&
            (!msg.sessionId || inEntry.sessionId === msg.sessionId)
          ) {
            if (inEntry.remoteDescSet) {
              try {
                await inEntry.pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
              } catch (e) {}
            } else {
              inEntry.pendingCandidates.push(msg.candidate);
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

      case 'channels-sync': {
        if (Array.isArray(msg.channels) && msg.channels.length > 0) {
          state.channels = msg.channels;
          saveChannelsLocal();
          if (state.currentChannelId && !state.channels.some((c) => c.id === state.currentChannelId)) {
            state.currentChannelId = state.channels[0].id;
            els.stageTitle.textContent = state.channels[0].name;
            els.voiceCurrentChannelName.textContent = state.channels[0].name;
          }
          renderChannelsSidebar();
          if (!els.channelManagerModal.classList.contains('hidden')) renderChannelManager();
        }
        break;
      }

      case 'mod-action': {
        if (msg.action === 'kick') {
          disconnectFromCall(false);
          showToast(`Você foi expulso da chamada por ${msg.by || 'um moderador'}.`, '👢');
        } else if (msg.action === 'ban') {
          stopScreenShare(false);
          closeAllWatchedStreams();
          state.currentChannelId = null;
          state.bannedFromRooms.add(state.roomCode);
          if (state.cloudMqtt) {
            state.cloudMqtt.close();
            state.cloudMqtt = null;
          }
          state.cloudConnected = false;
          state.onlineUsers.clear();
          renderChannelsSidebar();
          renderStageParticipants();
          showToast(`Você foi banido da sala ${state.roomCode} por ${msg.by || 'um moderador'}.`, '🚫');
        }
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
    if (!IS_LOCAL_HOST) {
      state.hasNativeBackend = false;
      state.nativeSources = [];
      state.sourceTab = 'browser';
      els.tabMonitors.classList.remove('active');
      els.tabWindows.classList.remove('active');
      if (els.tabBrowserCam) els.tabBrowserCam.classList.add('active');
      renderSourcesGrid();
      return;
    }

    if (state.streamSettings.captureEngine !== 'legacy_csharp') {
      state.hasNativeBackend = true;
      renderSourcesGrid();
      return;
    }

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

    if (state.streamSettings.captureEngine !== 'legacy_csharp') {
      const modeTitle = state.sourceTab === 'window' ? 'Janela específica do jogo / aplicativo' : 'Monitor / Tela inteira (DirectX 11 GPU)';
      const readoutEl = document.getElementById('settings-source-readout');
      if (readoutEl) readoutEl.textContent = state.sourceTab === 'window' ? 'Janela específica' : 'Tela inteira';
      els.sourcesGrid.innerHTML = `
        <div class="zero-copy-info-card">
          <strong>${modeTitle}</strong>
          <p>Ao clicar em <strong>Compartilhar Tela</strong>, o seletor nativo da placa de vídeo abrirá para você escolher o monitor ou jogo em 60 FPS.</p>
        </div>
      `;
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
      const thumbHtml = src.thumb
        ? `<img class="source-thumb" src="data:image/jpeg;base64,${src.thumb}" alt="${escapeHtml(src.title)}" />`
        : `<div class="source-thumb" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:12px;text-align:center;background:linear-gradient(135deg,#181922,#23263a);color:#dbdee1;font-size:12px;">
             <span style="font-size:26px;">${src.type === 'window' ? '🎮' : '🖥️'}</span>
             <span style="color:#57f287;font-weight:700;font-size:11px;">DirectX 11 Zero-Copy GPU</span>
           </div>`;
      card.innerHTML = `
        ${thumbHtml}
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
  // 7. CAPTURA ZERO-COPY DXGI GPU + AUDIOWORKLET UNIVERSAL (WIN11 + WIN10 + WEB)
  // =========================================================================
  let workletRegistered = false;
  state.hasPowerEfficientH264 = false;
  state.pendingAudioUnlock = false;

  async function detectGpuHardwareCodecs() {
    if (!navigator.mediaCapabilities || !navigator.mediaCapabilities.encodingInfo) return;
    // Testa primeiro High Profile 5.1/5.0/4.2 (640033 / 640032 / 64002a) que ativa o chip NVENC/AMF real da GPU (~3.9ms/quadro)!
    const candidates = [
      'video/H264; profile-level-id=640033; packetization-mode=1',
      'video/H264; profile-level-id=640032; packetization-mode=1',
      'video/H264; profile-level-id=64002a; packetization-mode=1',
      'video/H264; profile-level-id=4d0032; packetization-mode=1',
      'video/H264; profile-level-id=4d002a; packetization-mode=1',
    ];
    for (const ct of candidates) {
      try {
        const info = await navigator.mediaCapabilities.encodingInfo({
          type: 'webrtc',
          video: { contentType: ct, width: 1920, height: 1080, bitrate: 12000000, framerate: 60 },
        });
        if (info && info.supported && info.powerEfficient) {
          state.hasPowerEfficientH264 = true;
          updateLocalProfileUI();
          break;
        }
      } catch (e) {}
    }
  }
  detectGpuHardwareCodecs();
  setTimeout(() => { if (!state.hasPowerEfficientH264) detectGpuHardwareCodecs(); }, 900);
  setTimeout(() => { if (!state.hasPowerEfficientH264) detectGpuHardwareCodecs(); }, 2400);

  async function startSystemAudioCaptureWithoutDiscord(wsProto, overrideSourceId = null) {
    if (state.streamSettings.audioMode === 'none') return null;

    try {
      if (!state.audioCtx) {
        try {
          state.audioCtx = new (window.AudioContext || window.webkitAudioContext)({
            sampleRate: 48000,
            latencyHint: 'interactive',
          });
        } catch (e) {
          state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
      }
      if (state.audioCtx.state === 'suspended') {
        await state.audioCtx.resume();
      }

      state.audioDestNode = state.audioCtx.createMediaStreamDestination();

      let workletNode = null;
      let fallbackScriptNode = null;
      let jsRingL = null;
      let jsRingR = null;
      let jsWritePos = 0;
      let jsReadPos = 0;
      let jsAvail = 0;

      if (state.audioCtx.audioWorklet) {
        try {
          if (!workletRegistered) {
            const workletCode = `
              class ScPcmProcessor extends AudioWorkletProcessor {
                constructor() {
                  super();
                  this.ringL = new Float32Array(48000);
                  this.ringR = new Float32Array(48000);
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
                    this.available += frames;
                    // Impede acúmulo de atraso (>120ms): crava sincronia em ~45ms!
                    if (this.available > 5760) {
                      this.readPos = (this.writePos - 2160 + cap) % cap;
                      this.available = 2160;
                    }
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
          // numberOfInputs: 0 garante que o Chromium trate o nó como gerador ativo e NUNCA o suspenda!
          workletNode = new AudioWorkletNode(state.audioCtx, 'sc-pcm-worklet', {
            numberOfInputs: 0,
            numberOfOutputs: 1,
            outputChannelCount: [2],
          });
          workletNode.connect(state.audioDestNode);
          state.activeWorkletNode = workletNode;
        } catch (e) {
          workletNode = null;
        }
      }

      // Fallback caso o navegador esteja em HTTP LAN sem suporte a AudioWorklet
      if (!workletNode && state.audioCtx.createScriptProcessor) {
        jsRingL = new Float32Array(48000);
        jsRingR = new Float32Array(48000);
        fallbackScriptNode = state.audioCtx.createScriptProcessor(1024, 0, 2);
        fallbackScriptNode.onaudioprocess = (ev) => {
          const outL = ev.outputBuffer.getChannelData(0);
          const outR = ev.outputBuffer.getChannelData(1);
          const n = outL.length;
          if (jsAvail < n) {
            outL.fill(0);
            outR.fill(0);
            return;
          }
          const cap = jsRingL.length;
          for (let i = 0; i < n; i++) {
            outL[i] = jsRingL[jsReadPos];
            outR[i] = jsRingR[jsReadPos];
            jsReadPos = (jsReadPos + 1) % cap;
          }
          jsAvail -= n;
        };
        fallbackScriptNode.connect(state.audioDestNode);
        state.activeWorkletNode = fallbackScriptNode;
      }

      const audioSource = overrideSourceId || state.selectedSourceId;
      const audioWsUrl = `${wsProto}//${window.location.host}/ws-audio?mode=${encodeURIComponent(
        state.streamSettings.audioMode
      )}&source=${encodeURIComponent(audioSource)}`;

      const audioWs = new WebSocket(audioWsUrl);
      audioWs.binaryType = 'arraybuffer';
      state.localAudioWs = audioWs;

      const wsConnected = await new Promise((resolve) => {
        const timer = setTimeout(() => resolve(false), 600);
        audioWs.onopen = () => {
          clearTimeout(timer);
          resolve(true);
        };
        audioWs.onerror = () => {
          clearTimeout(timer);
          resolve(false);
        };
      });

      if (!wsConnected) {
        try { audioWs.close(); } catch (e) {}
        state.localAudioWs = null;
        return null;
      }

      audioWs.onmessage = (ev) => {
        if (!state.audioDestNode) return;
        if (state.audioCtx && state.audioCtx.state === 'suspended') {
          state.audioCtx.resume().catch(() => {});
        }
        if (workletNode) {
          workletNode.port.postMessage(ev.data, [ev.data]);
        } else if (fallbackScriptNode && jsRingL) {
          const pcm16 = new Int16Array(ev.data);
          const frames = pcm16.length >> 1;
          const cap = jsRingL.length;
          for (let i = 0, j = 0; i < frames; i++, j += 2) {
            jsRingL[jsWritePos] = pcm16[j] * 0.000030517578125;
            jsRingR[jsWritePos] = pcm16[j + 1] * 0.000030517578125;
            jsWritePos = (jsWritePos + 1) % cap;
          }
          jsAvail += frames;
          if (jsAvail > 5760) {
            jsReadPos = (jsWritePos - 2160 + cap) % cap;
            jsAvail = 2160;
          }
        }
      };

      return state.audioDestNode.stream.getAudioTracks()[0] || null;
    } catch (e) {
      return null;
    }
  }

  async function acquireZeroCopyGpuStream(cfg, resSpec, includeDisplayAudio = false) {
    // Captura 100% DirectX 11 / WGC Zero-Copy Nativa do Chromium para TODAS as Telas (Monitor 1, Monitor 2+) e Janelas de Jogos (Deadlock, CS2, Vulkan/DX12)!
    if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
      // IMPORTANTE (GPU Zero-Copy Real): NÃO passar width/height no getDisplayMedia!
      // Redimensionar no getDisplayMedia força o Chromium a copiar VRAM -> RAM (CPU Readback + libyuv),
      // derrubando o FPS do jogo e travando a captura em ~40-45 FPS.
      // O downscale para 720p/1080p é feito 100% na GPU via scaleResolutionDownBy no NVENC/D3D11!
      // Em monitores 2K/1440p (14.7 MB/frame), pedir max:60 no getDisplayMedia faz o timer interno do Chromium
      // somar 16.6ms + ~5.5ms de captura = 22.2ms (~45 FPS teto). Pedir 120 FPS na captura (8.3ms) e limitar em
      // 60 FPS no RTCRtpSender (maxFramerate) entrega 60 FPS cravados em qualquer tela!
      const captureFps = cfg.fps >= 60 ? 120 : cfg.fps;
      const vConstraints = {
        frameRate: { ideal: captureFps, max: captureFps },
        resizeMode: 'none',
      };
      try {
        const dxgiStream = await navigator.mediaDevices.getDisplayMedia({
          video: vConstraints,
          audio: includeDisplayAudio,
          selfBrowserSurface: 'exclude',
          surfaceSwitching: 'include',
          monitorTypeSurfaces: 'include',
        });
        if (dxgiStream && dxgiStream.getVideoTracks().length > 0) {
          return { stream: dxgiStream, cancelled: false };
        }
      } catch (e) {
        if (e && (e.name === 'NotAllowedError' || e.name === 'AbortError')) {
          return { stream: null, cancelled: true };
        }
      }
    }

    return { stream: null, cancelled: false };
  }

  async function startBrowserOrMobileCapture(cfg, resSpec) {
    let mediaStream = null;
    const wantAudio = cfg.audioMode !== 'none';

    if (state.selectedSourceId === 'web:display' && navigator.mediaDevices?.getDisplayMedia) {
      // IMPORTANTE (GPU Zero-Copy Real): NÃO passar width/height no getDisplayMedia!
      // Redimensionar no getDisplayMedia força o Chromium a copiar VRAM -> RAM (CPU Readback + libyuv),
      // derrubando o FPS do jogo e travando a captura em ~40-45 FPS.
      // O downscale para 720p/1080p é feito 100% na GPU via scaleResolutionDownBy no NVENC/D3D11!
      // Em monitores 2K/1440p (14.7 MB/frame), pedir max:60 no getDisplayMedia faz o timer interno do Chromium
      // somar 16.6ms + ~5.5ms de captura = 22.2ms (~45 FPS teto). Pedir 120 FPS na captura (8.3ms) e limitar em
      // 60 FPS no RTCRtpSender (maxFramerate) entrega 60 FPS cravados em qualquer tela!
      const captureFps = cfg.fps >= 60 ? 120 : cfg.fps;
      const vConstraints = {
        frameRate: { ideal: captureFps, max: captureFps },
        resizeMode: 'none',
      };
      mediaStream = await navigator.mediaDevices.getDisplayMedia({
        video: vConstraints,
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
      try { vTrack.contentHint = cfg.preset === 'detail' ? 'detail' : 'motion'; } catch (e) {}
      vTrack.onended = () => stopScreenShare(true);
    }

    return mediaStream;
  }

  async function startLegacyCsharpCapture(cfg, resSpec, wsProto) {
    const sysAudioTrack = await startSystemAudioCaptureWithoutDiscord(wsProto);
    ensureFallbackCanvas();
    const wsUrl = `${wsProto}//${window.location.host}/ws-capture?source=${encodeURIComponent(
      state.selectedSourceId
    )}&height=${resSpec.heightNum}&fps=${cfg.fps}&detail=${cfg.preset === 'detail' ? 1 : 0}`;

    const capWs = new WebSocket(wsUrl);
    capWs.binaryType = 'blob';
    state.localCaptureWs = capWs;

    capWs.onmessage = async (ev) => {
      if (!state.isStreaming || state.localCaptureWs !== capWs) return;
      state.nextFrameBlob = ev.data;
      state.bytesTransferredThisSec += ev.data.size;
      if (state.decodingFrame) return;

      state.decodingFrame = true;
      try {
        while (state.nextFrameBlob && state.isStreaming) {
          const blob = state.nextFrameBlob;
          state.nextFrameBlob = null;
          const bmp = await createImageBitmap(blob);
          if (!state.isStreaming || state.localCaptureWs !== capWs) {
            bmp.close();
            break;
          }
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
    capWs.onclose = () => {
      if (state.localCaptureWs !== capWs || !state.isStreaming) return;
      stopScreenShare(true);
      showToast('A conexão com a captura de tela foi encerrada.', '⚠️');
    };

    const legacyStream = state.captureCanvas.captureStream(cfg.fps);
    const cvTrack = legacyStream.getVideoTracks()[0];
    if (cvTrack) {
      try { cvTrack.contentHint = cfg.preset === 'detail' ? 'detail' : 'motion'; } catch (e) {}
    }
    if (sysAudioTrack) {
      legacyStream.addTrack(sysAudioTrack);
    }
    return legacyStream;
  }

  // =========================================================================
  // 7B. MOTOR NATIVO GPU (DXGI ddagrab -> NVENC/AMF/QSV -> DataChannel -> WebCodecs)
  // Zero cópia VRAM->RAM, 60 FPS cravados em 2K/1080p/720p sem queda de FPS no jogo!
  // =========================================================================
  const GPU_DC_MAX_CHUNK = 14336;
  const GPU_DC_HDR_SIZE = 18;

  function parseAvcCodecFromAnnexB(u8) {
    if (!u8 || u8.length < 8) return 'avc1.640033';
    for (let i = 0; i <= u8.length - 7; i++) {
      let scLen = 0;
      if (u8[i] === 0 && u8[i + 1] === 0) {
        if (u8[i + 2] === 1) scLen = 3;
        else if (u8[i + 2] === 0 && u8[i + 3] === 1) scLen = 4;
      }
      if (scLen > 0) {
        const nalIdx = i + scLen;
        if (nalIdx + 3 < u8.length && (u8[nalIdx] & 0x1f) === 7) {
          const p = u8[nalIdx + 1].toString(16).padStart(2, '0');
          const c = u8[nalIdx + 2].toString(16).padStart(2, '0');
          const l = u8[nalIdx + 3].toString(16).padStart(2, '0');
          return `avc1.${p}${c}${l}`;
        }
      }
    }
    return 'avc1.640033';
  }

  function sendNativeGpuFrameToChannel(dc, entry, frameInfo) {
    if (!dc || dc.readyState !== 'open') return;
    if (dc.bufferedAmount > 1536 * 1024) {
      entry.gpuAwaitKey = true;
      return;
    }
    if (entry.gpuAwaitKey && !frameInfo.isKey) return;
    if (frameInfo.isKey) entry.gpuAwaitKey = false;

    const payload = frameInfo.payload;
    const totalChunks = Math.max(1, Math.ceil(payload.byteLength / GPU_DC_MAX_CHUNK));
    for (let idx = 0; idx < totalChunks; idx++) {
      const start = idx * GPU_DC_MAX_CHUNK;
      const end = Math.min(payload.byteLength, start + GPU_DC_MAX_CHUNK);
      const sliceLen = end - start;
      const pkt = new Uint8Array(GPU_DC_HDR_SIZE + sliceLen);
      const dv = new DataView(pkt.buffer);
      dv.setUint32(0, frameInfo.seq, true);
      dv.setUint16(4, idx, true);
      dv.setUint16(6, totalChunks, true);
      dv.setUint8(8, frameInfo.isKey ? 1 : 0);
      dv.setUint8(9, 0);
      dv.setUint32(10, frameInfo.tsMs, true);
      dv.setUint16(14, frameInfo.width, true);
      dv.setUint16(16, frameInfo.height, true);
      pkt.set(payload.subarray(start, end), GPU_DC_HDR_SIZE);
      try {
        dc.send(pkt);
      } catch (_) {
        entry.gpuAwaitKey = true;
        break;
      }
    }
  }

  function broadcastNativeGpuFrame(frameInfo) {
    if (frameInfo.isKey) {
      state.nativeGpuLastKeyframe = frameInfo;
    }
    state.framesCapturedCount++;
    state.bytesTransferredThisSec += frameInfo.payload.byteLength;
    for (const entry of state.screenOutPcs.values()) {
      if (entry && entry.gpuDataChannel && entry.gpuDataChannel.readyState === 'open') {
        sendNativeGpuFrameToChannel(entry.gpuDataChannel, entry, frameInfo);
      }
    }
  }

  async function tryStartNativeGpuCapture(cfg, resSpec, wsProto) {
    if (!IS_LOCAL_HOST || state.sourceTab !== 'monitor' || typeof VideoDecoder === 'undefined') {
      return null;
    }
    let status = null;
    try {
      const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const tmr = ctrl ? setTimeout(() => ctrl.abort(), 700) : null;
      const r = await fetch('/api/gpu-engine-status?t=' + Date.now(), {
        cache: 'no-store',
        signal: ctrl ? ctrl.signal : undefined,
      });
      if (tmr) clearTimeout(tmr);
      if (r.ok) status = await r.json();
    } catch (_) {
      return null;
    }
    if (!status || !status.ready) {
      if (status && !status.downloading) {
        fetch('/api/gpu-engine-install', { method: 'POST' }).catch(() => {});
      }
      return null;
    }

    state.nativeGpuEncoder = status.encoder || 'h264_nvenc';
    const targetH = cfg.resolution === 'source' ? 0 : (resSpec.heightNum || 1080);
    const reqBitrate = Math.min(12000, Math.max(3000, Number(cfg.bitrateKbps) || 8000));
    const wsUrl = `${wsProto}//${window.location.host}/ws-gpu-video?monitor=0&height=${targetH}&fps=${cfg.fps}&bitrate=${reqBitrate}`;

    return await new Promise((resolve) => {
      let settled = false;
      const gpuWs = new WebSocket(wsUrl);
      gpuWs.binaryType = 'arraybuffer';

      const failTimer = setTimeout(() => {
        if (!settled) {
          settled = true;
          try { gpuWs.close(); } catch (_) {}
          resolve(null);
        }
      }, 2400);

      gpuWs.onmessage = (ev) => {
        if (!(ev.data instanceof ArrayBuffer) || ev.data.byteLength <= 17) return;
        const dv = new DataView(ev.data);
        const isKey = (dv.getUint8(0) & 1) === 1;
        const seq = dv.getUint32(1, true);
        const tsMs = dv.getUint32(5, true);
        const width = dv.getUint16(9, true);
        const height = dv.getUint16(11, true);
        const payloadLen = dv.getUint32(13, true);
        if (17 + payloadLen > ev.data.byteLength) return;
        const payload = new Uint8Array(ev.data, 17, payloadLen);

        state.nativeGpuWidth = width;
        state.nativeGpuHeight = height;
        const frameInfo = { seq, tsMs, isKey, width, height, payload };

        if (!settled) {
          settled = true;
          clearTimeout(failTimer);
          state.nativeGpuWs = gpuWs;
          state.nativeGpuActive = true;
          state.nativeGpuLastKeyframe = isKey ? frameInfo : null;
          resolve(gpuWs);
        }
        if (state.isStreaming && state.nativeGpuWs === gpuWs) {
          broadcastNativeGpuFrame(frameInfo);
        }
      };

      gpuWs.onerror = () => {
        if (!settled) {
          settled = true;
          clearTimeout(failTimer);
          resolve(null);
        }
      };

      gpuWs.onclose = () => {
        if (!settled) {
          settled = true;
          clearTimeout(failTimer);
          resolve(null);
        } else if (state.nativeGpuWs === gpuWs && state.isStreaming) {
          stopScreenShare(true);
          showToast('Captura nativa GPU encerrada.', '⚠️');
        }
      };
    });
  }

  function attachGpuVideoDataChannel(ws, inEntry, dc) {
    if (!ws || !dc || typeof VideoDecoder === 'undefined') return;
    dc.binaryType = 'arraybuffer';
    inEntry.gpuDataChannel = dc;

    let canvas = ws.gpuCanvasEl;
    if (!canvas && ws.videoEl && ws.videoEl.parentElement) {
      canvas = document.createElement('canvas');
      canvas.className = 'gpu-video-canvas hidden';
      ws.videoEl.parentElement.insertBefore(canvas, ws.videoEl.nextSibling);
      ws.gpuCanvasEl = canvas;
    }
    const ctx = canvas ? canvas.getContext('2d', { alpha: false, desynchronized: true }) : null;

    let decoder = null;
    let decoderConfigured = false;
    let awaitingKey = true;
    const assemblies = new Map();
    const frameQueue = [];
    let rafId = 0;
    ws.gpuFramesDecoded = 0;
    ws.gpuBytesReceived = 0;
    ws.gpuWidth = 0;
    ws.gpuHeight = 0;
    ws.gpuActive = true;

    const renderLoop = () => {
      if (ws.inEntry !== inEntry) {
        while (frameQueue.length > 0) {
          try { frameQueue.shift().close(); } catch (_) {}
        }
        rafId = 0;
        return;
      }
      // Mantém fila enxuta (máx 2 quadros) para absorver bursts de rede SCTP sem aumentar latência
      while (frameQueue.length > 2) {
        try { frameQueue.shift().close(); } catch (_) {}
      }
      if (frameQueue.length > 0 && canvas && ctx) {
        const frame = frameQueue.shift();
        try {
          if (canvas.width !== frame.displayWidth || canvas.height !== frame.displayHeight) {
            canvas.width = frame.displayWidth;
            canvas.height = frame.displayHeight;
          }
          if (canvas.classList.contains('hidden')) {
            canvas.classList.remove('hidden');
            if (ws.videoEl) ws.videoEl.classList.add('hidden');
          }
          ctx.drawImage(frame, 0, 0, canvas.width, canvas.height);
        } finally {
          frame.close();
        }
      }
      rafId = requestAnimationFrame(renderLoop);
    };
    rafId = requestAnimationFrame(renderLoop);

    const createDecoder = (codecStr) => {
      if (decoder) {
        try { decoder.close(); } catch (_) {}
      }
      decoder = new VideoDecoder({
        output: (frame) => {
          if (ws.inEntry !== inEntry) {
            frame.close();
            return;
          }
          ws.gpuFramesDecoded = (ws.gpuFramesDecoded || 0) + 1;
          ws.gpuWidth = frame.displayWidth;
          ws.gpuHeight = frame.displayHeight;
          if (!ws.webrtcVideoActive) {
            ws.webrtcVideoActive = true;
            setStreamCardStatus(ws, null);
            if (ws.watchRetryTimer) {
              clearInterval(ws.watchRetryTimer);
              ws.watchRetryTimer = null;
            }
            if (ws.natWarningTimer) {
              clearTimeout(ws.natWarningTimer);
              ws.natWarningTimer = null;
            }
          }
          // Se acumular > 3 quadros decodificados antes do VSync, descarta o mais antigo sem quebrar H.264
          while (frameQueue.length >= 3) {
            try { frameQueue.shift().close(); } catch (_) {}
          }
          frameQueue.push(frame);
        },
        error: () => {
          decoderConfigured = false;
          awaitingKey = true;
        },
      });
      decoder.configure({
        codec: codecStr || 'avc1.640033',
        optimizeForLatency: true,
        hardwareAcceleration: 'prefer-hardware',
      });
      decoderConfigured = true;
      inEntry.gpuDecoder = decoder;
    };

    dc.onmessage = (ev) => {
      if (ws.inEntry !== inEntry || !(ev.data instanceof ArrayBuffer) || ev.data.byteLength <= GPU_DC_HDR_SIZE) return;
      const dv = new DataView(ev.data);
      const seq = dv.getUint32(0, true);
      const chunkIdx = dv.getUint16(4, true);
      const chunkCount = dv.getUint16(6, true);
      const isKey = (dv.getUint8(8) & 1) === 1;
      const tsMs = dv.getUint32(10, true);
      const chunkData = new Uint8Array(ev.data, GPU_DC_HDR_SIZE);

      let auBytes = null;
      if (chunkCount <= 1) {
        auBytes = chunkData;
      } else {
        let asm = assemblies.get(seq);
        if (!asm) {
          if (assemblies.size > 12) {
            const oldestKey = assemblies.keys().next().value;
            assemblies.delete(oldestKey);
          }
          asm = { count: chunkCount, received: 0, parts: new Array(chunkCount), totalLen: 0 };
          assemblies.set(seq, asm);
        }
        if (!asm.parts[chunkIdx]) {
          asm.parts[chunkIdx] = new Uint8Array(chunkData);
          asm.received++;
          asm.totalLen += chunkData.byteLength;
        }
        if (asm.received === asm.count) {
          assemblies.delete(seq);
          auBytes = new Uint8Array(asm.totalLen);
          let off = 0;
          for (let i = 0; i < asm.count; i++) {
            auBytes.set(asm.parts[i], off);
            off += asm.parts[i].byteLength;
          }
        }
      }

      if (!auBytes) return;
      ws.gpuBytesReceived = (ws.gpuBytesReceived || 0) + auBytes.byteLength;

      if (awaitingKey && !isKey) return;
      if (!decoderConfigured) {
        if (!isKey) return;
        try {
          createDecoder(parseAvcCodecFromAnnexB(auBytes));
        } catch (_) {
          return;
        }
      }

      try {
        if (decoder && decoder.state === 'configured') {
          if (decoder.decodeQueueSize > 10 && !isKey) {
            awaitingKey = true;
            return;
          }
          if (isKey) awaitingKey = false;
          decoder.decode(new EncodedVideoChunk({
            type: isKey ? 'key' : 'delta',
            timestamp: tsMs * 1000,
            data: auBytes,
          }));
        }
      } catch (_) {
        decoderConfigured = false;
        awaitingKey = true;
      }
    };
  }

  async function startNativeScreenShare() {
    void ensureTurnQuotaChecked();
    if (turnQuotaState.locked) {
      triggerTurnQuotaLockScreen(turnQuotaState);
      return;
    }
    stopScreenShare(false);

    if (els.captureEngineSelect && els.captureEngineSelect.value) {
      state.streamSettings.captureEngine = els.captureEngineSelect.value;
      localStorage.setItem('streamcord_engine', state.streamSettings.captureEngine);
    }
    if (els.audioModeSelect && els.audioModeSelect.value) {
      state.streamSettings.audioMode = els.audioModeSelect.value;
      localStorage.setItem('streamcord_audio', state.streamSettings.audioMode);
    }
    if (els.resolutionSelect && els.resolutionSelect.value) {
      state.streamSettings.resolution = els.resolutionSelect.value;
      localStorage.setItem('streamcord_res', state.streamSettings.resolution);
    }
    if (els.fpsSelect && els.fpsSelect.value) {
      state.streamSettings.fps = Number(els.fpsSelect.value);
      localStorage.setItem('streamcord_fps', String(state.streamSettings.fps));
    }
    if (els.presetSelect && els.presetSelect.value) {
      state.streamSettings.preset = els.presetSelect.value;
      localStorage.setItem('streamcord_preset', state.streamSettings.preset);
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
    } else if (cfg.captureEngine !== 'legacy_csharp') {
      // 1. Tenta Motor Nativo GPU 100% Zero-Copy (DXGI ddagrab -> NVENC/AMF/QSV direto na VRAM, 60 FPS cravados em 2K!)
      const nativeGpuWs = await tryStartNativeGpuCapture(cfg, resSpec, wsProto);
      if (nativeGpuWs) {
        const sysAudioTrack = await startSystemAudioCaptureWithoutDiscord(wsProto, 'monitor:0');
        state.localScreenStream = new MediaStream(sysAudioTrack ? [sysAudioTrack] : []);
      } else {
        // 2. Fallback automático: Seletor Nativo Chromium getDisplayMedia (janelas específicas ou GPU ainda baixando)
        const gpuRes = await acquireZeroCopyGpuStream(cfg, resSpec, false);
        if (gpuRes.cancelled) {
          showToast('Seleção de tela cancelada.', '⚠️');
          return;
        }

        if (gpuRes.stream) {
          const dxgiStream = gpuRes.stream;
          const vTrack = dxgiStream.getVideoTracks()[0];
          let audioSourceArg = state.selectedSourceId;
          if (vTrack) {
            try { vTrack.contentHint = cfg.preset === 'detail' ? 'detail' : 'motion'; } catch (e) {}
            vTrack.onended = () => stopScreenShare(true);
            if (cfg.audioMode === 'window_only' && vTrack.label) {
              const hwndMatch = vTrack.label.match(/^window:(\d+)/i);
              if (hwndMatch) {
                audioSourceArg = `window:${hwndMatch[1]}`;
              } else if (!vTrack.label.startsWith('screen:')) {
                audioSourceArg = `wtitle:${vTrack.label}`;
              }
            }
          }
          const sysAudioTrack = await startSystemAudioCaptureWithoutDiscord(wsProto, audioSourceArg);
          if (sysAudioTrack) {
            dxgiStream.addTrack(sysAudioTrack);
          }
          state.localScreenStream = dxgiStream;
        } else {
          state.localScreenStream = await startLegacyCsharpCapture(cfg, resSpec, wsProto);
          showToast('Motor GPU indisponível neste dispositivo; usando modo compatibilidade C#.', 'ℹ️');
        }
      }
    } else {
      state.localScreenStream = await startLegacyCsharpCapture(cfg, resSpec, wsProto);
    }

    state.isStreaming = true;
    document.body.classList.add('is-streaming-local');
    state.showSelfPreview = isMobileDevice;
    els.streamModal.classList.add('hidden');

    const hasAudioTrack = state.localScreenStream.getAudioTracks().length > 0;
    playDiscordSound('stream-start');
    showToast(
      `Transmissão Turbo ${resSpec.label} @ ${cfg.fps}FPS ${hasAudioTrack ? '+ Áudio Ativo' : '(Sem Áudio)'}!`,
      '🔴'
    );
    if (hasAudioTrack && state.hasNativeBackend && cfg.audioMode !== 'none') {
      setTimeout(async () => {
        if (!state.isStreaming) return;
        try {
          const hRes = await fetch('/api/health', { cache: 'no-store' });
          if (!hRes.ok) return;
          const h = await hRes.json();
          if (h.audioLoopbackStatus === 'standard_fallback_with_discord') {
            showToast(
              '⚠️ Seu Windows não suporta isolamento WASAPI por app (Win 10 antigo): o som do Discord pode vazar. Atualize p/ Win 11 ou use modo Sem Áudio.',
              '⚠️'
            );
          }
        } catch (_) {}
      }, 900);
    }
    setMobileTab('stage');

    announcePresence(false);
    updateStreamControlsUI();
    if (state.watchedStreams.size === 0 || state.watchedStreams.has(state.clientId)) {
      openSelfPreviewCard();
    }
  }

  function stopScreenShare(notify = true) {
    const wasStreaming = state.isStreaming;
    state.isStreaming = false;
    document.body.classList.remove('is-streaming-local');
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
    if (state.nativeGpuWs) {
      try { state.nativeGpuWs.close(); } catch (e) {}
      state.nativeGpuWs = null;
    }
    state.nativeGpuActive = false;
    state.nativeGpuLastKeyframe = null;
    state.nativeGpuWidth = 0;
    state.nativeGpuHeight = 0;
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
      if (entry.watchdogTimer) clearTimeout(entry.watchdogTimer);
      try { entry.pc.close(); } catch (e) {}
    }
    state.screenOutPcs.clear();

    if (state.watchedStreams.has(state.clientId)) {
      closeWatchedStream(state.clientId, false);
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
  // 8. MOTOR WEBRTC GPU HIGH PROFILE 640032 (~3.9ms/QUADRO) + ÁUDIO ESTÉREO
  // =========================================================================
  function getH264LevelRank(fmtp) {
    const m = fmtp.match(/profile-level-id=([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i);
    if (!m) return 0;
    const profileIdc = parseInt(m[1], 16);
    const levelIdc = parseInt(m[3], 16);
    // High Profile (0x64 = 100) e Main Profile (0x4d = 77) Nível >= 4.2 (0x2a = 42) rodam 100% no chip NVENC/AMF!
    // Baseline Nível 3.1 (42e01f / 42001f) roda em CPU OpenH264 lento e limita resolução!
    let score = levelIdc;
    if (profileIdc === 0x64) score += 1000;
    else if (profileIdc === 0x4d && levelIdc >= 0x28) score += 600;
    return score;
  }

  function preferOptimalGameCodec(pc, forceAlt = false) {
    try {
      if (!RTCRtpSender.getCapabilities) return;
      const caps = RTCRtpSender.getCapabilities('video');
      if (!caps || !caps.codecs) return;

      const gpuHighH264 = [];
      const av1List = [];
      const vp9List = [];
      const vp8List = [];
      const lowH264 = [];
      const restCodecs = [];

      for (const c of caps.codecs) {
        const mime = (c.mimeType || '').toLowerCase();
        const fmtp = (c.sdpFmtpLine || '').toLowerCase();
        if (mime === 'video/h264' && fmtp.includes('packetization-mode=1')) {
          const rank = getH264LevelRank(fmtp);
          if (rank >= 600) {
            gpuHighH264.push({ c, rank });
          } else {
            lowH264.push(c);
          }
        } else if (mime === 'video/av1') {
          av1List.push(c);
        } else if (mime === 'video/vp9') {
          vp9List.push(c);
        } else if (mime === 'video/vp8') {
          vp8List.push(c);
        } else {
          restCodecs.push(c);
        }
      }

      gpuHighH264.sort((a, b) => b.rank - a.rank);
      const sortedGpuH264 = gpuHighH264.map((x) => x.c);

      const preset = state.streamSettings.preset;
      const preferred = forceAlt || preset === 'vp8'
        ? vp8List
        : preset === 'av1' ? av1List : sortedGpuH264;
      const ordered = [...new Set([
        ...preferred, ...sortedGpuH264, ...lowH264, ...vp8List, ...vp9List, ...av1List, ...restCodecs,
      ])];

      if (ordered.length === 0) return;

      for (const tr of pc.getTransceivers()) {
        if (tr.sender && tr.sender.track && tr.sender.track.kind === 'video' && tr.setCodecPreferences) {
          tr.setCodecPreferences(ordered);
        }
      }
    } catch (e) {}
  }

  function preferStereoOpus(sdp) {
    return sdp.replace(
      /a=fmtp:(\d+) minptime=10;useinbandfec=1/g,
      'a=fmtp:$1 minptime=10;useinbandfec=1;stereo=1;sprop-stereo=1;maxaveragebitrate=192000'
    );
  }

  // Injeta piso (x-google-min-bitrate), partida rápida (x-google-start-bitrate) e teto (b=AS) no SDP
  // para impedir que o estimador do WebRTC comece frio e derrube a imagem nos primeiros segundos!
  function tuneVideoBitrateSdp(sdp, maxKbps) {
    if (!sdp || !Number.isFinite(maxKbps)) return sdp;
    const clampedMax = Math.max(1200, Math.min(25000, Math.round(maxKbps)));
    const startKbps = Math.min(clampedMax, 4000);
    const minKbps = Math.min(clampedMax, 1500);
    const lines = sdp.split(/\r?\n/);
    const out = [];
    let inVideo = false;
    let videoPayloads = new Set();
    let insertedBandwidth = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('m=')) {
        inVideo = line.startsWith('m=video ');
        insertedBandwidth = false;
        videoPayloads = new Set();
        if (inVideo) {
          const parts = line.trim().split(/\s+/);
          for (let p = 3; p < parts.length; p++) videoPayloads.add(parts[p]);
        }
        out.push(line);
        continue;
      }

      if (inVideo && line.startsWith('b=AS:')) {
        out.push(`b=AS:${clampedMax}`);
        insertedBandwidth = true;
        continue;
      }

      if (inVideo && line.startsWith('c=IN ') && !insertedBandwidth) {
        out.push(line);
        out.push(`b=AS:${clampedMax}`);
        insertedBandwidth = true;
        continue;
      }

      if (inVideo && line.startsWith('a=fmtp:')) {
        const m = line.match(/^a=fmtp:(\d+)\s+(.+)$/);
        if (m && videoPayloads.has(m[1]) && !/apt=/i.test(m[2])) {
          let fmtp = m[2].trim();
          if (!/x-google-start-bitrate=/i.test(fmtp)) fmtp += `;x-google-start-bitrate=${startKbps}`;
          if (!/x-google-min-bitrate=/i.test(fmtp)) fmtp += `;x-google-min-bitrate=${minKbps}`;
          if (!/x-google-max-bitrate=/i.test(fmtp)) fmtp += `;x-google-max-bitrate=${clampedMax}`;
          out.push(`a=fmtp:${m[1]} ${fmtp}`);
          continue;
        }
      }

      out.push(line);
    }
    return out.join('\r\n');
  }

  // Teto adaptativo econômico por rota e resolução:
  // • P2P Direto: libera até 25 Mbps (custo 0 GB na Cloudflare!)
  // • TURN UDP (Cloudflare): 720p -> 2.0 Mbps (~0.9 GB/h), 1080p -> 3.5 Mbps (~1.5 GB/h), 2K+ -> 5.0 Mbps
  // • TURN TCP (último recurso): reduz mais ~25% para evitar TCP Head-of-Line Blocking
  function getTurnRelayCapBps(height, protocol) {
    const isTcp = protocol === 'tcp';
    // Sem B-frames no WebRTC, 60 FPS reais em jogos rápidos (Deadlock/FPS) exigem >= 6 Mbps em 720p e >= 8.5 Mbps em 1080p
    // para o FrameDropper do WebRTC não descartar 1 a cada 3 quadros (60 -> 40 FPS).
    if (height <= 720) return isTcp ? 4_000_000 : 6_000_000;
    if (height <= 1080) return isTcp ? 5_500_000 : 8_500_000;
    return isTcp ? 7_000_000 : 11_000_000;
  }

  function getViewerEncoding(entry = null) {
    const count = Math.max(1, state.screenOutPcs.size);
    const { bitrateKbps, fps, resolution } = state.streamSettings;
    const videoTrack = state.localScreenStream?.getVideoTracks()[0];
    const sourceHeight = videoTrack?.getSettings().height || 0;
    const selectedHeight = RESOLUTION_MAP[resolution]?.heightNum;
    const height = selectedHeight
      ? Math.min(selectedHeight, sourceHeight >= 360 ? sourceHeight : selectedHeight)
      : (sourceHeight >= 360 ? sourceHeight : 1080);

    const totalBps = Math.min(25000, Math.max(2000, Number(bitrateKbps) || 10000)) * 1000;
    const minFloorBps = entry && entry.isRelayed ? 1_500_000 : 2_500_000;
    let perViewerBps = Math.max(minFloorBps, Math.floor(totalBps / count));

    if (entry && entry.isRelayed) {
      const relayCap = getTurnRelayCapBps(height, entry.relayProtocol);
      perViewerBps = Math.min(perViewerBps, relayCap);
    }

    // Calcula o fator de escala para o encoder de hardware (NVENC/D3D11) reduzir diretamente na GPU
    // sem exigir cópia VRAM -> RAM no getDisplayMedia!
    let scale = 1;
    if (sourceHeight >= 360 && selectedHeight && sourceHeight > selectedHeight) {
      scale = sourceHeight / selectedHeight;
    }
    if (perViewerBps < 2500000 && height > 720) {
      const targetScale720 = sourceHeight >= 360 ? sourceHeight / 720 : height / 720;
      scale = Math.max(scale, Math.min(targetScale720, Math.sqrt(2500000 / perViewerBps)));
    }

    return {
      maxBitrate: perViewerBps,
      maxFramerate: fps,
      scaleResolutionDownBy: Math.round(scale * 100) / 100,
      priority: 'high',
      networkPriority: 'high',
    };
  }

  async function detectOutgoingRoute(entry) {
    if (!entry || !entry.pc || entry.pc.signalingState === 'closed') return;
    try {
      const stats = await entry.pc.getStats();
      let selectedPair = null;
      stats.forEach((r) => {
        if (r.type === 'candidate-pair' && (r.selected || (r.nominated && r.state === 'succeeded'))) {
          selectedPair = r;
        }
      });
      if (!selectedPair) return;
      const lc = selectedPair.localCandidateId ? stats.get(selectedPair.localCandidateId) : null;
      const rc = selectedPair.remoteCandidateId ? stats.get(selectedPair.remoteCandidateId) : null;
      const isRelay = Boolean((lc && lc.candidateType === 'relay') || (rc && rc.candidateType === 'relay'));
      const proto = ((lc && lc.protocol) || (rc && rc.protocol) || 'udp').toLowerCase();
      if (entry.isRelayed !== isRelay || entry.relayProtocol !== proto) {
        entry.isRelayed = isRelay;
        entry.relayProtocol = proto;
        rebalanceViewerBitrates();
      }
    } catch (_) {}
  }

  async function applyViewerEncoding(entry) {
    if (!entry.videoSender || !entry.offerSent || entry.applyingEncoding) return;
    entry.applyingEncoding = true;
    try {
      while (entry.appliedEncoding !== entry.desiredEncoding && entry.pc.signalingState !== 'closed') {
        const encoding = entry.desiredEncoding;
        const params = entry.videoSender.getParameters();
        if (!params.encodings?.length) return;
        Object.assign(params.encodings[0], encoding);
        // Prioriza 60 FPS cravados ('maintain-framerate') quando FPS > 30 ou modo movimento;
        // evita que o Chromium corte a taxa pela metade (60 -> 30 FPS) em oscilações ou no TURN!
        const targetDeg = (state.streamSettings.preset === 'detail' && (state.streamSettings.fps || 60) <= 30)
          ? 'maintain-resolution'
          : 'maintain-framerate';
        params.degradationPreference = targetDeg;
        try {
          await entry.videoSender.setParameters(params);
        } catch (degErr) {
          params.degradationPreference = 'balanced';
          await entry.videoSender.setParameters(params);
        }
        entry.appliedEncoding = encoding;
      }
    } catch (error) {
      if (entry.pc.signalingState !== 'closed') {
        console.warn('Não foi possível ajustar o envio de vídeo:', error);
      }
    } finally {
      entry.applyingEncoding = false;
    }
  }

  function rebalanceViewerBitrates() {
    for (const entry of state.screenOutPcs.values()) {
      const encoding = getViewerEncoding(entry);
      const previous = entry.desiredEncoding;
      if (!previous || Object.keys(encoding).some((key) => encoding[key] !== previous[key])) {
        entry.desiredEncoding = encoding;
      }
      void applyViewerEncoding(entry);
    }
  }

  async function startScreenOutPcForViewer(viewerId, forceRecreate = false, forceAlt = false, requestChannelId = null, allowTurn = false) {
    if (!state.isStreaming || !state.localScreenStream || viewerId === state.clientId) return;

    const viewerKnownChannel = state.onlineUsers.get(viewerId)?.channelId;
    const viewerInChannel =
      (requestChannelId && requestChannelId === state.currentChannelId) ||
      viewerKnownChannel === state.currentChannelId ||
      (!requestChannelId && !viewerKnownChannel);
    if (!viewerInChannel) return;

    const liveVideoTracks = state.localScreenStream.getVideoTracks().filter((t) => t.readyState === 'live');
    if (!state.nativeGpuActive && liveVideoTracks.length === 0) {
      publishDirect(viewerId, { type: 'stream-error', reason: 'A captura de vídeo foi encerrada pelo sistema.' });
      stopScreenShare(true);
      return;
    }

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

    if (existing) closeScreenOutPc(viewerId);
    if (allowTurn) {
      await ensureIceServersReady();
    }

    const sessionId = 's_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const pc = new RTCPeerConnection(allowTurn ? RTC_CONFIG : getP2POnlyRtcConfig());
    const outEntry = {
      pc,
      sessionId,
      allowTurn: Boolean(allowTurn),
      createdAt: Date.now(),
      offerSent: false,
      localIceBuffer: [],
      relayIceBuffer: [],
      relayFlushTimer: null,
      p2pFallbackTimer: null,
      remoteDescSet: false,
      pendingCandidates: [],
      watchdogTimer: null,
      isRelayed: false,
      relayProtocol: 'udp',
    };
    state.screenOutPcs.set(viewerId, outEntry);

    const isCurrent = () => state.screenOutPcs.get(viewerId) === outEntry;

    const triggerTurnFallback = () => {
      if (!isCurrent() || !state.isStreaming || outEntry.allowTurn) return;
      if (outEntry.p2pFallbackTimer) {
        clearTimeout(outEntry.p2pFallbackTimer);
        outEntry.p2pFallbackTimer = null;
      }
      const st = pc.connectionState || pc.iceConnectionState;
      if (st === 'connected' || st === 'completed') return;
      void startScreenOutPcForViewer(viewerId, true, forceAlt, requestChannelId, true);
    };

    if (!allowTurn) {
      // Fase 1 (P2P Estreito): tenta 100% STUN/IPv4/IPv6 sem TURN por 3.8s;
      // só recorre ao Cloudflare TURN se o P2P realmente não fechar (ex.: 4G/5G/CGNAT).
      outEntry.p2pFallbackTimer = setTimeout(triggerTurnFallback, 3800);
    }

    const sendOrQueueIce = (cand) => {
      if (!isCurrent()) return;
      if (outEntry.offerSent) {
        publishDirect(viewerId, {
          type: 'screen-ice',
          role: 'from-streamer',
          sessionId,
          candidate: cand,
        });
      } else {
        outEntry.localIceBuffer.push(cand);
      }
    };

    const flushRelayIce = () => {
      if (!isCurrent()) return;
      outEntry.relayFlushTimer = null;
      const st = pc.connectionState || pc.iceConnectionState;
      if (st === 'connected' || st === 'completed') {
        outEntry.relayIceBuffer = [];
        return;
      }
      while (outEntry.relayIceBuffer.length > 0) {
        sendOrQueueIce(outEntry.relayIceBuffer.shift());
      }
    };

    const onConnectionStateChange = () => {
      if (!isCurrent()) return;
      const connected = pc.connectionState === 'connected' ||
        (!pc.connectionState && ['connected', 'completed'].includes(pc.iceConnectionState));
      if (pc.connectionState === 'failed' || pc.iceConnectionState === 'failed' ||
          pc.signalingState === 'closed') {
        if (!outEntry.allowTurn && pc.signalingState !== 'closed') {
          triggerTurnFallback();
          return;
        }
        closeScreenOutPc(viewerId);
      } else if (connected) {
        if (outEntry.p2pFallbackTimer) {
          clearTimeout(outEntry.p2pFallbackTimer);
          outEntry.p2pFallbackTimer = null;
        }
        if (outEntry.relayFlushTimer) {
          clearTimeout(outEntry.relayFlushTimer);
          outEntry.relayFlushTimer = null;
          outEntry.relayIceBuffer = [];
        }
        // Detecta imediatamente se a conexão fechou em P2P ou TURN (UDP/TCP) e aplica o teto ótimo
        setTimeout(() => { if (isCurrent()) void detectOutgoingRoute(outEntry); }, 900);
        setTimeout(() => { if (isCurrent()) void detectOutgoingRoute(outEntry); }, 2500);
        if (!state.nativeGpuActive && !forceAlt && !outEntry.watchdogTimer) {
          outEntry.watchdogTimer = setTimeout(async () => {
            if (!isCurrent() || !state.isStreaming) return;
            try {
              const stats = await pc.getStats();
              const reports = [...stats.values()].filter((r) => r.type === 'outbound-rtp' && r.kind === 'video');
              if (isCurrent() && reports.length && reports.every((r) => r.framesSent === 0)) {
                void startScreenOutPcForViewer(viewerId, true, true, requestChannelId, outEntry.allowTurn);
              }
            } catch (e) {}
          }, 3200);
        }
      }
    };
    pc.onconnectionstatechange = onConnectionStateChange;
    pc.oniceconnectionstatechange = onConnectionStateChange;

    const stream = state.localScreenStream;
    rebalanceViewerBitrates();

    pc.onicecandidate = ({ candidate }) => {
      if (!candidate || !isCurrent()) return;
      if (isRelayCandidate(candidate)) {
        outEntry.relayIceBuffer.push(candidate);
        if (!outEntry.relayFlushTimer) {
          outEntry.relayFlushTimer = setTimeout(flushRelayIce, 1000);
        }
        return;
      }
      sendOrQueueIce(candidate);
    };

    try {
      if (state.nativeGpuActive) {
        const gpuDc = pc.createDataChannel('gpu-h264', { ordered: true });
        gpuDc.binaryType = 'arraybuffer';
        outEntry.gpuDataChannel = gpuDc;
        outEntry.gpuAwaitKey = true;
        gpuDc.onopen = () => {
          if (isCurrent() && state.nativeGpuLastKeyframe) {
            sendNativeGpuFrameToChannel(gpuDc, outEntry, state.nativeGpuLastKeyframe);
          }
        };
      }
      for (const track of stream.getTracks()) {
        if (track.kind === 'video') {
          try {
            outEntry.videoSender = pc.addTransceiver(track, {
              direction: 'sendonly',
              streams: [stream],
              sendEncodings: [outEntry.desiredEncoding],
            }).sender;
          } catch (transceiverErr) {
            outEntry.videoSender = pc.addTrack(track, stream);
          }
        } else {
          pc.addTrack(track, stream);
        }
      }
      preferOptimalGameCodec(pc, forceAlt);
      const offer = await pc.createOffer();
      if (!isCurrent()) return;
      let targetKbps = Math.round(((outEntry.desiredEncoding && outEntry.desiredEncoding.maxBitrate) || 10000000) / 1000);
      if (allowTurn) {
        const resH = RESOLUTION_MAP[state.streamSettings.resolution]?.heightNum || 1080;
        const turnCapKbps = Math.round(getTurnRelayCapBps(resH, 'udp') / 1000);
        targetKbps = Math.min(targetKbps, turnCapKbps);
      }
      offer.sdp = tuneVideoBitrateSdp(preferStereoOpus(offer.sdp), targetKbps);
      await pc.setLocalDescription(offer);
      if (!isCurrent()) return;

      outEntry.offerSent = true;
      void applyViewerEncoding(outEntry);
      publishDirect(viewerId, {
        type: 'screen-offer',
        sessionId,
        allowTurn: Boolean(allowTurn),
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
    } catch (error) {
      if (isCurrent()) {
        closeScreenOutPc(viewerId);
        publishDirect(viewerId, {
          type: 'stream-error',
          reason: (error && error.message) || 'Falha ao negociar oferta WebRTC.',
        });
        console.warn('Não foi possível abrir a transmissão para o espectador:', error);
      }
    }
  }

  function setStreamCardStatus(ws, text, isError = false) {
    if (!ws || !ws.statusOverlayEl) return;
    if (!text) {
      ws.statusOverlayEl.classList.add('hidden');
      ws.statusOverlayEl.classList.remove('is-error');
      return;
    }
    if (ws.statusTextEl) ws.statusTextEl.textContent = text;
    ws.statusOverlayEl.classList.toggle('is-error', Boolean(isError));
    ws.statusOverlayEl.classList.remove('hidden');
  }

  function refreshMultiStreamLayout() {
    const count = state.watchedStreams.size;
    const hasStreams = count > 0;

    if (els.spotlightWrapper) els.spotlightWrapper.classList.toggle('hidden', !hasStreams);
    if (els.activeStage) els.activeStage.classList.toggle('spotlight-active', hasStreams);
    if (els.dockBtnLeave) els.dockBtnLeave.classList.toggle('hidden', !hasStreams);
    if (els.dockLeaveLabel) {
      els.dockLeaveLabel.textContent = count > 1 ? `Fechar Streams (${count})` : 'Fechar Stream';
    }
    if (els.mobLiveDot) els.mobLiveDot.classList.toggle('hidden', !hasStreams);

    const watchingRemote = [...state.watchedStreams.keys()].some((id) => id !== state.clientId);
    document.body.classList.toggle('is-watching-stream', watchingRemote);

    if (state.focusedStreamerId && !state.watchedStreams.has(state.focusedStreamerId)) {
      state.focusedStreamerId = null;
    }

    const effectiveCount = state.focusedStreamerId ? 1 : count;
    if (els.multiStreamGrid) {
      els.multiStreamGrid.dataset.streams =
        effectiveCount <= 1 ? '1' : effectiveCount <= 4 ? String(effectiveCount) : 'many';
    }

    for (const [sid, ws] of state.watchedStreams.entries()) {
      if (!ws.cardEl) continue;
      const hiddenByFocus = Boolean(state.focusedStreamerId && state.focusedStreamerId !== sid);
      ws.cardEl.classList.toggle('hidden', hiddenByFocus);
      if (ws.focusBtnEl) {
        const isFocused = state.focusedStreamerId === sid;
        ws.focusBtnEl.classList.toggle('hidden', count <= 1);
        ws.focusBtnEl.classList.toggle('focus-active', isFocused);
        ws.focusBtnEl.textContent = isFocused ? `⊞ Grade (${count})` : '⛶ Focar';
      }
    }
  }

  function createStreamViewportCard(streamerId) {
    const isMe = streamerId === state.clientId;
    const u = state.onlineUsers.get(streamerId);
    const displayName = isMe ? `${state.username} (Sua Transmissão)` : `Transmissão de ${u ? u.username : 'Amigo'}`;

    const SVG_VOL_ON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>';
    const SVG_VOL_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>';

    const card = document.createElement('article');
    card.className = 'stream-card video-viewport touch-active';
    card.dataset.streamerId = streamerId;

    card.innerHTML = `
      <div class="video-zoom-container stream-media-wrap">
        <video autoplay muted playsinline></video>
        <audio autoplay></audio>
      </div>

      <div class="viewer-status-overlay hidden">
        <div class="viewer-status-box">
          <div class="viewer-status-spinner"></div>
          <p class="viewer-status-text">Conectando à transmissão...</p>
          <button type="button" class="overlay-ctrl-btn btn-card-retry">Reconectar</button>
        </div>
      </div>

      <div class="self-preview-saver hidden">
        <div class="saver-box">
          <div class="saver-badge">MODO ALTA PERFORMANCE ATIVO (60 FPS)</div>
          <h3>Você está transmitindo sua tela com áudio</h3>
          <p>Para não consumir sua GPU nem derrubar o FPS do seu jogo, a prévia da sua própria tela fica oculta por padrão.</p>
          <button type="button" class="btn btn-primary btn-card-show-preview">Mostrar Minha Prévia</button>
        </div>
      </div>

      <div class="stream-overlay-top">
        <div class="stream-owner">
          <span class="stream-owner-name card-streamer-name">${escapeHtml(displayName)}</span>
          <span class="stream-res-text mono card-res-badge">1080p</span>
        </div>
        <div class="stream-telemetry-strip">
          <span class="badge-live">AO VIVO</span>
          <span class="badge-transport mono card-route-badge" title="Rota da Conexão">P2P</span>
          <span class="stream-metrics-text mono">
            <span class="card-fps-badge">-- FPS</span>
            <span>·</span>
            <span class="card-bitrate-badge">-- Mbps</span>
          </span>
        </div>
      </div>

      <div class="stream-overlay-bottom">
        <div class="stream-controls-left">
          <div class="volume-group stream-volume-group">
            <button type="button" class="overlay-ctrl-btn is-icon-only btn-card-mute" title="Silenciar ou ativar áudio">${isMe ? SVG_VOL_OFF : SVG_VOL_ON}</button>
            <input type="range" class="volume-slider card-volume-slider" min="0" max="100" value="100" title="Volume desta Transmissão" />
            <span class="volume-value mono card-volume-label">100%</span>
          </div>
        </div>

        <div class="stream-controls-right">
          <button type="button" class="overlay-ctrl-btn btn-card-hide-preview hidden">Ocultar Prévia</button>
          <button type="button" class="overlay-ctrl-btn btn-card-focus hidden" title="Expandir / Voltar à Grade">Focar</button>
          <button type="button" class="overlay-ctrl-btn btn-card-zoom" title="Alternar zoom da tela">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>
            <span class="zoom-text">Zoom</span>
          </button>
          <button type="button" class="overlay-ctrl-btn btn-card-pip" title="Picture-in-Picture">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"></rect><rect x="12" y="9" width="8" height="6" rx="1" fill="currentColor"></rect></svg>
            PiP
          </button>
          <button type="button" class="overlay-ctrl-btn is-icon-only btn-card-reconnect" title="Reconectar Stream">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"></path><path d="M21 3v6h-6"></path></svg>
          </button>
          <button type="button" class="overlay-ctrl-btn btn-card-fit" title="Ajustar / Preencher">Ajustar</button>
          <button type="button" class="overlay-ctrl-btn btn-card-full" title="Tela cheia">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>
            Tela Cheia
          </button>
          <button type="button" class="overlay-ctrl-btn is-icon-only btn-card-close" title="Fechar esta stream">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
      </div>
    `;

    const ws = {
      streamerId,
      isMe,
      cardEl: card,
      zoomContainerEl: card.querySelector('.video-zoom-container'),
      videoEl: card.querySelector('video'),
      audioEl: card.querySelector('audio'),
      statusOverlayEl: card.querySelector('.viewer-status-overlay'),
      statusTextEl: card.querySelector('.viewer-status-text'),
      selfPreviewSaverEl: card.querySelector('.self-preview-saver'),
      btnShowPreviewEl: card.querySelector('.btn-card-show-preview'),
      btnHidePreviewEl: card.querySelector('.btn-card-hide-preview'),
      streamerNameEl: card.querySelector('.card-streamer-name'),
      routeBadgeEl: card.querySelector('.card-route-badge'),
      resBadgeEl: card.querySelector('.card-res-badge'),
      fpsBadgeEl: card.querySelector('.card-fps-badge'),
      mbpsBadgeEl: card.querySelector('.card-bitrate-badge'),
      muteBtnEl: card.querySelector('.btn-card-mute'),
      volumeSliderEl: card.querySelector('.card-volume-slider'),
      volumeLabelEl: card.querySelector('.card-volume-label'),
      focusBtnEl: card.querySelector('.btn-card-focus'),
      zoomBtnEl: card.querySelector('.btn-card-zoom'),
      zoomLevel: 1,
      volume: 100,
      muted: isMe || state.locallyMutedUsers.has(streamerId),
      pendingAudioUnlock: false,
      webrtcVideoActive: false,
      offerReceived: false,
      inEntry: null,
      watchRetryTimer: null,
      natWarningTimer: null,
    };

    if (isMe) {
      card.querySelector('.stream-volume-group').classList.add('hidden');
      card.querySelector('.btn-card-reconnect').classList.add('hidden');
    }

    let idleTimer = null;
    const wakeHud = () => {
      card.classList.remove('idle-cursor');
      card.classList.add('touch-active');
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        if (state.watchedStreams.has(streamerId) && (ws.webrtcVideoActive || isMe)) {
          card.classList.add('idle-cursor');
          card.classList.remove('touch-active');
        }
      }, 2600);
    };
    card.addEventListener('mousemove', wakeHud);
    card.addEventListener('touchstart', wakeHud, { passive: true });

    card.querySelector('.btn-card-retry').onclick = () => watchFriendStream(streamerId, true);
    card.querySelector('.btn-card-reconnect').onclick = () => {
      watchFriendStream(streamerId, true);
      showToast(`Reconectando à stream de ${u ? u.username : 'Amigo'}...`, '🔄');
    };
    card.querySelector('.btn-card-close').onclick = () => closeWatchedStream(streamerId);
    ws.focusBtnEl.onclick = () => {
      state.focusedStreamerId = state.focusedStreamerId === streamerId ? null : streamerId;
      refreshMultiStreamLayout();
    };
    ws.zoomBtnEl.onclick = () => {
      ws.zoomLevel = ws.zoomLevel === 1 ? 1.5 : ws.zoomLevel === 1.5 ? 2 : 1;
      ws.zoomContainerEl.style.transform = `scale(${ws.zoomLevel})`;
      ws.zoomBtnEl.classList.toggle('is-active', ws.zoomLevel > 1);
      const zTxt = ws.zoomBtnEl.querySelector('.zoom-text');
      if (zTxt) zTxt.textContent = ws.zoomLevel > 1 ? `Zoom ${ws.zoomLevel}x` : 'Zoom';
    };
    card.querySelector('.btn-card-fit').onclick = () => ws.videoEl.classList.toggle('fit-cover');
    card.querySelector('.btn-card-full').onclick = () => {
      if (!document.fullscreenElement) {
        if (card.requestFullscreen) card.requestFullscreen().catch(() => {});
        else if (ws.videoEl.webkitEnterFullscreen) ws.videoEl.webkitEnterFullscreen();
      } else {
        document.exitFullscreen().catch(() => {});
      }
    };
    card.querySelector('.btn-card-pip').onclick = async () => {
      try {
        if (document.pictureInPictureElement) await document.exitPictureInPicture();
        else if (ws.videoEl.requestPictureInPicture) await ws.videoEl.requestPictureInPicture();
      } catch (e) {
        showToast('Modo Picture-in-Picture requer vídeo ativo.', '📺');
      }
    };

    ws.volumeSliderEl.oninput = () => {
      const v = Number(ws.volumeSliderEl.value);
      ws.volume = v;
      ws.muted = v === 0;
      if (ws.audioEl) {
        ws.audioEl.volume = v / 100;
        ws.audioEl.muted = ws.muted;
        if (v > 0) {
          ws.pendingAudioUnlock = false;
          ws.audioEl.play().catch(() => {});
          updateGlobalUnmuteBanner();
        }
      }
      ws.muteBtnEl.innerHTML = ws.muted ? SVG_VOL_OFF : SVG_VOL_ON;
      ws.volumeLabelEl.textContent = `${v}%`;
    };

    ws.muteBtnEl.onclick = () => {
      ws.muted = !ws.muted;
      if (ws.audioEl) {
        ws.audioEl.muted = ws.muted;
        if (!ws.muted) {
          ws.pendingAudioUnlock = false;
          ws.audioEl.play().catch(() => {});
          updateGlobalUnmuteBanner();
        }
      }
      ws.muteBtnEl.innerHTML = ws.muted ? SVG_VOL_OFF : SVG_VOL_ON;
    };

    ws.btnShowPreviewEl.onclick = () => {
      state.showSelfPreview = true;
      applySelfPreviewVisibility();
    };
    ws.btnHidePreviewEl.onclick = () => {
      state.showSelfPreview = false;
      applySelfPreviewVisibility();
    };

    if (els.multiStreamGrid) els.multiStreamGrid.appendChild(card);
    return ws;
  }

  function updateGlobalUnmuteBanner() {
    if (!els.btnMobileUnmute) return;
    const anyLocked = [...state.watchedStreams.values()].some((w) => w.pendingAudioUnlock);
    els.btnMobileUnmute.classList.toggle('hidden', !anyLocked);
  }

  function ensureWatchedStreamCard(streamerId) {
    let ws = state.watchedStreams.get(streamerId);
    if (!ws) {
      ws = createStreamViewportCard(streamerId);
      state.watchedStreams.set(streamerId, ws);
    }
    refreshMultiStreamLayout();
    renderStageParticipants();
    return ws;
  }

  function openSelfPreviewCard() {
    const ws = ensureWatchedStreamCard(state.clientId);
    setStreamCardStatus(ws, null);
    applySelfPreviewVisibility();
  }

  function applySelfPreviewVisibility() {
    const ws = state.watchedStreams.get(state.clientId);
    if (!ws) return;
    if (state.showSelfPreview && state.localScreenStream) {
      ws.selfPreviewSaverEl.classList.add('hidden');
      ws.btnHidePreviewEl.classList.remove('hidden');
      ws.videoEl.srcObject = state.localScreenStream;
      ws.videoEl.muted = true;
      ws.videoEl.play().catch(() => {});
    } else {
      ws.videoEl.srcObject = null;
      ws.selfPreviewSaverEl.classList.remove('hidden');
      ws.btnHidePreviewEl.classList.add('hidden');
    }
  }

  function watchFriendStream(streamerId, force = false) {
    if (turnQuotaState.locked) {
      triggerTurnQuotaLockScreen(turnQuotaState);
      return;
    }
    if (streamerId === state.clientId) {
      openSelfPreviewCard();
      setMobileTab('stage');
      return;
    }

    const existingWs = state.watchedStreams.get(streamerId);
    if (!force && existingWs && existingWs.webrtcVideoActive && existingWs.videoEl.videoWidth > 0) {
      if (state.watchedStreams.size > 1 && state.focusedStreamerId !== streamerId) {
        state.focusedStreamerId = streamerId;
        refreshMultiStreamLayout();
      }
      setStreamCardStatus(existingWs, null);
      setMobileTab('stage');
      return;
    }

    const ws = ensureWatchedStreamCard(streamerId);
    setMobileTab('stage');

    if (force && ws.inEntry && ws.inEntry.pc) {
      try { ws.inEntry.pc.close(); } catch (e) {}
      ws.inEntry = null;
    }
    if (ws.watchRetryTimer) {
      clearInterval(ws.watchRetryTimer);
      ws.watchRetryTimer = null;
    }
    if (ws.natWarningTimer) {
      clearTimeout(ws.natWarningTimer);
      ws.natWarningTimer = null;
    }

    ws.webrtcVideoActive = false;
    ws.offerReceived = false;
    const u = state.onlineUsers.get(streamerId);
    setStreamCardStatus(ws, `⏳ Solicitando transmissão de ${u ? u.username : 'Amigo'}...`);
    publishDirect(streamerId, { type: 'watch-request', channelId: state.currentChannelId, force });

    ws.watchRetryTimer = setInterval(() => {
      if (!state.watchedStreams.has(streamerId) || ws.webrtcVideoActive) {
        clearInterval(ws.watchRetryTimer);
        ws.watchRetryTimer = null;
        return;
      }
      // Só reenvia watch-request se ainda não recebeu oferta OU se o ICE falhou/fechou
      const st = ws.inEntry?.pc ? (ws.inEntry.pc.connectionState || ws.inEntry.pc.iceConnectionState) : null;
      if (!ws.offerReceived || st === 'failed' || st === 'closed' || st === 'disconnected') {
        if (!ws.offerReceived) {
          setStreamCardStatus(ws, `⏳ Aguardando resposta de ${u ? u.username : 'Amigo'}...`);
        }
        publishDirect(streamerId, {
          type: 'watch-request',
          channelId: state.currentChannelId,
          force: true,
          retry: true,
        });
      }
    }, 7500);
  }

  function closeWatchedStream(streamerId, notifyStreamer = true) {
    const ws = state.watchedStreams.get(streamerId);
    if (!ws) return;
    if (notifyStreamer && streamerId !== state.clientId) {
      publishDirect(streamerId, { type: 'stop-watching' });
    }
    if (ws.watchRetryTimer) clearInterval(ws.watchRetryTimer);
    if (ws.natWarningTimer) clearTimeout(ws.natWarningTimer);
    if (ws.inEntry && ws.inEntry.gpuDecoder) {
      try { ws.inEntry.gpuDecoder.close(); } catch (e) {}
    }
    if (ws.inEntry && ws.inEntry.pc) {
      try { ws.inEntry.pc.close(); } catch (e) {}
    }
    ws.videoEl.srcObject = null;
    if (ws.audioEl) ws.audioEl.srcObject = null;
    if (ws.cardEl && ws.cardEl.parentNode) ws.cardEl.remove();
    state.watchedStreams.delete(streamerId);
    if (state.focusedStreamerId === streamerId) state.focusedStreamerId = null;
    updateGlobalUnmuteBanner();
    refreshMultiStreamLayout();
    renderStageParticipants();
  }

  function closeAllWatchedStreams() {
    for (const sid of [...state.watchedStreams.keys()]) {
      closeWatchedStream(sid, sid !== state.clientId);
    }
  }

  function unlockPendingRemoteAudio() {
    for (const ws of state.watchedStreams.values()) {
      if (!ws.pendingAudioUnlock || !ws.audioEl || !ws.audioEl.srcObject) continue;
      const desiredVol = ws.volume / 100;
      ws.audioEl.volume = desiredVol > 0 ? desiredVol : 1;
      ws.audioEl.muted = ws.muted;
      ws.audioEl
        .play()
        .then(() => {
          ws.pendingAudioUnlock = false;
          updateGlobalUnmuteBanner();
        })
        .catch(() => {});
    }
  }

  window.addEventListener(
    'pointerdown',
    () => {
      state.hasUserInteracted = true;
      unlockPendingRemoteAudio();
    },
    { passive: true }
  );
  window.addEventListener(
    'keydown',
    () => {
      state.hasUserInteracted = true;
      unlockPendingRemoteAudio();
    },
    { passive: true }
  );

  async function handleIncomingScreenOffer(streamerId, sdp, sessionId, allowTurn = true) {
    const ws = state.watchedStreams.get(streamerId);
    if (!ws) return;

    if (ws.inEntry && ws.inEntry.sessionId === sessionId) {
      return;
    }

    if (ws.inEntry) {
      if (ws.inEntry.relayFlushTimer) clearTimeout(ws.inEntry.relayFlushTimer);
      if (ws.inEntry.gpuDecoder) {
        try { ws.inEntry.gpuDecoder.close(); } catch (e) {}
      }
      if (ws.inEntry.pc) {
        try { ws.inEntry.pc.close(); } catch (e) {}
      }
    }
    if (ws.natWarningTimer) {
      clearTimeout(ws.natWarningTimer);
      ws.natWarningTimer = null;
    }

    ws.offerReceived = true;
    setStreamCardStatus(ws, allowTurn ? '🌐 Conectando via rota segura TURN...' : '🔗 Oferta P2P recebida, conectando direto...');
    if (allowTurn) {
      await ensureIceServersReady();
    }
    const pc = new RTCPeerConnection(allowTurn ? RTC_CONFIG : getP2POnlyRtcConfig());
    const earlyCandidates = (sessionId && state.earlyIceBySession.get(sessionId)) || [];
    if (sessionId) state.earlyIceBySession.delete(sessionId);

    const inEntry = {
      pc,
      streamerId,
      sessionId,
      allowTurn: Boolean(allowTurn),
      createdAt: Date.now(),
      remoteVideoStream: new MediaStream(),
      answerSent: false,
      localIceBuffer: [],
      relayIceBuffer: [],
      relayFlushTimer: null,
      remoteDescSet: false,
      pendingCandidates: [...earlyCandidates],
    };
    ws.inEntry = inEntry;

    const sendOrQueueViewerIce = (cand) => {
      if (ws.inEntry !== inEntry) return;
      if (inEntry.answerSent) {
        publishDirect(streamerId, {
          type: 'screen-ice',
          role: 'from-viewer',
          sessionId,
          candidate: cand,
        });
      } else {
        inEntry.localIceBuffer.push(cand);
      }
    };

    const flushViewerRelayIce = () => {
      if (ws.inEntry !== inEntry) return;
      inEntry.relayFlushTimer = null;
      const st = pc.connectionState || pc.iceConnectionState;
      if (st === 'connected' || st === 'completed') {
        inEntry.relayIceBuffer = [];
        return;
      }
      while (inEntry.relayIceBuffer.length > 0) {
        sendOrQueueViewerIce(inEntry.relayIceBuffer.shift());
      }
    };

    const updateIceUi = () => {
      if (ws.inEntry !== inEntry || !state.watchedStreams.has(streamerId)) return;
      const st = pc.connectionState || pc.iceConnectionState;
      if (st === 'connected' || st === 'completed') {
        if (inEntry.relayFlushTimer) {
          clearTimeout(inEntry.relayFlushTimer);
          inEntry.relayFlushTimer = null;
          inEntry.relayIceBuffer = [];
        }
      }
      if (ws.webrtcVideoActive) return;
      if (st === 'checking' || st === 'connecting') {
        setStreamCardStatus(ws, '🌐 Estabelecendo rota direta P2P (STUN)...');
        if (!ws.natWarningTimer) {
          ws.natWarningTimer = setTimeout(() => {
            if (ws.inEntry === inEntry && !ws.webrtcVideoActive && state.watchedStreams.has(streamerId)) {
              const curSt = pc.connectionState || pc.iceConnectionState;
              if (curSt === 'checking' || curSt === 'connecting' || curSt === 'new') {
                setStreamCardStatus(ws, '🌐 Atravessando roteador/NAT... Se demorar, peça ao amigo para liberar no Firewall ou usar a versão Web.');
              }
            }
          }, 8000);
        }
      } else if (st === 'connected' || st === 'completed') {
        setStreamCardStatus(ws, '📡 P2P conectado, aguardando primeiro quadro...');
      } else if (st === 'failed' || st === 'closed') {
        if (!inEntry.allowTurn && st === 'failed') {
          setStreamCardStatus(ws, '🌐 P2P bloqueado pelo NAT — ativando rota TURN automaticamente...');
        } else {
          setStreamCardStatus(ws, '⚠️ Conexão P2P bloqueada pelo NAT/Firewall. Clique em Reconectar.', true);
        }
      } else if (st === 'disconnected') {
        setStreamCardStatus(ws, '⚠️ Conexão instável, tentando restabelecer...', true);
      }
    };
    pc.oniceconnectionstatechange = updateIceUi;
    pc.onconnectionstatechange = updateIceUi;

    pc.onicecandidate = ({ candidate }) => {
      if (!candidate || ws.inEntry !== inEntry) return;
      if (isRelayCandidate(candidate)) {
        inEntry.relayIceBuffer.push(candidate);
        if (!inEntry.relayFlushTimer) {
          inEntry.relayFlushTimer = setTimeout(flushViewerRelayIce, 1000);
        }
        return;
      }
      sendOrQueueViewerIce(candidate);
    };

    pc.ondatachannel = (ev) => {
      if (ws.inEntry !== inEntry || !state.watchedStreams.has(streamerId)) return;
      if (ev.channel && ev.channel.label === 'gpu-h264') {
        attachGpuVideoDataChannel(ws, inEntry, ev.channel);
      }
    };

    pc.ontrack = (ev) => {
      if (ws.inEntry !== inEntry || !state.watchedStreams.has(streamerId)) return;
      if (ev.receiver) {
        try {
          // 40ms de buffer leve no receptor absorve jitter do TURN sem descartar quadros (60FPS cravados)
          if ('playoutDelayHint' in ev.receiver) ev.receiver.playoutDelayHint = 0.04;
          if ('jitterBufferTarget' in ev.receiver) ev.receiver.jitterBufferTarget = 40;
        } catch (_) {}
      }
      if (ev.track.kind === 'video') {
        if (!inEntry.remoteVideoStream.getTracks().some((t) => t.id === ev.track.id)) {
          inEntry.remoteVideoStream.addTrack(ev.track);
        }
        ws.videoEl.playsInline = true;
        ws.videoEl.autoplay = true;
        ws.videoEl.muted = true;
        if (ws.videoEl.srcObject !== inEntry.remoteVideoStream) {
          ws.videoEl.srcObject = inEntry.remoteVideoStream;
        }
        ws.videoEl.play().catch(() => {});

        const markVideoReady = () => {
          if (ws.inEntry !== inEntry || !state.watchedStreams.has(streamerId)) return false;
          if (ws.videoEl.videoWidth > 0 && ws.videoEl.readyState >= 2) {
            ws.webrtcVideoActive = true;
            if (ws.natWarningTimer) {
              clearTimeout(ws.natWarningTimer);
              ws.natWarningTimer = null;
            }
            setStreamCardStatus(ws, null);
            return true;
          }
          return false;
        };
        ws.videoEl.onloadeddata = markVideoReady;
        ws.videoEl.onplaying = markVideoReady;

        const checkDecoded = setInterval(() => {
          if (ws.inEntry !== inEntry || !state.watchedStreams.has(streamerId) || markVideoReady()) {
            clearInterval(checkDecoded);
          }
        }, 120);
      } else if (ev.track.kind === 'audio' && ws.audioEl) {
        const audioStream = new MediaStream([ev.track]);
        ws.audioEl.srcObject = audioStream;
        ws.audioEl.volume = ws.volume / 100;
        ws.audioEl.muted = ws.muted || state.locallyMutedUsers.has(streamerId);

        ws.audioEl
          .play()
          .then(() => {
            ws.pendingAudioUnlock = false;
            updateGlobalUnmuteBanner();
          })
          .catch(() => {
            ws.pendingAudioUnlock = true;
            updateGlobalUnmuteBanner();
          });
      }
    };

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      inEntry.remoteDescSet = true;

      for (const c of inEntry.pendingCandidates) {
        try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch (e) {}
      }
      inEntry.pendingCandidates = [];

      const answer = await pc.createAnswer();
      answer.sdp = tuneVideoBitrateSdp(preferStereoOpus(answer.sdp), 15000);
      await pc.setLocalDescription(answer);
      if (ws.inEntry !== inEntry) return;

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
    } catch (e) {
      if (ws.inEntry === inEntry) {
        setStreamCardStatus(ws, '⚠️ Falha ao responder oferta WebRTC. Clique em Reconectar.', true);
      }
    }
  }

  function outEntryCleanupOldSessions() {
    if (state.earlyIceBySession.size > 20) {
      state.earlyIceBySession.clear();
    }
  }

  if (els.btnMobileUnmute) {
    els.btnMobileUnmute.onclick = () => {
      for (const ws of state.watchedStreams.values()) {
        ws.pendingAudioUnlock = false;
        if (!ws.isMe && ws.audioEl) {
          ws.muted = false;
          ws.volume = 100;
          ws.audioEl.muted = false;
          ws.audioEl.volume = 1;
          ws.audioEl.play().catch(() => {});
          if (ws.muteBtnEl) ws.muteBtnEl.textContent = '🔊';
          if (ws.volumeSliderEl) ws.volumeSliderEl.value = '100';
          if (ws.volumeLabelEl) ws.volumeLabelEl.textContent = '100%';
        }
      }
      updateGlobalUnmuteBanner();
    };
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

  // Telemetria a cada 1s (Individual por Card Multi-Stream + HUD)
  const previousVideoStats = new WeakMap();

  function sampleVideoStats(pc, report) {
    const previous = previousVideoStats.get(pc);
    const outbound = report.type === 'outbound-rtp';
    const frames = outbound ? report.framesSent : report.framesDecoded;
    const bytes = outbound ? report.bytesSent : report.bytesReceived;
    previousVideoStats.set(pc, { id: report.id, timestamp: report.timestamp, frames, bytes });
    const elapsed = previous?.id === report.id ? (report.timestamp - previous.timestamp) / 1000 : 0;
    const validInterval = elapsed > 0 && elapsed <= 5;
    return {
      fps: report.framesPerSecond ?? (validInterval && frames >= previous.frames
        ? (frames - previous.frames) / elapsed : null),
      mbps: validInterval && bytes >= previous.bytes
        ? ((bytes - previous.bytes) * 8 / elapsed / 1_000_000).toFixed(1) : null,
    };
  }

  setInterval(async () => {
    const hudVisible = Boolean(els.rtcTelemetryHud && !els.rtcTelemetryHud.classList.contains('hidden'));
    const hasVisibleCards = [...state.watchedStreams.values()].some(
      (w) => w.cardEl && !w.cardEl.classList.contains('hidden') && !w.cardEl.classList.contains('idle-cursor')
    );

    if ((document.hidden && state.isStreaming) || (!hudVisible && !hasVisibleCards)) {
      state.framesCapturedCount = 0;
      state.bytesTransferredThisSec = 0;
      state.lastStatsTime = performance.now();
      return;
    }

    const now = performance.now();
    const dt = Math.max(0.5, (now - state.lastStatsTime) / 1000);
    state.lastStatsTime = now;

    let outFps = Math.round(state.framesCapturedCount / dt);
    let outMbps = ((state.bytesTransferredThisSec * 8) / dt / 1_000_000).toFixed(1);
    state.framesCapturedCount = 0;
    state.bytesTransferredThisSec = 0;

    const targetResSpec = RESOLUTION_MAP[state.streamSettings.resolution] || RESOLUTION_MAP['1080'];
    let outRes = `${targetResSpec.width}×${targetResSpec.height}`;

    if (state.isStreaming && state.localScreenStream) {
      if (state.nativeGpuActive) {
        if (state.nativeGpuWidth && state.nativeGpuHeight) {
          outRes = `${state.nativeGpuWidth}×${state.nativeGpuHeight}`;
        }
        if (els.statCodec) {
          const encLabel = state.nativeGpuEncoder === 'h264_amf' ? 'AMF' : (state.nativeGpuEncoder === 'h264_qsv' ? 'QSV' : 'NVENC');
          const anyRelay = [...state.screenOutPcs.values()].some((e) => e && e.isRelayed);
          const routeLabel = state.screenOutPcs.size === 0 ? ' • DXGI' : (anyRelay ? ' • TURN' : ' • P2P');
          els.statCodec.textContent = `H264 ${encLabel} (GPU)${routeLabel}`;
        }
      } else {
        const vt = state.localScreenStream.getVideoTracks()[0];
        if (vt && vt.getSettings) {
          const s = vt.getSettings();
          if (s.width && s.height) outRes = `${s.width}×${s.height}`;
          if (!state.localCaptureWs) outFps = null;
        }
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
            if (r.type !== 'outbound-rtp' || r.kind !== 'video') return;
            const sample = sampleVideoStats(activeOut.pc, r);
            outFps = sample.fps;
            outMbps = sample.mbps;
            if (r.frameWidth && r.frameHeight) outRes = `${r.frameWidth}×${r.frameHeight}`;
            if (els.statCodec) {
              const codec = stats.get(r.codecId)?.mimeType?.split('/')[1] || 'WebRTC';
              let routeTag = '';
              stats.forEach((p) => {
                if (p.type === 'candidate-pair' && (p.selected || (p.nominated && p.state === 'succeeded'))) {
                  const lc = p.localCandidateId ? stats.get(p.localCandidateId) : null;
                  const rc = p.remoteCandidateId ? stats.get(p.remoteCandidateId) : null;
                  const isRelay = (lc && lc.candidateType === 'relay') || (rc && rc.candidateType === 'relay');
                  const proto = (lc && lc.protocol) || (rc && rc.protocol) || 'udp';
                  const capMbps = Math.round((getTurnRelayCapBps(r.frameHeight || 1080, proto.toLowerCase()) / 1_000_000) * 10) / 10;
                  const capLabel = isRelay ? ` ${capMbps}M` : '';
                  routeTag = isRelay ? ` • TURN ${proto.toUpperCase()}${capLabel}` : ` • P2P`;
                }
              });
              const qlr = r.qualityLimitationReason && r.qualityLimitationReason !== 'none'
                ? ` ⚠️${r.qualityLimitationReason === 'bandwidth' ? 'Rede' : r.qualityLimitationReason.toUpperCase()}`
                : '';
              els.statCodec.textContent = `${codec}${r.powerEfficientEncoder ? ' (GPU)' : ''}${routeTag}${qlr}`;
            }
          });
        } catch (e) {}
      }

      const selfWs = state.watchedStreams.get(state.clientId);
      if (selfWs) {
        selfWs.resBadgeEl.textContent = outRes;
        selfWs.fpsBadgeEl.textContent = outFps === null ? '— FPS' : `${Math.round(outFps)} FPS`;
        selfWs.mbpsBadgeEl.textContent = outMbps === null ? '— Mbps' : `${outMbps} Mbps`;
        if (selfWs.routeBadgeEl) {
          const anyRelay = [...state.screenOutPcs.values()].some((e) => e && e.isRelayed);
          selfWs.routeBadgeEl.classList.toggle('is-turn', anyRelay);
          if (state.screenOutPcs.size === 0) {
            selfWs.routeBadgeEl.textContent = 'P2P';
          } else if (anyRelay) {
            selfWs.routeBadgeEl.textContent = 'TURN';
          } else {
            selfWs.routeBadgeEl.textContent = 'P2P';
          }
        }
      }

      // Auto-Stop por inatividade: se ficar 10 minutos transmitindo com 0 espectadores, encerra automaticamente
      if (state.screenOutPcs.size === 0) {
        if (!state._zeroViewerSince) state._zeroViewerSince = Date.now();
        else if (Date.now() - state._zeroViewerSince >= 10 * 60 * 1000) {
          state._zeroViewerSince = 0;
          appendMessage({
            type: 'system',
            text: '⏸️ Transmissão encerrada automaticamente (10 min sem nenhum espectador ativo).',
          });
          stopScreenShare(true);
        }
      } else {
        state._zeroViewerSince = 0;
      }
    }

    let firstRemoteStats = null;
    for (const ws of state.watchedStreams.values()) {
      if (ws.isMe || !ws.inEntry?.pc) continue;
      if (ws.gpuActive) {
        const rFpsNum = Math.round((ws.gpuFramesDecoded || 0) / dt);
        const rMbpsStr = (((ws.gpuBytesReceived || 0) * 8) / dt / 1_000_000).toFixed(1);
        ws.gpuFramesDecoded = 0;
        ws.gpuBytesReceived = 0;
        const rRes = (ws.gpuWidth && ws.gpuHeight) ? `${ws.gpuWidth}×${ws.gpuHeight}` : ws.resBadgeEl.textContent;
        ws.resBadgeEl.textContent = rRes;
        ws.fpsBadgeEl.textContent = `${rFpsNum} FPS`;
        ws.mbpsBadgeEl.textContent = `${rMbpsStr} Mbps`;
        if (!firstRemoteStats) {
          firstRemoteStats = {
            res: rRes,
            fps: `${rFpsNum} FPS`,
            mbps: `${rMbpsStr} Mbps`,
            codec: 'H264 GPU (DXGI)',
          };
        }
        continue;
      }
      try {
        const pc = ws.inEntry.pc;
        const stats = await pc.getStats();
        if (ws.inEntry?.pc !== pc) continue;
        stats.forEach((r) => {
          if (r.type !== 'inbound-rtp' || r.kind !== 'video') return;
          const sample = sampleVideoStats(pc, r);
          const rRes = (r.frameWidth && r.frameHeight) ? `${r.frameWidth}×${r.frameHeight}` : ws.resBadgeEl.textContent;
          const rFps = sample.fps === null ? '— FPS' : `${Math.round(sample.fps)} FPS`;
          const rMbps = sample.mbps === null ? '— Mbps' : `${sample.mbps} Mbps`;
          ws.resBadgeEl.textContent = rRes;
          ws.fpsBadgeEl.textContent = rFps;
          ws.mbpsBadgeEl.textContent = rMbps;
          let rRoute = '';
          let isRelayPair = false;
          let pairProto = 'udp';
          stats.forEach((p) => {
            if (p.type === 'candidate-pair' && (p.selected || (p.nominated && p.state === 'succeeded'))) {
              const lc = p.localCandidateId ? stats.get(p.localCandidateId) : null;
              const rc = p.remoteCandidateId ? stats.get(p.remoteCandidateId) : null;
              isRelayPair = Boolean((lc && lc.candidateType === 'relay') || (rc && rc.candidateType === 'relay'));
              pairProto = ((lc && lc.protocol) || (rc && rc.protocol) || 'udp').toUpperCase();
              rRoute = isRelayPair ? ` • TURN ${pairProto}` : ` • P2P`;
            }
          });
          if (ws.routeBadgeEl) {
            ws.routeBadgeEl.classList.toggle('is-turn', isRelayPair);
            ws.routeBadgeEl.textContent = isRelayPair ? `TURN` : 'P2P';
          }
          const connSt = document.getElementById('connection-status');
          const voiceTxt = document.getElementById('voice-state-text');
          if (connSt) connSt.classList.toggle('is-turn', isRelayPair);
          if (voiceTxt) voiceTxt.textContent = isRelayPair ? 'Relay · TURN' : 'Conectado · P2P';
          if (els.cloudStatusPill) els.cloudStatusPill.textContent = isRelayPair ? 'TURN' : 'P2P';
          if (!firstRemoteStats || state.focusedStreamerId === ws.streamerId) {
            const rCodec = stats.get(r.codecId)?.mimeType?.split('/')[1] || 'WebRTC';
            firstRemoteStats = {
              res: rRes,
              fps: rFps,
              mbps: rMbps,
              codec: `${rCodec}${r.powerEfficientDecoder ? ' (GPU)' : ''}${rRoute}`,
            };
          }
        });
      } catch (e) {}
    }

    if (hudVisible) {
      if (state.isStreaming) {
        els.statResolution.textContent = outRes;
        els.statFps.textContent = outFps === null ? '— FPS' : `${Math.round(outFps)} FPS`;
        els.statBitrate.textContent = outMbps === null ? '— Mbps' : `${outMbps} Mbps`;
      } else if (firstRemoteStats) {
        els.statResolution.textContent = firstRemoteStats.res;
        els.statFps.textContent = firstRemoteStats.fps;
        els.statBitrate.textContent = firstRemoteStats.mbps;
        if (els.statCodec && firstRemoteStats.codec) {
          els.statCodec.textContent = firstRemoteStats.codec;
        }
      } else {
        els.statResolution.textContent = outRes;
        els.statFps.textContent = '— FPS';
        els.statBitrate.textContent = '— Mbps';
      }
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
    if (state.currentChannelId !== ch.id) {
      for (const sid of [...state.watchedStreams.keys()]) {
        if (sid !== state.clientId) closeWatchedStream(sid);
      }
      for (const viewerId of [...state.screenOutPcs.keys()]) closeScreenOutPc(viewerId);
    }
    state.currentChannelId = ch.id;
    els.stageTitle.textContent = ch.name;
    els.voiceCurrentChannelName.textContent = ch.name;
    playDiscordSound('join');

    saveProfileToServer();
    updateLocalProfileUI();
    syncStreamModalControls();

    announcePresence(true);
    if (window.innerWidth <= 900) {
      setMobileTab('stage');
    }
  }

  let lastSidebarSig = '';
  let lastStageSig = '';

  function computeStateSignature() {
    const chSig = state.channels.map((c) => `${c.id}:${c.name}`).join(',');
    const parts = [
      state.currentChannelId || 'NONE',
      [...state.watchedStreams.keys()].join(','),
      state.focusedStreamerId || '',
      state.bannedFromRooms.has(state.roomCode) ? 'BANNED' : 'OK',
      chSig,
      [...state.locallyMutedUsers].join(','),
    ];
    for (const u of state.onlineUsers.values()) {
      parts.push(`${u.id}:${u.username}:${u.avatarColor}:${u.channelId}:${u.streaming ? 1 : 0}:${u.streamConfig?.resolution || ''}`);
    }
    return parts.join('|');
  }

  function getUserInitials(name) {
    const clean = (name || 'SC').trim();
    const parts = clean.split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return clean.slice(0, 2).toUpperCase();
  }

  function renderChannelsSidebar() {
    state.onlineUsers.set(state.clientId, getMyStateObject());
    if (document.hidden && state.isStreaming) return;
    const sig = computeStateSignature();
    if (sig === lastSidebarSig) return;
    lastSidebarSig = sig;

    els.channelsContainer.innerHTML = '';
    const chCountEl = document.getElementById('channel-count');
    if (chCountEl) chCountEl.textContent = String(state.channels.length);

    if (els.headerChannelPills) {
      els.headerChannelPills.innerHTML = '';
    }

    for (const ch of state.channels) {
      const usersInCh = getUsersInChannel(ch.id);
      const hasLiveInCh = usersInCh.some((u) => u.streaming);
      const isCurrent = state.currentChannelId === ch.id;

      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `channel-btn${isCurrent ? ' is-active' : ''}`;
      btn.innerHTML = `
        <span class="channel-btn-left">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="23 7 16 12 23 17 23 7"></polygon>
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
          </svg>
          <span class="channel-name">${escapeHtml(ch.name)}</span>
        </span>
        <span class="channel-meta mono${hasLiveInCh ? ' has-live' : ''}">
          ${hasLiveInCh ? 'AO VIVO' : usersInCh.length > 0 ? String(usersInCh.length) : 'Livre'}
        </span>
      `;
      btn.onclick = () => switchChannel(ch.id);
      btn.oncontextmenu = (e) => openChannelContextMenu(e, ch);
      li.appendChild(btn);
      els.channelsContainer.appendChild(li);
    }

    // Renderiza seção "Na Sala Agora" exatamente igual ao modelo Google AI Studio
    const memberListEl = document.getElementById('member-list');
    const memberCountEl = document.getElementById('member-count');
    const allUsers = [...state.onlineUsers.values()];
    if (memberCountEl) memberCountEl.textContent = String(allUsers.length);
    if (memberListEl) {
      memberListEl.innerHTML = '';
      allUsers.forEach((u) => {
        const isSelf = u.id === state.clientId;
        const li = document.createElement('li');
        li.className = 'member-row';
        const roleLabel = u.streaming ? 'Transmitindo' : isSelf ? 'Você' : 'Online';
        li.innerHTML = `
          <div class="member-left">
            <span class="avatar${isSelf ? ' is-self' : ''}">${escapeHtml(getUserInitials(u.username))}</span>
            <span class="member-name">${escapeHtml(u.username)}</span>
          </div>
          <span class="member-role"${u.streaming ? ' style="color:var(--status-live);font-weight:600;"' : ''}>${roleLabel}</span>
        `;
        li.oncontextmenu = (e) => openUserContextMenu(e, u);
        if (u.streaming) {
          li.style.cursor = 'pointer';
          li.title = 'Clique para assistir esta transmissão';
          li.onclick = () => {
            if (isSelf) openSelfPreviewCard();
            else watchFriendStream(u.id);
          };
        }
        memberListEl.appendChild(li);
      });
    }
  }

  function renderStageParticipants() {
    if (document.hidden && state.isStreaming) return;
    const sig = computeStateSignature();
    if (sig === lastStageSig) return;
    lastStageSig = sig;

    els.participantsGrid.innerHTML = '';

    if (state.bannedFromRooms.has(state.roomCode)) {
      els.participantsGrid.dataset.count = '1';
      els.participantsGrid.innerHTML = `
        <div class="disconnected-stage-card">
          <div style="font-size:32px;">🚫</div>
          <h3>Você foi banido desta sala</h3>
          <p style="font-size:12.5px;color:var(--text-muted);">Entre em outra sala usando o botão de código da sala no topo.</p>
        </div>
      `;
      return;
    }

    if (!state.currentChannelId) {
      els.participantsGrid.dataset.count = '1';
      const firstCh = state.channels[0];
      els.participantsGrid.innerHTML = `
        <div class="disconnected-stage-card">
          <div style="font-size:32px;">🎧</div>
          <h3>Desconectado da chamada</h3>
          <p style="font-size:12.5px;color:var(--text-muted);">Escolha um canal à esquerda ou clique abaixo para voltar.</p>
          ${firstCh ? `<button type="button" class="btn-go-live" id="btn-rejoin-first-ch">Entrar em ${escapeHtml(firstCh.name)}</button>` : ''}
        </div>
      `;
      const rejoinBtn = document.getElementById('btn-rejoin-first-ch');
      if (rejoinBtn && firstCh) rejoinBtn.onclick = () => switchChannel(firstCh.id);
      return;
    }

    const users = getUsersInChannel(state.currentChannelId);
    const cnt = users.length;
    els.participantsGrid.dataset.count = cnt <= 1 ? '1' : cnt === 2 ? '2' : cnt <= 4 ? '4' : 'many';

    users.forEach((u) => {
      const isMe = u.id === state.clientId;
      const isWatched = state.watchedStreams.has(u.id);
      const isLocallyMuted = state.locallyMutedUsers.has(u.id);
      const tile = document.createElement('div');
      tile.className = `participant-tile ${u.streaming ? 'streaming-tile' : ''} ${isWatched ? 'is-watched-tile' : ''}`;
      tile.style.setProperty('--tile-tint', `${u.avatarColor || '#5865F2'}44`);
      const initial = (u.username || 'A')[0].toUpperCase();

      let badgeHtml = '';
      if (u.streaming) {
        const specText = u.streamConfig ? `${u.streamConfig.resolution} ${u.streamConfig.fps}FPS` : '1080p 60FPS';
        const ctaText = isWatched ? `Assistindo ✓ • ${specText}` : `Assistir • ${specText}`;
        badgeHtml = `<div class="tile-live-corner">AO VIVO</div><div class="watch-stream-cta">${ctaText}</div>`;
      }

      tile.innerHTML = `
        <div class="tile-avatar" style="background:${u.avatarColor}">${initial}</div>
        ${badgeHtml}
        <div class="tile-name-bar">
          <span class="tile-name-pill">${escapeHtml(u.username)} ${isMe ? '(Você)' : ''}</span>
          <span class="tile-status-icons">${isLocallyMuted ? '🔇' : u.streaming ? '🖥️🔊' : '🎧'}</span>
        </div>
      `;

      tile.onclick = () => {
        if (u.streaming) {
          if (isMe) openSelfPreviewCard();
          else watchFriendStream(u.id);
        }
      };
      tile.oncontextmenu = (e) => openUserContextMenu(e, u);
      els.participantsGrid.appendChild(tile);
    });
  }

  function updateLocalProfileUI() {
    const initials = getUserInitials(state.username);
    els.localUsername.textContent = state.username;
    els.localAvatar.textContent = initials;
    const lobbyAv = document.getElementById('lobby-avatar-preview');
    if (lobbyAv) lobbyAv.textContent = initials;
    const chatTag = document.getElementById('chat-room-tag');
    if (chatTag) chatTag.textContent = state.roomCode;
    els.inputProfileName.value = state.username;
    els.inputRoomCode.value = state.roomCode;
    if (els.sidebarRoomCode) els.sidebarRoomCode.textContent = state.roomCode;
    if (els.headerRoomLabel) els.headerRoomLabel.textContent = state.roomCode;
    if (els.mobileModalRoom) els.mobileModalRoom.textContent = state.roomCode;

    const audioLabels = {
      pc_no_discord: 'Áudio do dispositivo',
      window_only: 'Áudio da janela',
      pc_all: 'Áudio do dispositivo',
      none: 'Somente vídeo',
    };
    const resLabel = RESOLUTION_MAP[state.streamSettings.resolution]?.label || '1080p';
    if (els.localQualityTag) els.localQualityTag.textContent = audioLabels[state.streamSettings.audioMode] || `${resLabel} · ${state.streamSettings.fps} FPS`;
    if (els.activePresetPill) els.activePresetPill.textContent = `H.264 GPU • ${resLabel.toUpperCase()} • ${state.streamSettings.fps} FPS`;
  }

  function updateStreamControlsUI() {
    updateLocalProfileUI();
    if (state.isStreaming) {
      els.btnShareScreen.classList.add('active-stream', 'btn-danger');
      els.btnShareScreen.classList.remove('btn-primary');
      els.shareBtnText.textContent = 'Encerrar Tela';
      els.dockBtnShare.classList.add('active');
      els.dockShareLabel.textContent = 'Encerrar Tela';
      if (els.mobShareLabel) els.mobShareLabel.textContent = 'Parar';
    } else {
      els.btnShareScreen.classList.remove('active-stream', 'btn-danger');
      els.btnShareScreen.classList.add('btn-primary');
      els.shareBtnText.textContent = 'Compartilhar Tela';
      els.dockBtnShare.classList.remove('active');
      els.dockShareLabel.textContent = 'Compartilhar Tela';
      if (els.mobShareLabel) els.mobShareLabel.textContent = 'Transmitir';
    }
  }

  function appendChatMessage(m) {
    const div = document.createElement('div');
    if (m.type === 'system') {
      div.className = 'chat-msg-system';
      div.textContent = m.text || '';
    } else {
      div.className = 'chat-msg';
      const time = new Date(m.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const isSelf = m.senderId === state.clientId || m.username === state.username;
      div.innerHTML = `
        <div class="chat-msg-meta">
          <span class="chat-msg-author${isSelf ? ' is-self' : ''}">${escapeHtml(m.username || 'Amigo')}</span>
          <span class="chat-msg-time mono">${time}</span>
        </div>
        <div class="chat-msg-text">${escapeHtml(m.text || '')}</div>
      `;
    }
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

    if (IS_LOCAL_HOST) {
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
    }

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
      if (els.channelManagerModal) els.channelManagerModal.classList.add('hidden');
      hideContextMenu();
    }
  });

  // =========================================================================
  // 11. EVENTOS GERAIS
  // =========================================================================
  function syncStreamModalControls() {
    if (els.captureEngineSelect) {
      els.captureEngineSelect.value = state.streamSettings.captureEngine || 'gpu_zerocopy';
    }
    if (els.resolutionSelect) {
      els.resolutionSelect.value = state.streamSettings.resolution;
    }
    if (els.fpsSelect) {
      els.fpsSelect.value = String(state.streamSettings.fps);
    }
    if (els.presetSelect) {
      els.presetSelect.value = state.streamSettings.preset;
    }
    if (els.audioModeSelect) {
      els.audioModeSelect.value = state.streamSettings.audioMode;
    }
    if (els.bitrateSlider) {
      els.bitrateSlider.value = String(state.streamSettings.bitrateKbps);
    }
    if (els.bitrateValueLabel) {
      els.bitrateValueLabel.textContent = `${(state.streamSettings.bitrateKbps / 1000).toFixed(1)} Mbps`;
    }
    if (typeof window.__syncStudioSettingsUI === 'function') {
      window.__syncStudioSettingsUI();
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
  if (els.dockBtnQuality) els.dockBtnQuality.onclick = openStreamPickerModal;
  els.btnCloseStreamModal.onclick = () => els.streamModal.classList.add('hidden');
  els.btnCancelStream.onclick = () => els.streamModal.classList.add('hidden');

  els.tabMonitors.onclick = () => {
    state.sourceTab = 'monitor';
    if (state.selectedSourceId.startsWith('web:')) state.selectedSourceId = 'monitor:0';
    els.tabMonitors.classList.add('active', 'is-active');
    els.tabWindows.classList.remove('active', 'is-active');
    if (els.tabBrowserCam) els.tabBrowserCam.classList.remove('active', 'is-active');
    if (state.streamSettings.captureEngine === 'legacy_csharp' && state.nativeSources.length === 0) {
      loadNativeSources();
    } else {
      renderSourcesGrid();
    }
  };

  els.tabWindows.onclick = () => {
    state.sourceTab = 'window';
    if (state.selectedSourceId.startsWith('web:')) state.selectedSourceId = 'monitor:0';
    els.tabWindows.classList.add('active', 'is-active');
    els.tabMonitors.classList.remove('active', 'is-active');
    if (els.tabBrowserCam) els.tabBrowserCam.classList.remove('active', 'is-active');
    loadNativeSources();
  };

  if (els.tabBrowserCam) {
    els.tabBrowserCam.onclick = () => {
      state.sourceTab = 'browser';
      els.tabBrowserCam.classList.add('active', 'is-active');
      els.tabMonitors.classList.remove('active', 'is-active');
      els.tabWindows.classList.remove('active', 'is-active');
      renderSourcesGrid();
    };
  }

  if (els.captureEngineSelect) {
    els.captureEngineSelect.onchange = () => {
      state.streamSettings.captureEngine = els.captureEngineSelect.value;
      localStorage.setItem('streamcord_engine', state.streamSettings.captureEngine);
      saveProfileToServer();
      loadNativeSources();
    };
  }

  els.audioModeSelect.onchange = () => {
    state.streamSettings.audioMode = els.audioModeSelect.value;
    localStorage.setItem('streamcord_audio', state.streamSettings.audioMode);
    saveProfileToServer();
  };

  els.btnRefreshSources.onclick = loadNativeSources;
  els.btnConfirmGoLive.onclick = () => startNativeScreenShare();

  if (els.btnToggleSfx) {
    els.sfxIconLabel.textContent = state.sfxEnabled ? '🔔' : '🔕';
    els.btnToggleSfx.onclick = () => {
      state.sfxEnabled = !state.sfxEnabled;
      localStorage.setItem('streamcord_sfx', state.sfxEnabled ? '1' : '0');
      els.sfxIconLabel.textContent = state.sfxEnabled ? '🔔' : '🔕';
      showToast(state.sfxEnabled ? 'Sons do aplicativo ativados' : 'Sons do aplicativo silenciados', state.sfxEnabled ? '🔔' : '🔕');
    };
  }

  if (els.presetSelect) {
    els.presetSelect.onchange = () => {
      state.streamSettings.preset = els.presetSelect.value;
      localStorage.setItem('streamcord_preset', state.streamSettings.preset);
      updateLocalProfileUI();
      saveProfileToServer();
    };
  }

  if (els.resolutionSelect) {
    els.resolutionSelect.onchange = () => {
      state.streamSettings.resolution = els.resolutionSelect.value;
      localStorage.setItem('streamcord_res', state.streamSettings.resolution);
      updateLocalProfileUI();
      saveProfileToServer();
    };
  }

  if (els.fpsSelect) {
    els.fpsSelect.onchange = () => {
      state.streamSettings.fps = Number(els.fpsSelect.value);
      localStorage.setItem('streamcord_fps', String(state.streamSettings.fps));
      updateLocalProfileUI();
      saveProfileToServer();
    };
  }

  els.bitrateSlider.oninput = () => {
    const kbps = Number(els.bitrateSlider.value);
    state.streamSettings.bitrateKbps = kbps;
    localStorage.setItem('streamcord_bitrate', String(kbps));
    els.bitrateValueLabel.textContent = `${(kbps / 1000).toFixed(1)} Mbps`;
    saveProfileToServer();
    if (state.isStreaming) {
      rebalanceViewerBitrates();
    }
  };

  els.dockBtnLeave.onclick = () => {
    const hasRemoteStreams = [...state.watchedStreams.keys()].some((id) => id !== state.clientId);
    if (hasRemoteStreams) {
      closeAllWatchedStreams();
    } else if (state.isStreaming && state.watchedStreams.has(state.clientId)) {
      stopScreenShare(true);
    } else {
      closeAllWatchedStreams();
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
  if (els.btnRoomBanner) {
    els.btnRoomBanner.onclick = (e) => {
      if (e.target === els.btnQuickCopyCode) return;
      openInviteModal();
    };
  }

  if (els.btnQuickCopyCode) {
    els.btnQuickCopyCode.onclick = (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(state.roomCode);
      playDiscordSound('click');
      els.btnQuickCopyCode.textContent = 'Copiado!';
      showToast(`Código da sala ${state.roomCode} copiado!`, '🔗');
      setTimeout(() => (els.btnQuickCopyCode.textContent = 'Copiar'), 1500);
    };
  }

  els.btnCloseInviteModal.onclick = () => els.inviteModal.classList.add('hidden');

  if (els.btnCopyPsInstall) {
    els.btnCopyPsInstall.onclick = () => {
      const setupUrl = 'https://github.com/igorvalente00/streamcord-updater/releases/latest/download/StreamCord-Instalador.exe';
      navigator.clipboard.writeText(setupUrl);
      playDiscordSound('click');
      showToast('Link direto do Instalador (2 Cliques) copiado!', '⬇️');
    };
  }

  if (els.btnCopyInvitePage) {
    els.btnCopyInvitePage.onclick = () => {
      const inviteUrl = `https://igorvalente00.github.io/streamcord-updater/convite.html?room=${encodeURIComponent(state.roomCode)}`;
      navigator.clipboard.writeText(inviteUrl);
      playDiscordSound('click');
      showToast('Link da Página de Convite copiado!', '🔗');
    };
  }

  if (els.btnCopyWebDirect) {
    els.btnCopyWebDirect.onclick = () => {
      const webUrl = `https://igorvalente00.github.io/streamcord-updater/?room=${encodeURIComponent(state.roomCode)}`;
      navigator.clipboard.writeText(webUrl);
      playDiscordSound('click');
      showToast('Link Web Direto (sem download) copiado!', '🌐');
    };
  }

  els.btnSaveName.onclick = () => {
    const newName = els.inputProfileName.value.trim();
    const newRoom = els.inputRoomCode.value.trim().toUpperCase();

    if (newName) {
      state.username = newName.slice(0, 28);
      localStorage.setItem('streamcord_username', state.username);
    }
    if (newRoom && newRoom !== state.roomCode) {
      if (state.isStreaming) stopScreenShare(true);
      closeAllWatchedStreams();
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
    saveProfileToServer();
    els.inviteModal.classList.add('hidden');
  };

  async function saveProfileToServer() {
    if (!IS_LOCAL_HOST) return;
    try {
      const data = {
        username: state.username,
        avatarColor: state.avatarColor,
        roomCode: state.roomCode,
        currentChannelId: state.currentChannelId,
        theme: state.activeTheme,
        studioSurface: document.documentElement.getAttribute('data-studio-surface') || 'obsidian',
        studioAccent: document.documentElement.getAttribute('data-studio-accent') || 'indigo',
        favoriteRooms: getFavoriteRooms(),
        streamSettings: state.streamSettings,
      };
      await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    } catch (e) {}
  }
  window.__saveStudioProfile = saveProfileToServer;

  async function loadProfileFromServer() {
    if (!IS_LOCAL_HOST) return;
    try {
      const res = await fetch('/api/profile');
      if (res.ok) {
        const prof = await res.json();
        if (prof && typeof prof === 'object') {
          if (prof.username) {
            state.username = prof.username;
            localStorage.setItem('streamcord_username', prof.username);
          }
          if (prof.avatarColor) {
            state.avatarColor = prof.avatarColor;
            localStorage.setItem('streamcord_color', prof.avatarColor);
          }
          if (prof.roomCode && !roomFromUrl) {
            state.roomCode = prof.roomCode;
            localStorage.setItem('streamcord_room', prof.roomCode);
          }
          if (prof.theme) {
            state.activeTheme = prof.theme;
            localStorage.setItem('streamcord_theme', prof.theme);
            applyThemeModel(state.activeTheme, false);
          }
          if (prof.studioSurface) {
            document.documentElement.setAttribute('data-studio-surface', prof.studioSurface);
            localStorage.setItem('streamcord_studio_surface', prof.studioSurface);
          }
          if (prof.studioAccent) {
            document.documentElement.setAttribute('data-studio-accent', prof.studioAccent);
            localStorage.setItem('streamcord_studio_accent', prof.studioAccent);
          }
          if (typeof window.__syncStudioThemeUI === 'function') window.__syncStudioThemeUI();
          if (Array.isArray(prof.favoriteRooms)) {
            const cleanedFavs = prof.favoriteRooms.filter((r) => typeof r === 'string' && r.trim());
            localStorage.setItem('streamcord_favorites', JSON.stringify(cleanedFavs));
          }
          if (prof.streamSettings) {
            Object.assign(state.streamSettings, prof.streamSettings);
            if (prof.streamSettings.captureEngine) localStorage.setItem('streamcord_engine', prof.streamSettings.captureEngine);
            if (prof.streamSettings.audioMode) localStorage.setItem('streamcord_audio', prof.streamSettings.audioMode);
            if (prof.streamSettings.resolution) localStorage.setItem('streamcord_res', prof.streamSettings.resolution);
            if (prof.streamSettings.fps) localStorage.setItem('streamcord_fps', String(prof.streamSettings.fps));
            if (prof.streamSettings.preset) localStorage.setItem('streamcord_preset', prof.streamSettings.preset);
            if (prof.streamSettings.bitrateKbps) localStorage.setItem('streamcord_bitrate', String(prof.streamSettings.bitrateKbps));
          }
          if (prof.currentChannelId && state.channels.some((c) => c.id === prof.currentChannelId)) {
            state.currentChannelId = prof.currentChannelId;
            const foundCh = state.channels.find((c) => c.id === prof.currentChannelId);
            if (foundCh) {
              els.stageTitle.textContent = foundCh.name;
              els.voiceCurrentChannelName.textContent = foundCh.name;
            }
          }
          updateLocalProfileUI();
          updateFavoriteButtonUI();
          renderLobbyFavorites();
          syncStreamModalControls();
        }
      }
    } catch (e) {}
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // =========================================================================
  // 12. GERENCIADOR DE CANAIS, MODERAÇÃO, MENU BOTÃO DIREITO & COR DO AVATAR
  // =========================================================================
  function saveChannelsLocal() {
    try {
      localStorage.setItem('streamcord_channels_' + state.roomCode, JSON.stringify(state.channels));
    } catch (e) {}
  }

  function syncChannelsBroadcast() {
    saveChannelsLocal();
    publishBroadcast({ type: 'channels-sync', channels: state.channels });
    renderChannelsSidebar();
    renderStageParticipants();
    renderChannelManager();
  }

  function disconnectFromCall(notifyToast = true) {
    if (state.isStreaming) stopScreenShare(false);
    closeAllWatchedStreams();
    state.currentChannelId = null;
    els.stageTitle.textContent = 'Desconectado';
    els.voiceCurrentChannelName.textContent = 'Fora da chamada';
    playDiscordSound('stream-stop');
    announcePresence(false);
    renderChannelsSidebar();
    renderStageParticipants();
    if (notifyToast) showToast('Você saiu da chamada.', '🎧');
  }

  if (els.btnDisconnectCall) {
    els.btnDisconnectCall.onclick = () => disconnectFromCall(true);
  }

  function renderAvatarColorPicker() {
    if (!els.avatarColorPicker) return;
    els.avatarColorPicker.innerHTML = '';
    COLORS.forEach((col) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `color-swatch-btn ${state.avatarColor === col ? 'active' : ''}`;
      btn.style.background = col;
      btn.title = 'Escolher cor do card';
      btn.onclick = () => {
        state.avatarColor = col;
        localStorage.setItem('streamcord_color', col);
        renderAvatarColorPicker();
        updateLocalProfileUI();
        announcePresence(false);
        saveProfileToServer();
      };
      els.avatarColorPicker.appendChild(btn);
    });
  }

  const origOpenInvite = openInviteModal;
  openInviteModal = function () {
    origOpenInvite();
    renderAvatarColorPicker();
  };
  els.btnInviteModal.onclick = openInviteModal;
  els.btnHeaderInvite.onclick = openInviteModal;
  els.btnEditProfile.onclick = openInviteModal;

  function openChannelManager(focusInput = false, editChannelId = null) {
    renderChannelManager(editChannelId);
    els.channelManagerModal.classList.remove('hidden');
    if (focusInput && els.newChannelName) {
      setTimeout(() => els.newChannelName.focus(), 60);
    }
  }

  if (els.btnCloseChannelManager) {
    els.btnCloseChannelManager.onclick = () => els.channelManagerModal.classList.add('hidden');
  }

  function createNewChannel() {
    const rawName = (els.newChannelName?.value || '').trim();
    const emoji = els.newChannelEmoji?.value || '🎮';
    if (!rawName) {
      showToast('Digite um nome para o canal.', '⚠️');
      return;
    }
    const id = 'ch_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 5);
    const fullName = `${emoji} ${rawName.slice(0, 32)}`;
    state.channels.push({ id, name: fullName, bitrate: '25 Mbps' });
    els.newChannelName.value = '';
    syncChannelsBroadcast();
    playDiscordSound('join');
    showToast(`Canal "${fullName}" criado!`, '✅');
  }

  if (els.btnCreateChannel) {
    els.btnCreateChannel.onclick = createNewChannel;
  }
  if (els.newChannelName) {
    els.newChannelName.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        createNewChannel();
      }
    };
  }

  function renderChannelManager(focusChannelId = null) {
    if (!els.channelManagerList || !els.bannedUsersList) return;
    els.channelManagerList.innerHTML = '';

    state.channels.forEach((ch) => {
      const row = document.createElement('div');
      row.className = 'cm-row';

      const inp = document.createElement('input');
      inp.type = 'text';
      inp.className = 'text-input';
      inp.value = ch.name;
      inp.maxLength = 38;

      const saveBtn = document.createElement('button');
      saveBtn.type = 'button';
      saveBtn.className = 'btn btn-secondary btn-sm';
      saveBtn.textContent = 'Salvar';
      saveBtn.onclick = () => {
        const nextName = inp.value.trim();
        if (!nextName) return;
        ch.name = nextName;
        if (state.currentChannelId === ch.id) {
          els.stageTitle.textContent = nextName;
          els.voiceCurrentChannelName.textContent = nextName;
        }
        syncChannelsBroadcast();
        showToast(`Canal renomeado para "${nextName}"`, '✏️');
      };

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'btn btn-danger btn-sm';
      delBtn.textContent = 'Excluir';
      delBtn.onclick = () => {
        if (state.channels.length <= 1) {
          showToast('Mantenha pelo menos 1 canal no servidor.', '⚠️');
          return;
        }
        state.channels = state.channels.filter((c) => c.id !== ch.id);
        if (state.currentChannelId === ch.id) {
          switchChannel(state.channels[0].id);
        }
        syncChannelsBroadcast();
        showToast('Canal excluído.', '🗑️');
      };

      row.appendChild(inp);
      row.appendChild(saveBtn);
      row.appendChild(delBtn);
      els.channelManagerList.appendChild(row);

      if (focusChannelId && focusChannelId === ch.id) {
        setTimeout(() => {
          inp.focus();
          inp.select();
        }, 60);
      }
    });

    els.bannedUsersList.innerHTML = '';
    if (state.bannedUsers.size === 0) {
      els.bannedUsersList.innerHTML = `<div style="font-size:12px;color:var(--text-muted);padding:8px;">Nenhum usuário banido nesta sala.</div>`;
    } else {
      for (const [uid, uname] of state.bannedUsers.entries()) {
        const row = document.createElement('div');
        row.className = 'cm-row';
        row.innerHTML = `<span style="flex:1;font-size:12.5px;">🚫 ${escapeHtml(uname)}</span>`;
        const unbanBtn = document.createElement('button');
        unbanBtn.type = 'button';
        unbanBtn.className = 'cm-btn';
        unbanBtn.textContent = 'Desbanir';
        unbanBtn.onclick = () => {
          state.bannedUsers.delete(uid);
          renderChannelManager();
          showToast(`${uname} foi desbanido da sala.`, '✅');
        };
        row.appendChild(unbanBtn);
        els.bannedUsersList.appendChild(row);
      }
    }
  }

  function kickUserFromCall(u) {
    if (!u || u.id === state.clientId) return;
    publishDirect(u.id, { type: 'mod-action', action: 'kick', by: state.username });
    u.channelId = null;
    u.streaming = false;
    state.onlineUsers.set(u.id, u);
    if (state.watchedStreams.has(u.id)) closeWatchedStream(u.id);
    renderChannelsSidebar();
    renderStageParticipants();
    showToast(`${u.username} foi expulso da chamada.`, '👢');
  }

  function banUserFromServer(u) {
    if (!u || u.id === state.clientId) return;
    state.bannedUsers.set(u.id, u.username);
    publishDirect(u.id, { type: 'mod-action', action: 'ban', by: state.username });
    state.onlineUsers.delete(u.id);
    if (state.watchedStreams.has(u.id)) closeWatchedStream(u.id);
    renderChannelsSidebar();
    renderStageParticipants();
    showToast(`${u.username} foi banido da sala.`, '🚫');
  }

  function toggleLocalMuteUser(u) {
    if (!u || u.id === state.clientId) return;
    const ws = state.watchedStreams.get(u.id);
    if (state.locallyMutedUsers.has(u.id)) {
      state.locallyMutedUsers.delete(u.id);
      if (ws && ws.audioEl) {
        ws.muted = false;
        ws.audioEl.muted = false;
        if (ws.muteBtnEl) ws.muteBtnEl.textContent = '🔊';
      }
      showToast(`Áudio de ${u.username} ativado para você.`, '🔊');
    } else {
      state.locallyMutedUsers.add(u.id);
      if (ws && ws.audioEl) {
        ws.muted = true;
        ws.audioEl.muted = true;
        if (ws.muteBtnEl) ws.muteBtnEl.textContent = '🔇';
      }
      showToast(`${u.username} silenciado para você.`, '🔇');
    }
    renderStageParticipants();
  }

  // MENU DE CONTEXTO CUSTOMIZADO (BLOQUEIA O MENU FEIO DO NAVEGADOR)
  function hideContextMenu() {
    if (els.contextMenu) els.contextMenu.classList.add('hidden');
  }

  function showContextMenu(x, y, items) {
    if (!els.contextMenu) return;
    els.contextMenu.innerHTML = '';
    items.forEach((it) => {
      if (it.divider) {
        const div = document.createElement('div');
        div.className = 'ctx-divider';
        els.contextMenu.appendChild(div);
        return;
      }
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `ctx-item ${it.danger ? 'danger' : ''}`;
      btn.innerHTML = `<span>${escapeHtml(it.label)}</span>`;
      btn.onclick = () => {
        hideContextMenu();
        it.action();
      };
      els.contextMenu.appendChild(btn);
    });

    els.contextMenu.classList.remove('hidden');
    const rect = els.contextMenu.getBoundingClientRect();
    const posX = Math.min(x, window.innerWidth - rect.width - 10);
    const posY = Math.min(y, window.innerHeight - rect.height - 10);
    els.contextMenu.style.left = `${Math.max(8, posX)}px`;
    els.contextMenu.style.top = `${Math.max(8, posY)}px`;
  }

  function openChannelContextMenu(e, ch) {
    e.preventDefault();
    e.stopPropagation();
    showContextMenu(e.clientX, e.clientY, [
      { label: '✏️ Editar / Renomear Canal', action: () => openChannelManager(false, ch.id) },
      { label: '➕ Criar Novo Canal', action: () => openChannelManager(true) },
      {
        label: '🔗 Copiar Link da Sala',
        action: () => {
          const url = `https://igorvalente00.github.io/streamcord-updater/convite.html?room=${encodeURIComponent(state.roomCode)}`;
          navigator.clipboard.writeText(url);
          showToast('Link da sala copiado!', '🔗');
        },
      },
      { divider: true },
      {
        label: '🗑️ Excluir Canal',
        danger: true,
        action: () => {
          if (state.channels.length <= 1) {
            showToast('Mantenha pelo menos 1 canal no servidor.', '⚠️');
            return;
          }
          state.channels = state.channels.filter((c) => c.id !== ch.id);
          if (state.currentChannelId === ch.id) switchChannel(state.channels[0].id);
          syncChannelsBroadcast();
          showToast(`Canal "${ch.name}" excluído.`, '🗑️');
        },
      },
    ]);
  }

  function openUserContextMenu(e, u) {
    e.preventDefault();
    e.stopPropagation();
    const isMe = u.id === state.clientId;
    const isMuted = state.locallyMutedUsers.has(u.id);
    const items = [];

    if (u.streaming) {
      items.push({
        label: '📺 Assistir Transmissão',
        action: () => (isMe ? openSelfPreviewCard() : watchFriendStream(u.id)),
      });
    }

    if (isMe) {
      items.push({ label: '✏️ Editar Meu Apelido e Cor', action: openInviteModal });
      if (state.currentChannelId) {
        items.push({ divider: true });
        items.push({ label: '📞 Desconectar da Chamada', danger: true, action: () => disconnectFromCall(true) });
      }
    } else {
      items.push({
        label: isMuted ? '🔊 Ativar Áudio Local' : '🔇 Silenciar para Mim',
        action: () => toggleLocalMuteUser(u),
      });
      items.push({ divider: true });
      items.push({ label: '👢 Expulsar da Chamada', danger: true, action: () => kickUserFromCall(u) });
      items.push({ label: '🚫 Banir do Servidor', danger: true, action: () => banUserFromServer(u) });
    }

    showContextMenu(e.clientX, e.clientY, items);
  }

  document.addEventListener('click', hideContextMenu);
  document.addEventListener('contextmenu', (e) => {
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return; // Mantém colar/copiar em campos de texto
    e.preventDefault();

    if (e.target.closest('#channels-container')) {
      showContextMenu(e.clientX, e.clientY, [
        { label: '➕ Criar Novo Canal', action: () => openChannelManager(true) },
        { label: '⚙️ Gerenciar Canais e Servidor', action: () => openChannelManager(false) },
      ]);
      return;
    }

    if (e.target.closest('#chat-messages')) {
      showContextMenu(e.clientX, e.clientY, [
        {
          label: '🧹 Limpar Chat Local',
          action: () => {
            els.chatMessages.innerHTML = '<div class="chat-welcome">Chat limpo localmente.</div>';
          },
        },
        { label: '🔗 Copiar Código da Sala', action: () => navigator.clipboard.writeText(state.roomCode) },
      ]);
      return;
    }

    showContextMenu(e.clientX, e.clientY, [
      { label: '🖥️ Compartilhar Tela + Áudio', action: handleShareButtonClick },
      { label: '🎨 Trocar Modelo de Interface', action: openThemeModal },
      { label: '⚙️ Gerenciar Canais', action: () => openChannelManager(false) },
      {
        label: `🔗 Copiar Sala (${state.roomCode})`,
        action: () => {
          navigator.clipboard.writeText(state.roomCode);
          showToast(`Código ${state.roomCode} copiado!`, '🔗');
        },
      },
    ]);
  });

  // =========================================================================
  // LOBBY DE SALAS (Criar Sala Aleatória / Entrar / Favoritar Sala)
  // =========================================================================
  const lobbyOverlay = document.getElementById('room-lobby-overlay');
  const lobbyUsernameInput = document.getElementById('lobby-username-input');
  const lobbyCreateNameInput = document.getElementById('lobby-create-name');
  const btnLobbyCreateRoom = document.getElementById('btn-lobby-create-room');
  const lobbyJoinInput = document.getElementById('lobby-join-input');
  const btnLobbyJoinRoom = document.getElementById('btn-lobby-join-room');
  const lobbyFavoritesList = document.getElementById('lobby-favorites-list');
  const btnFavoriteRoom = document.getElementById('btn-favorite-room');
  const favoriteRoomIcon = document.getElementById('favorite-room-icon');
  const favoriteRoomLabel = document.getElementById('favorite-room-label');
  const btnOpenLobby = document.getElementById('btn-open-lobby');

  function generateRandomRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'STRM-';
    for (let i = 0; i < 4; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }

  function parseRoomCodeInput(raw) {
    if (!raw || typeof raw !== 'string') return '';
    let s = raw.trim();
    const roomMatch = s.match(/[?&]room=([^&#]+)/i) || s.match(/streamcord:\/\/(?:room\/)?([^/?#]+)/i);
    if (roomMatch && roomMatch[1]) {
      s = decodeURIComponent(roomMatch[1]);
    }
    return s.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 24);
  }

  function getFavoriteRooms() {
    try {
      const raw = JSON.parse(localStorage.getItem('streamcord_favorites') || '[]');
      return Array.isArray(raw) ? raw.filter((r) => typeof r === 'string' && r.trim()) : [];
    } catch (_) {
      return [];
    }
  }

  const btnCloseLobby = document.getElementById('btn-close-lobby');
  const favoritesCountEl = document.getElementById('favorites-count');

  function saveFavoriteRooms(list) {
    try {
      localStorage.setItem('streamcord_favorites', JSON.stringify(list));
    } catch (_) {}
    void saveProfileToServer();
  }

  function isRoomFavorited(code) {
    return getFavoriteRooms().includes(code);
  }

  function updateFavoriteButtonUI() {
    const fav = isRoomFavorited(state.roomCode);
    if (btnFavoriteRoom) {
      btnFavoriteRoom.classList.toggle('favorited', fav);
      btnFavoriteRoom.classList.toggle('is-favorited', fav);
      btnFavoriteRoom.title = fav ? 'Remover sala dos favoritos' : 'Favoritar esta sala';
    }
    if (favoriteRoomIcon) favoriteRoomIcon.textContent = fav ? '★' : '☆';
    if (favoriteRoomLabel) favoriteRoomLabel.textContent = fav ? 'Favorita' : 'Favoritar';
  }

  function toggleFavoriteRoom(code = state.roomCode) {
    const list = getFavoriteRooms();
    const idx = list.indexOf(code);
    if (idx >= 0) {
      list.splice(idx, 1);
      saveFavoriteRooms(list);
      showToast(`Sala ${code} removida dos favoritos.`, '☆');
    } else {
      list.unshift(code);
      saveFavoriteRooms(list.slice(0, 12));
      showToast(`Sala ${code} salva nos favoritos!`, '★');
    }
    updateFavoriteButtonUI();
    renderLobbyFavorites();
  }

  function renderLobbyFavorites() {
    if (!lobbyFavoritesList) return;
    const favs = getFavoriteRooms();
    if (favoritesCountEl) {
      favoritesCountEl.textContent = `${favs.length} ${favs.length === 1 ? 'salva' : 'salvas'}`;
    }
    lobbyFavoritesList.innerHTML = '';
    if (favs.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'favorites-empty';
      empty.textContent = 'Nenhuma sala favoritada ainda. Clique na estrela ☆ no topo da sala para salvar aqui.';
      lobbyFavoritesList.appendChild(empty);
      return;
    }
    for (const code of favs) {
      const li = document.createElement('li');
      li.className = 'favorite-item';
      li.innerHTML = `
        <button type="button" class="favorite-item-main" title="Entrar na sala ${escapeHtml(code)}">
          <span class="favorite-item-name">${escapeHtml(code)}</span>
          <span class="favorite-item-meta">
            <span class="mono">${escapeHtml(code)}</span>
            <span>·</span>
            <span>Favorita</span>
          </span>
        </button>
        <button type="button" class="favorite-remove-btn" title="Remover ${escapeHtml(code)} dos favoritos">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      `;
      li.querySelector('.favorite-item-main').onclick = () => {
        playDiscordSound('click');
        enterRoomFromLobby(code, false);
      };
      li.querySelector('.favorite-remove-btn').onclick = (e) => {
        e.stopPropagation();
        playDiscordSound('click');
        const next = getFavoriteRooms().filter((x) => x !== code);
        saveFavoriteRooms(next);
        updateFavoriteButtonUI();
        renderLobbyFavorites();
        showToast(`Sala ${code} removida dos favoritos.`);
      };
      lobbyFavoritesList.appendChild(li);
    }
  }

  function enterRoomFromLobby(roomCode, autoCopyInvite = false) {
    const cleanCode = parseRoomCodeInput(roomCode) || generateRandomRoomCode();
    if (lobbyUsernameInput && lobbyUsernameInput.value.trim()) {
      state.username = lobbyUsernameInput.value.trim().slice(0, 24);
      localStorage.setItem('streamcord_username', state.username);
    }
    if (state.isStreaming) stopScreenShare(true);
    closeAllWatchedStreams();

    state.hasEnteredRoom = true;
    state.roomCode = cleanCode;
    localStorage.setItem('streamcord_room', state.roomCode);
    state.onlineUsers.clear();
    try {
      state.channels = JSON.parse(localStorage.getItem('streamcord_channels_' + state.roomCode) || 'null') || DEFAULT_CHANNELS.map((c) => ({ ...c }));
    } catch (_) {
      state.channels = DEFAULT_CHANNELS.map((c) => ({ ...c }));
    }
    const activeCh = state.channels.find((c) => c.id === state.currentChannelId) || state.channels[0];
    if (activeCh) {
      state.currentChannelId = activeCh.id;
      if (els.stageTitle) els.stageTitle.textContent = activeCh.name;
    }
    saveProfileToServer();
    updateLocalProfileUI();
    updateFavoriteButtonUI();
    lastSidebarSig = '';
    renderChannelsSidebar();

    if (lobbyOverlay) lobbyOverlay.classList.add('hidden');
    connectCloudSignaling();

    if (autoCopyInvite) {
      const inviteUrl = `https://igorvalente00.github.io/streamcord-updater/convite.html?room=${encodeURIComponent(state.roomCode)}`;
      try { navigator.clipboard.writeText(inviteUrl); } catch (_) {}
      showToast(`Sala ${state.roomCode} criada! Link de convite copiado.`, '✨');
    } else {
      showToast(`Conectado à sala ${state.roomCode}!`, '🚀');
    }
  }

  function openRoomLobby(fromActiveRoom = true) {
    if (btnCloseLobby) {
      btnCloseLobby.classList.toggle('hidden', !fromActiveRoom || !state.hasEnteredRoom);
    }
    if (lobbyUsernameInput) {
      lobbyUsernameInput.value = state.username;
      const lobbyAv = document.getElementById('lobby-avatar-preview');
      if (lobbyAv) lobbyAv.textContent = getUserInitials(state.username);
    }
    if (lobbyJoinInput) lobbyJoinInput.value = '';
    if (lobbyCreateNameInput) lobbyCreateNameInput.value = '';
    renderLobbyFavorites();
    if (lobbyOverlay) lobbyOverlay.classList.remove('hidden');
  }

  if (lobbyUsernameInput) {
    lobbyUsernameInput.addEventListener('input', () => {
      const lobbyAv = document.getElementById('lobby-avatar-preview');
      if (lobbyAv) lobbyAv.textContent = getUserInitials(lobbyUsernameInput.value || state.username);
    });
  }
  if (btnCloseLobby) {
    btnCloseLobby.onclick = () => {
      playDiscordSound('click');
      if (lobbyOverlay) lobbyOverlay.classList.add('hidden');
    };
  }
  if (btnFavoriteRoom) {
    btnFavoriteRoom.onclick = () => {
      playDiscordSound('click');
      toggleFavoriteRoom(state.roomCode);
    };
  }
  if (btnOpenLobby) {
    btnOpenLobby.onclick = () => {
      playDiscordSound('click');
      openRoomLobby(true);
    };
  }
  if (btnLobbyCreateRoom) {
    btnLobbyCreateRoom.onclick = () => {
      playDiscordSound('click');
      const custom = parseRoomCodeInput(lobbyCreateNameInput ? lobbyCreateNameInput.value : '');
      const code = custom || generateRandomRoomCode();
      enterRoomFromLobby(code, true);
    };
  }
  if (btnLobbyJoinRoom) {
    btnLobbyJoinRoom.onclick = () => {
      const code = parseRoomCodeInput(lobbyJoinInput ? lobbyJoinInput.value : '');
      if (!code) {
        showToast('Digite um código de sala ou cole um link válido!', '⚠️');
        return;
      }
      playDiscordSound('click');
      enterRoomFromLobby(code, false);
    };
  }
  if (lobbyJoinInput) {
    lobbyJoinInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && btnLobbyJoinRoom) btnLobbyJoinRoom.click();
    });
  }
  if (lobbyCreateNameInput) {
    lobbyCreateNameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && btnLobbyCreateRoom) btnLobbyCreateRoom.click();
    });
  }

  document.addEventListener('fullscreenchange', () => {
    const isFs = Boolean(document.fullscreenElement);
    if (IS_LOCAL_HOST) {
      fetch('/api/fullscreen?enable=' + (isFs ? '1' : '0'), { cache: 'no-store' }).catch(() => {});
    }
    document.querySelectorAll('.btn-card-full').forEach((btn) => {
      btn.classList.toggle('is-active', isFs);
    });
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  const verTagEl = document.getElementById('sidebar-version-tag');
  if (verTagEl) verTagEl.textContent = 'v' + APP_VERSION;
  if (els.statLoss) els.statLoss.textContent = 'v' + APP_VERSION;
  syncStreamModalControls();
  applyThemeModel(state.activeTheme, false);
  updateLocalProfileUI();
  updateFavoriteButtonUI();
  renderChannelsSidebar();
  loadProfileFromServer().finally(() => {
    void ensureTurnQuotaChecked();
    void ensureIceServersReady();
    updateLocalProfileUI();
    updateFavoriteButtonUI();
    lastSidebarSig = '';
    renderChannelsSidebar();
    if (roomFromUrl && roomFromUrl.trim()) {
      state.hasEnteredRoom = true;
      if (lobbyOverlay) lobbyOverlay.classList.add('hidden');
      connectCloudSignaling();
    } else {
      openRoomLobby(false);
    }
  });
})();
