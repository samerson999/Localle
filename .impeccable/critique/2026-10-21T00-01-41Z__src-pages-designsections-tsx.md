---
target: /design (Design.tsx + DesignSections.tsx)
total_score: 27
max_score: 32
na_heuristics: 5,7
p0_count: 0
p1_count: 0
target_identity: "file:C:\\Users\\Samerson Silva\\Downloads\\rastreio\\src\\pages\\DesignSections.tsx"
target_fingerprint: "sha256:28750d5fafa38f62803c036a786b8ff52ff99284e9391d98dcc340ec02214bf7"
target_path: "C:\\Users\\Samerson Silva\\Downloads\\rastreio\\src\\pages\\DesignSections.tsx"
timestamp: 2026-10-21T00-01-41Z
slug: src-pages-designsections-tsx
---
# Crítica: /design (Design.tsx + DesignSections.tsx)

Modo Operate. Score 27/32 (dois n/a) — Bom.

## Veredito de especificidade
Autoral: regra de cor de revenda (6 lugares, fallback grafite), status fixo vs. dado fixo, zonas de cerca sem verde/laranja/vermelho, silhuetas por categoria — tudo implementado e demonstrado ao vivo na página.

## Scan determinístico
1 achado (warning/quality): animação de width em ui.tsx:381 (Tabs/Pills slider), 17 importadores.

## Problemas prioritários
- [P2] Página única sem indicador de seção ativa no scroll (Design.tsx:88-90), 11 seções, >700 linhas.
- [P2] width+transform no indicador de Tabs/Pills (ui.tsx:381), propaga a 17 arquivos.
- [P3] Mensagens de erro genéricas nos exemplos de ErrorState, sem causa específica.

## Persona red flags
- Alex: sem atalhos de teclado para navegar seções.
- Sam: radiogroup de revenda não anuncia resultado (pinta/grafite) no próprio rótulo do rádio.

## Observações menores
- Nota de tokens cita "agora" como changelog, não especificação.
