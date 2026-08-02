# Subtitrări live RO → EN pentru Twitch

Un starter kit funcțional pentru o **extensie Twitch oficială** care traduce
vocea streamerului din română în engleză și o afișează ca subtitrare peste
player, folosind recunoaștere vocală gratuită din browser (Web Speech API).

## Un lucru important înainte de orice

O „extensie Twitch" **nu e ca o extensie de Chrome** — nu se instalează local
de nimeni. E o mică aplicație web pe care o găzduiești tu, o înregistrezi în
[Twitch Developer Console](https://dev.twitch.tv/console/extensions), iar
Twitch o încarcă într-un iframe peste playerul de pe canalul tău, pentru toți
viewerii. Configurarea (ce view-uri are, dimensiuni etc.) se face din consolă,
nu dintr-un `manifest.json` local.

## Cum funcționează

**Important, aflat pe parcurs**: Live Config rulează într-un iframe pus de
Twitch, iar browserele blochează implicit accesul la microfon din iframe-uri
de pe alt domeniu, decât dacă pagina-părinte (a lui Twitch) permite explicit
asta — și Twitch nu permite. Nicio linie de cod din extensie nu poate ocoli
asta din interiorul iframe-ului. Din cauza asta, ascultarea efectivă a
microfonului nu se întâmplă în Live Config, ci într-o pagină separată,
independentă, pe care o deschizi tu manual într-un tab normal de browser.

Există patru bucăți de frontend + un backend (EBS = Extension Backend Service):

| Componentă | Unde rulează | Cine o vede | Rol |
|---|---|---|---|
| `frontend/viewer` (Video Overlay/Fullscreen/Component) | Iframe Twitch | Toți viewerii | Afișează subtitrarea peste video |
| `frontend/config` (Config) | Iframe Twitch | Tu, din Creator Dashboard | Poziție/mărime text |
| `frontend/live-config` (Live Config) | Iframe Twitch | Doar tu, cât ești live | Afișează tokenul tău de autorizare (se reînnoiește singur) și un buton spre consola de ascultare |
| `ebs/public/capture.html` | Tab normal de browser, servit de EBS | Doar tu | Ascultă microfonul, recunoaște româna, traduce, trimite |
| `ebs/` (Node.js) | Server-ul tău | — | Verifică tokenul, retrimite tuturor viewerilor prin Twitch PubSub |

Fluxul: cât ești live, deschizi Live Config din dashboard → copiezi tokenul
afișat acolo → deschizi consola de ascultare (`<url-ul-ebs-ului-tau>/capture`,
servită direct de EBS, deci nu ai nevoie de hosting separat pentru ea) →
lipești tokenul → browserul ascultă microfonul cu Web Speech API
(`lang: 'ro-RO'`) → fiecare frază finală e trimisă la
[MyMemory](https://mymemory.translated.net/) (traducere gratuită, fără cheie
API) → textul în engleză e trimis la EBS-ul tău → EBS-ul verifică tokenul,
semnează un JWT nou cu secretul extensiei și îl trimite prin **Twitch
Extension PubSub** către toți viewerii → view-ul Video Overlay al fiecăruia
îl afișează.

Twitch PubSub pentru extensii e separat de PubSub-ul general (care a fost
înlocuit cu EventSub) — acesta rămâne suportat oficial exact pentru cazul
ăsta, deci arhitectura de mai sus e cea recomandată de Twitch.

Un detaliu practic: tokenul copiat din Live Config expiră după un timp (nu e
reînnoit automat în tab-ul de ascultare, fiindcă acela nu mai vorbește cu
Twitch). Dacă streamul ține mult și consola de ascultare începe să dea eroare
de autorizare, întoarce-te la Live Config, copiază un token proaspăt, și
lipește-l din nou acolo — nu trebuie să repornești nimic altceva.

## Limitări reale — citește asta înainte să investești timp

- **Web Speech API merge doar în Chrome / Edge** (Chromium). Nu în Firefox,
  nu în Safari. Streamerul trebuie să țină tab-ul consolei de ascultare
  (`/capture`) deschis, cu microfonul permis, tot timpul streamului — Live
  Config în sine poate fi închis după ce ai copiat tokenul.
- **Captează microfonul, nu "audio-ul din stream"** ca atare. Nu poate asculta
  ce iese mixat din OBS. Dacă vrei să traduci și sunetul din joc/desktop, nu
  doar vocea, trebuie să rutezi audio-ul printr-un dispozitiv virtual (ex.
  [VB-Cable](https://vb-audio.com/Cable/)) și să-l setezi ca microfon implicit
  în Windows/macOS — Web Speech API nu-ți lasă să alegi dispozitivul de intrare
  din cod, ia mereu ce e setat ca implicit la nivel de sistem.
- **Calitatea recunoașterii vocale pentru română e inconsistentă** — te
  aștepți la greșeli, mai ales cu termeni de gaming, zgomot de fundal sau mai
  multe voci suprapuse.
- **Traducerea gratuită (MyMemory) are o limită zilnică** (aproximativ 5000
  de cuvinte/zi anonim) și calitatea e cea a unei traduceri automate de bază —
  suficient pentru subtitrări live, dar nu perfectă.
- **Latență**: recunoaștere + traducere + PubSub înseamnă câteva secunde de
  întârziere între ce spui și ce vede viewerul.
- **Twitch limitează la 1 mesaj/secundă/canal, max 5 KB** pe Extension
  PubSub — EBS-ul din acest kit ține cont de asta.
- **Review-ul Twitch durează** — de obicei câteva zile, și extensia trebuie
  să respecte [ghidurile lor](https://dev.twitch.tv/docs/extensions/guidelines-and-policies/).
  Poți testa tot ce vrei local, fără review, cu Developer Rig.

Dacă la un moment dat vrei calitate mai bună, cea mai simplă schimbare e să
înlocuiești Web Speech API + MyMemory cu un serviciu plătit (ex. un STT
cloud + un motor de traducere plătit) chiar în `ebs/public/capture.js` —
restul arhitecturii (EBS, PubSub, overlay) rămâne identic.

## Structura proiectului

```
twitch-ro-en-captions/
├── frontend/                  → încărcat ca zip în Twitch (tab-ul Files)
│   ├── viewer/                → viewer.html — Video Fullscreen/Component
│   ├── config/                → config.html — Config
│   └── live-config/           → live_config.html — Live Config (doar token + link)
└── ebs/                       → deployat separat (Render etc.)
    ├── server.js
    └── public/
        ├── capture.html       → consola de ascultare, servită la <ebs-url>/capture
        ├── capture.css
        └── capture.js
```

## Pași de configurare

### 1. Creează extensia și notează-ți datele

1. [dev.twitch.tv/console/extensions](https://dev.twitch.tv/console/extensions) → **Create Extension**.
2. **Client ID** (tab Overview).
3. **Secret** — generat pe tab-ul de autorizare/Secret Keys.
4. **Owner ID** — ID-ul tău numeric de Twitch (caută „twitch user id lookup").

### 2. Deployează EBS-ul

Pune folderul `ebs/` (poate fi într-un repo care conține și `frontend/`,
atâta timp cât la deploy setezi **Root Directory** = `ebs`) pe o gazdă cu
Node — de exemplu [Render](https://render.com):

- **Root Directory**: `ebs`
- **Build Command**: `npm install`
- **Start Command**: `npm start`
- Variabile de mediu: `EXTENSION_CLIENT_ID`, `EXTENSION_SECRET`,
  `EXTENSION_OWNER_ID`, `ALLOWED_ORIGIN=*`

Notează URL-ul primit (ex. `https://ceva.onrender.com`) și verifică
`<url>/health` → trebuie să răspundă `{"ok":true}`.

Pe planul Free, serviciul adoarme după 15 minute de inactivitate și se
trezește în ~1 minut la următoarea cerere — normal, nu e stricat.

### 3. Încarcă frontend-ul în Twitch

Twitch găzduiește el fișierele, nu tu:

1. Fă un zip **doar cu conținutul din `frontend/`** — adică folderele
   `viewer/`, `config/`, `live-config/` trebuie să fie chiar la rădăcina
   arhivei (nu într-un folder „frontend" în plus).
2. Tab **Files** → **Upload Version** → alege zip-ul → **Upload**.
3. Tab **Asset Hosting** → completează căile relative pentru tipurile de
   view pe care le ai activate (de obicei Video - Fullscreen și/sau
   Video - Component, plus Config și Live Config):
   - **Video - Fullscreen / Video - Component Viewer Path** → `viewer/viewer.html`
   - **Config Path** → `config/config.html`
   - **Live Config Path** → `live-config/live_config.html`
4. **Save Changes**.
5. Tab **Status** → **Move to Hosted Test**.

### 4. Instalează pe canalul tău

Buton **View on Twitch and Install** (de pe pagina extensiei sau tab-ul
Status) → activează extensia pe canalul tău, direct din faza de test, fără
să aștepți review-ul.

### 5. Testează live, cap la cap

1. Pornește un stream (poate fi test, privat).
2. Din Creator Dashboard, cât ești live, deschide extensia → se deschide
   **Live Config**.
3. Lipește acolo URL-ul EBS-ului (de la Pasul 2).
4. Apasă **Copiază tokenul**.
5. Apasă **Deschide consola de ascultare** — se deschide un tab nou, normal
   (nu în Twitch), la `<url-ul-ebs-ului>/capture`.
6. În tabul nou, lipește tokenul copiat, apasă **Pornește ascultarea**,
   permite accesul la microfon când browserul cere, și vorbește în română.
7. Deschide canalul tău într-un tab separat, ca viewer, și verifică
   subtitrarea peste player.

Dacă streamul ține mult și consola de ascultare arată eroare de autorizare,
întoarce-te la Live Config, copiază un token proaspăt, și lipește-l din nou
în consolă.

### 6. Trimite spre review

Tab **Status** → **Submit for Review**. De obicei durează câteva zile.

## O notă despre corectitudinea API-urilor Twitch

Codul din `ebs/server.js` a fost scris pornind de la documentația curentă
Twitch pentru semnarea JWT-urilor și endpoint-ul „Send Extension PubSub
Message". API-urile astea se mai schimbă în timp — dacă apar erori de
autentificare, primul loc de verificat e
[referința oficială](https://dev.twitch.tv/docs/api/reference/#send-extension-pubsub-message).
