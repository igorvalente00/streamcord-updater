# 🎮 StreamCord 2K60 (v9.5.2) — Transmissão de Tela 2K 60FPS + Áudio (Discord Silenciado)

Aplicativo nativo independente para Windows (com WebView2 DirectX 11 embutido) e cliente Web/Mobile com compartilhamento de tela em até **2560×1440 @ 60 FPS** via WebRTC, áudio estéreo WASAPI (Discord 100% silenciado), cards 16:9 e gerenciador de canais — sem VPN e sem precisar abrir portas no roteador!

---

## ⚡ Novidades da Versão 9.5.2
- **Zero Erros 404 na Versão Web (`github.io`):** Chamadas locais (`/api/profile`, `/api/update-status`, `/api/sources`, `/api/network-info`) agora rodam apenas no host desktop (`127.0.0.1`), eliminando o erro `Site not found · GitHub Pages` e todos os 404 no console dos amigos.
- **Conexão WebRTC P2P Mais Rápida (Sem Bloqueio de IP Morto):** Removido o servidor `openrelay.metered.ca` (cujo DNS apontava para o IP inválido `192.0.2.1` e travava a negociação ICE).
- **Indicador Visual de Conexão no Player:** O espectador vê em tempo real o andamento da conexão P2P e conta com botão imediato de **Tentar Reconectar**, evitando tela preta sem aviso.
- **Deploy Atômico no GitHub Pages:** Publicação em commit único no `streamcord-updater` para evitar falhas temporárias de 404 durante atualizações.

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
