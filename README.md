# 🎮 StreamCord 2K60 (v9.3.1) — Transmissão de Tela 2K 60FPS + Áudio (Discord Silenciado)

Aplicativo nativo independente (com sua própria engine dedicada, idêntica à do Discord) para compartilhamento de tela em **até 2K (2560×1440) a 60 FPS cravados** acelerado por **Hardware GPU (NVENC / AMF / QuickSync High Profile)** com WebRTC `maintain-framerate`, áudio estéreo do PC/Jogo (192 kbps) e **voz do Discord 100% silenciada na stream** — sem precisar de VPN (Radmin/ZeroTier) e sem abrir portas no roteador!

---

## ⚡ Novidades da Versão 9.3.1
- **Correção do Auto-Updater e Instalador (Sem Loop de Versão):** Sincronizada a versão interna do motor C# (`CURRENT_VERSION = 9.3.1`) e da interface para que o botão **"Atualizar App"** e o instalador reconheçam imediatamente a versão instalada sem repetir o aviso de atualização.
- **App 100% Independente de Navegador (Engine Nativa Embutida):** O StreamCord agora roda em sua própria janela nativa com motor embutido de alta performance DirectX 11, sem abrir janelas externas de navegadores (Edge/Chrome) e sem a barra de URL ou erros como `ERR_CONNECTION_REFUSED`.
- **60 FPS Cravados em Jogos Pesados (Deadlock, CS2, etc.):** O pipeline WebRTC agora aplica explicitamente `degradationPreference: maintain-framerate`, priorizando a fluidez dos 60 quadros por segundo mesmo durante teamfights e cenas com efeitos visuais intensos.
- **Inicialização Instantânea:** O motor C# valida a prontidão do socket local antes de carregar o DOM, eliminando telas de espera no boot.
- **Perfil e Dados 100% Persistentes:** Nome de usuário, avatar, tema, sala e configurações de stream salvos de forma permanente em `%APPDATA%\StreamCord\profile.json` e `%LOCALAPPDATA%\StreamCord\EngineProfile`.

---

## 🚀 Passo a Passo de Instalação (2 Cliques • Sem Comandos!)

Você e seus amigos **não precisam digitar nenhum comando** no terminal ou PowerShell.

### 💻 Método 1 (Recomendado para PC Windows): Instalador de 2 Cliques
1. Baixe o instalador oficial clicando aqui:
   👉 **[Baixar `StreamCord-Instalador.exe` (Última Versão)](https://github.com/igorvalente00/streamcord-updater/releases/latest/download/StreamCord-Instalador.exe)**
   *(Alternativa em pacote compactado: [Baixar `StreamCord-2K60.zip`](https://github.com/igorvalente00/streamcord-updater/releases/latest/download/StreamCord-2K60.zip) ou [Página de Convite](https://igorvalente00.github.io/streamcord-updater/convite.html?room=IGOR-2K60))*
2. Dê **2 cliques** no arquivo **`StreamCord-Instalador.exe`**.
3. **Se aparecer a tela azul informativa do Windows na 1ª vez:**
   - Clique em **Mais informações** (logo abaixo do texto) e depois clique no botão **Executar mesmo assim**.
   - *Por que isso acontece apenas na 1ª vez?* Porque o Windows exibe esse lembrete para qualquer `.exe` gratuito/independente que não possua um certificado corporativo pago da Microsoft. Assim que o instalador cria o ícone **StreamCord 2K60** na sua **Área de Trabalho**, todas as aberturas futuras e todas as atualizações pelo botão **"Atualizar App"** abrem **direto, sem nenhum aviso**!
4. **Pronto!** Em ~1 segundo o instalador:
   - Instala o aplicativo na pasta do seu usuário (`%LOCALAPPDATA%\Programs\StreamCord`) sem pedir senha de Administrador;
   - Cria o atalho **StreamCord 2K60** com ícone oficial na sua **Área de Trabalho** e no **Menu Iniciar**;
   - Abre o **StreamCord 2K60** automaticamente!

---

### 🌐 Método 2 (Zero Download / Notebooks com Bloqueio Estrito / Celular)
Se algum amigo estiver no **celular (Android/iPhone)** ou em um notebook de fábrica/empresa com o *"Controle de Aplicativos Inteligentes"* bloqueando qualquer programa externo:
1. Basta abrir este link direto no **Microsoft Edge**, **Google Chrome** ou **Safari**:
   👉 **[Abrir StreamCord Direto no Navegador (Sem Baixar Nada)](https://igorvalente00.github.io/streamcord-updater/?room=IGOR-2K60)**
2. Ele entra na sala na mesma hora com vídeo em até **2K 60FPS** e som estéreo!
   *(Caso queira liberar aplicativos independentes no Windows 11 com Controle de Aplicativos Inteligentes ativo: abra **Segurança do Windows** → **Controle de aplicativos e navegadores** → **Configurações do Controle de Aplicativos Inteligentes** → **Desativado**).*

---

## 🎯 Como Usar no Dia a Dia com os Amigos

1. **Escolha seu Nome e Sala (Salvos Automaticamente):**
   - Clique no código da sala (ex: `IGOR-2K60`) ou no ícone de engrenagem ao lado do seu nome no canto inferior esquerdo.
   - Digite seu **Apelido** e o **Código da Sala** combinado com seus amigos e clique em **Salvar e Conectar**.
   - Seus dados ficam gravados permanentemente em `%APPDATA%\StreamCord\profile.json` — mesmo fechando o PC ou atualizando o app, seu nome e preferências continuam salvos!
2. **Inicie sua Transmissão em 60 FPS (Com Discord Mudo na Stream):**
   - Entre no canal desejado (ex: **`🎮 Gameplay 2K 60FPS`**) e clique em **Transmitir**.
   - Escolha a resolução ideal:
     - **`900p FPS` (1600×900 @ 60 FPS):** Recomendado para jogos competitivos intensos como **Deadlock**, **CS2** e **Valorant** em teamfights pesadas.
     - **`1080p` (1920×1080 @ 60 FPS):** Equilíbrio perfeito de nitidez Full HD e leveza na GPU (`~3.9 ms` por quadro).
     - **`1440p (2K)` (2560×1440 @ 60 FPS):** Qualidade máxima Ultra Nitro (`20 Mbps`).
   - Mantenha o áudio em **`🔊 Transmitir Som do PC Inteiro (Com Discord Silenciado Automaticamente)`**.
   - Clique em **🔴 Transmitir Ao Vivo (Go Live)** e selecione a **Tela** ou a **Janela do Jogo** na janela nativa DirectX do sistema!
3. **Atualizações em 1 Clique (Estilo Discord):**
   - Quando sair uma versão nova, o botão no topo fica verde (**`⬇️ Atualizar vX.Y.Z`**). Basta clicar nele: o próprio programa baixa, substitui e reinicia sozinho na máquina sem precisar abrir o navegador!

---

## 🛡️ Sistema de Backup e Rollback (Para Desenvolvedores)

Todas as versões compiladas geram snapshots completos na pasta `backups/` e tags no Git:
- **Listar versões salvas:**
  ```powershell
  node backup-manager.js list
  ```
- **Fazer Rollback com 2 cliques no Windows:**
  Dê 2 cliques no arquivo **`ROLLBACK.bat`** na pasta do projeto e digite a versão desejada (ex: `v9.1.0` ou `v9.2.0`). Todos os arquivos de código e executáveis serão restaurados imediatamente!
- **Compilar nova versão localmente:**
  ```powershell
  node build-exe.js
  ```
