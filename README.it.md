# Motio

Video fatti con React. Motio rende un albero React fotogramma per fotogramma in un vero Chrome headless e lo codifica con FFmpeg. La sua API pubblica è compatibile con quella documentata di Remotion: un progetto esistente si porta cambiando gli import, oppure senza toccare niente grazie all'alias del bundler. Licenza Apache-2.0, gratuito per qualsiasi uso.

> Stato: pre-alpha, in sviluppo. Su npm non è ancora pubblicato niente.

[Read in English](README.md)

## Perché

- **Open source**: Apache-2.0, nessun costo per render o per postazione, anche per il render distribuito e per incorporare il Player.
- **Pixel di Chrome**: CSS e layout non vengono reimplementati; se in Chrome si vede bene, il render è uguale.
- **Determinismo verificato**: stesso progetto, stesse props e stesso fotogramma danno gli stessi pixel in qualsiasi ordine, controllato sugli hash dei fotogrammi decodificati.
- **Pensato per gli agent**: ogni comando ha l'output `--json`, errori con codici stabili, still, contact sheet, controlli di sfarfallio e di determinismo.

## Per iniziare

```bash
pnpm create motio my-video     # oppure: npm create motio@latest my-video
cd my-video
pnpm dev                       # anteprima nel browser
pnpm render                    # render in out/intro.mp4
```

`motio init` (lo stesso comando dentro la CLI) crea un progetto da uno degli starter di Motio: `basic`, `blank` o `captions`. La [guida](docs/guide/README.md), in inglese, parte da lì: struttura del progetto, fotogrammi e tempo, composizioni, sequenze, animazione, media (immagini animate, precaricamento per il Player), font e sfondi per il testo, attesa dei dati, render da CLI e da Node (funzioni sui file media, un solo browser per molti render), FFmpeg, test dei render in CI e migrazione da Remotion.

## Requisiti

- Node 22 o successivo, pnpm.
- FFmpeg 5.1 o successivo con libx264 nel `PATH` (lo controlla `motio doctor`), oppure la build a versione fissa descritta sotto.
- Il `chrome-headless-shell` a versione fissa viene scaricato al primo uso (`motio browser ensure`).

## FFmpeg a versione fissa (facoltativo)

Con `pnpm add -D @motiojs/ffmpeg` ogni render usa la stessa build di FFmpeg 8.1.3, con tutti gli encoder che servono a Motio (H.264, H.265, AV1, VP8, VP9, ProRes, AAC, MP3, Opus). Viene scaricata al primo uso (o con `motio ffmpeg ensure`) e verificata con uno SHA-256 scritto nel pacchetto. Senza il pacchetto Motio usa l'FFmpeg nel `PATH`; `MOTIO_FFMPEG` ha sempre la precedenza su entrambi.

I binari scaricati sono build di FFmpeg con licenza GPL (GPL-3.0 o successiva). Ogni release degli archivi pubblica anche i sorgenti esatti, gli script di build ([`tools/ffmpeg-build/`](tools/ffmpeg-build/)) e i testi delle licenze. Motio esegue FFmpeg come programma separato, quindi usarli non cambia la licenza di Motio, del tuo progetto o dei tuoi video. I dettagli sono nel [README del pacchetto](packages/ffmpeg/README.md) e in D-065.

## Documentazione

La documentazione è in inglese:

- [Guida](docs/guide/README.md): per chi fa video con Motio
- [Architettura](docs/ARCHITECTURE.md)
- [Roadmap](docs/ROADMAP.md)
- [Decisioni](docs/DECISIONS.md)
- [Convenzioni](docs/CONVENTIONS.md)

## Sviluppo

```bash
pnpm install
make check              # format, lint, build, build del sito, test
make test-integration   # Chrome e FFmpeg reali
```

## Sito

`website/` contiene la landing page e la documentazione (Astro e Starlight), non ancora pubblicate. La documentazione si costruisce da `docs/guide/` e dai README della CLI e dei pacchetti, senza copie. `make site` la avvia su http://localhost:4321, `make site-build` la costruisce e controlla ogni link. Il brand kit (logo, palette, caratteri, movimento) è in [`brand/`](brand/README.md).

## Licenza

Apache-2.0, vedi [LICENSE](LICENSE) e [NOTICE](NOTICE). Remotion è un marchio del rispettivo proprietario; Motio è un progetto indipendente, non affiliato a Remotion né approvato da Remotion.
