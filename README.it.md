# Motio

Video fatti con React. Motio rende un albero React fotogramma per fotogramma in un vero Chrome headless e lo codifica con FFmpeg. La sua API pubblica è compatibile con quella documentata di Remotion: un progetto esistente si porta cambiando gli import, oppure senza toccare niente grazie all'alias del bundler. Licenza Apache-2.0, gratuito per qualsiasi uso.

> Stato: pre-alpha, in sviluppo. Su npm non è ancora pubblicato niente.

[Read in English](README.md)

## Perché

- **Open source**: Apache-2.0, nessun costo per render o per postazione, anche per il render distribuito e per incorporare il Player.
- **Pixel di Chrome**: CSS e layout non vengono reimplementati; se in Chrome si vede bene, il render è uguale.
- **Determinismo verificato**: stesso progetto, stesse props e stesso fotogramma danno gli stessi pixel in qualsiasi ordine, controllato sugli hash dei fotogrammi decodificati.
- **Pensato per gli agent**: ogni comando ha l'output `--json`, errori con codici stabili, still, contact sheet, controlli di sfarfallio e di determinismo.

## Requisiti

- Node 22 o successivo, pnpm.
- FFmpeg con libx264 nel `PATH` (lo controlla `motio doctor`).
- Il `chrome-headless-shell` a versione fissa viene scaricato al primo uso (`motio browser ensure`).

## Documentazione

La documentazione tecnica è in inglese:

- [Architettura](docs/ARCHITECTURE.md)
- [Roadmap](docs/ROADMAP.md)
- [Decisioni](docs/DECISIONS.md)
- [Convenzioni](docs/CONVENTIONS.md)

## Sviluppo

```bash
pnpm install
make check              # format, lint, build, test
make test-integration   # Chrome e FFmpeg reali
```

## Licenza

Apache-2.0, vedi [LICENSE](LICENSE) e [NOTICE](NOTICE). Remotion è un marchio del rispettivo proprietario; Motio è un progetto indipendente, non affiliato a Remotion né approvato da Remotion.
