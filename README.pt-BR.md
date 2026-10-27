# SuperTokenMan

[English](README.md) · Português (Brasil) · [Español](README.es.md)

Um app para Mac em volta do Claude Code: vários painéis lado a lado, aprovação de ferramentas na própria
janela e um medidor que mostra quanto uma sessão custa e o que o app deixou fora do contexto. Ele roda o
Claude Code pelo Agent SDK com o seu próprio login, configurações, plugins e hooks.

Site: https://supertokenman.com

## Download

Builds assinados e notarizados para Apple silicon e Intel estão em
[Releases](https://github.com/supertokenman/supertokenman/releases), cada um com um `SHA256SUMS`. Para conferir um download:

```bash
shasum -a 256 -c SHA256SUMS --ignore-missing
codesign --verify --deep --strict --verbose=2 /Applications/SuperTokenMan.app
spctl -a -vv /Applications/SuperTokenMan.app      # "source=Notarized Developer ID"
```

## Compilar a partir do código

```bash
cd app && npm install && npm start
```

Detalhes, testes e o script de instalação no Mac: [app/README.md](app/README.md).

## O que tem neste repositório

| Pasta | O quê |
|---|---|
| `app/` | O app Electron (React, Vite, o Claude Agent SDK). |
| `token-kit/` | `tk`: os hooks de shell e o condensador que o app usa para manter saídas longas fora do contexto. |
| `site/` | A landing page (estática). |
| `docs/` | Notas de marca e design, passos de release, o que ficou de fora de cada fase e por quê. |

## Privacidade e segurança, em resumo

- Seu login do Claude, chaves de API e senhas ficam no seu Mac, no keychain do sistema; os painéis recebem
  só os nomes que você marca para comandos.
- Nada é postado, enviado, implantado ou publicado sem o seu clique e uma confirmação.
- Sem telemetria. Por conta própria, o app só acessa o endpoint do Claude Code e a checagem de
  atualização; todo o resto espera você ativar. A lista: [docs/NETWORK.md](docs/NETWORK.md).

Para relatar um problema de segurança: [SECURITY.md](SECURITY.md).

## Licença

[FSL-1.1-ALv2](LICENSE.md), © 2026 Yuji Miguel Arima. Você pode ler, auditar, compilar, alterar e usar o
código para qualquer coisa, menos um produto comercial concorrente. Cada versão vira Apache 2.0 dois anos
depois do lançamento.
