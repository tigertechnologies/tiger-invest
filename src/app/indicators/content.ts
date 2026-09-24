export type Tone = 'up' | 'down' | 'warn' | 'info' | 'violet' | 'neon';
export type Item = { label: string; tone: Tone; text: string };
export type Section = {
  id: string;
  emoji: string;
  title: string;
  category: 'momento' | 'tendencia' | 'volatilidade' | 'avancado';
  short: string;
  what: { q: string; a: string };
  groups: { title: string; intro?: string; items: Item[] }[];
  tip: string;
};

export const SECTIONS: Section[] = [
  {
    id: 'rsi', emoji: '📊', title: 'RSI (Índice de Força Relativa)', category: 'momento', short: 'Sobrecompra e sobrevenda na escala 0-100',
    what: { q: 'O que é o RSI?', a: 'O RSI compara o tamanho médio das altas com o das quedas em 14 períodos e devolve um valor entre 0 e 100. Ele mostra se o movimento recente foi forte demais para um lado.' },
    groups: [{ title: 'Como interpretar', items: [
      { label: 'RSI < 30', tone: 'up', text: 'Sobrevenda. A queda recente foi intensa e um repique fica mais provável. No motor, soma +2 aos sinais de compra.' },
      { label: 'RSI 30-70', tone: 'warn', text: 'Zona neutra, sem extremo. O RSI não gera sinal aqui.' },
      { label: 'RSI > 70', tone: 'down', text: 'Sobrecompra. A alta recente foi intensa e uma correção fica mais provável. Soma +2 aos sinais de venda.' },
    ] }],
    tip: 'Em tendências fortes o RSI pode ficar muito tempo acima de 70 ou abaixo de 30. Use-o junto com tendência (ADX, médias) e não sozinho.',
  },
  {
    id: 'macd', emoji: '📈', title: 'MACD (Convergência e Divergência de Médias)', category: 'momento', short: 'Momento da tendência e cruzamentos',
    what: { q: 'O que é o MACD?', a: 'O MACD é a diferença entre as EMAs de 12 e 26 períodos. A linha de sinal é a EMA de 9 períodos do próprio MACD, e o histograma mostra a distância entre as duas.' },
    groups: [{ title: 'Como interpretar', items: [
      { label: 'MACD cruza acima do sinal', tone: 'up', text: 'O momento virou para cima. Cruzamento recente (até 3 velas) vale +2; MACD apenas acima do sinal vale +1.' },
      { label: 'MACD cruza abaixo do sinal', tone: 'down', text: 'O momento virou para baixo. Mesmos pesos, do lado vendedor.' },
      { label: 'Cruzamento da linha zero', tone: 'info', text: 'Indica mudança de tendência de médio prazo. Vale +0,5 na direção do cruzamento.' },
      { label: 'Divergência', tone: 'violet', text: 'Preço e MACD andando em direções opostas costumam anteceder perda de força do movimento.' },
    ] }],
    tip: 'O MACD reage com atraso por ser feito de médias. Ele confirma a tendência melhor do que antecipa topos e fundos.',
  },
  {
    id: 'bollinger', emoji: '📉', title: 'Bandas de Bollinger', category: 'volatilidade', short: 'Canais dinâmicos baseados em volatilidade',
    what: { q: 'O que são as Bandas de Bollinger?', a: 'Uma média simples de 20 períodos com duas bandas a 2 desvios-padrão acima e abaixo. Elas se abrem quando a volatilidade sobe e se fecham quando ela cai.' },
    groups: [{ title: 'Como interpretar', items: [
      { label: 'Preço na banda superior', tone: 'down', text: 'Esticado para cima em relação à média. Soma +1,5 à venda.' },
      { label: 'Preço na banda inferior', tone: 'up', text: 'Esticado para baixo. Soma +1,5 à compra.' },
      { label: 'Squeeze (bandas apertadas)', tone: 'warn', text: 'Volatilidade no menor nível das últimas 120 velas. Costuma anteceder um movimento forte, sem indicar a direção.' },
      { label: 'Caminhada na banda', tone: 'info', text: 'Fechamentos seguidos colados em uma banda mostram tendência forte, não reversão.' },
    ] }],
    tip: 'Tocar a banda não é sinal de reversão por si só. Combine com RSI, Estocástico ou um padrão de candle.',
  },
  {
    id: 'sr', emoji: '🎯', title: 'Suporte e Resistência', category: 'volatilidade', short: 'Níveis de preço por agrupamento de pivôs',
    what: { q: 'Como os níveis são calculados?', a: 'O motor encontra topos e fundos locais (pivôs) nas últimas 200 velas e agrupa os que estão próximos. Cada nível ganha uma contagem de toques: quantas velas passaram por ele. Também calculamos os pivôs clássicos (P, S1-S3, R1-R3) da vela anterior.' },
    groups: [{ title: 'Como interpretar', items: [
      { label: 'Suporte', tone: 'up', text: 'Nível abaixo do preço onde compradores já apareceram. A até 1,5% de um suporte com 3+ toques, soma +1 à compra.' },
      { label: 'Resistência', tone: 'down', text: 'Nível acima do preço onde vendedores já apareceram. Mesma regra, do lado vendedor.' },
      { label: 'Rompimento', tone: 'info', text: 'Resistência rompida tende a virar suporte, e vice-versa.' },
      { label: 'Força (1-5)', tone: 'violet', text: 'Quanto mais pivôs e toques no mesmo nível, maior a força.' },
    ] }],
    tip: 'Níveis são zonas, não linhas exatas. Coloque stops um pouco além do nível, não em cima dele.',
  },
  {
    id: 'ma', emoji: '📊', title: 'Médias Móveis (MA 50 e MA 200)', category: 'tendencia', short: 'Tendência de médio e longo prazo',
    what: { q: 'O que são médias móveis?', a: 'A média simples dos fechamentos em uma janela. A MA 200 resume a tendência de longo prazo e a MA 50, a de médio prazo.' },
    groups: [{ title: 'Como interpretar', items: [
      { label: 'Preço acima da MA 200', tone: 'up', text: 'Tendência de longo prazo positiva: +1 à compra.' },
      { label: 'Preço abaixo da MA 200', tone: 'down', text: 'Tendência de longo prazo negativa: +1 à venda.' },
      { label: 'Cruzamento Dourado', tone: 'up', text: 'MA 50 cruzando acima da MA 200 nas últimas 5 velas: +2 à compra.' },
      { label: 'Cruzamento da Morte', tone: 'down', text: 'MA 50 cruzando abaixo da MA 200: +2 à venda.' },
      { label: 'Suporte e resistência dinâmicos', tone: 'warn', text: 'Em tendência, o preço costuma reagir quando volta às médias.' },
    ] }],
    tip: 'Médias funcionam bem em tendência e geram sinais falsos em mercado lateral. Confira o ADX antes de confiar nelas.',
  },
  {
    id: 'ema-sma', emoji: '〽️', title: 'EMA e SMA', category: 'tendencia', short: 'Médias exponenciais versus simples',
    what: { q: 'Qual é a diferença?', a: 'A SMA dá o mesmo peso a todos os preços da janela. A EMA dá mais peso aos preços recentes e por isso reage mais rápido.' },
    groups: [{ title: 'Períodos usados no motor', items: [
      { label: 'EMA 7 e EMA 21', tone: 'info', text: 'Tendência de curto prazo. EMA 7 acima da EMA 21 vale +0,5; um cruzamento recente vale +1,5.' },
      { label: 'EMA 12 e EMA 26', tone: 'up', text: 'Base do cálculo do MACD.' },
      { label: 'SMA 20', tone: 'warn', text: 'Banda central de Bollinger.' },
      { label: 'SMA 50 e SMA 200', tone: 'neon', text: 'Tendência de médio e longo prazo; cruzamentos Dourado e da Morte.' },
      { label: 'EMA 50 e EMA 200', tone: 'violet', text: 'Versão mais rápida das médias longas, exibida no painel.' },
    ] }],
    tip: 'Use EMAs para timing de curto prazo e SMAs para enxergar a tendência principal.',
  },
  {
    id: 'crossovers', emoji: '✖️', title: 'Cruzamento de Médias Móveis', category: 'tendencia', short: 'Cruzamentos e projeção do próximo cruzamento',
    what: { q: 'O que são cruzamentos?', a: 'O momento em que uma média mais rápida passa por cima ou por baixo de uma mais lenta. Indicam mudança de tendência no prazo daquelas médias.' },
    groups: [
      { title: 'Tipos de cruzamento', items: [
        { label: 'Curto prazo (EMA 7/21)', tone: 'info', text: 'Frequentes e rápidos, úteis para swing trade. De alta quando a EMA 7 passa acima da EMA 21; de baixa no inverso.' },
        { label: 'Longo prazo (SMA 50/200)', tone: 'violet', text: 'Raros e lentos. Dourado (alta) ou da Morte (baixa).' },
      ] },
      { title: 'Projeção de cruzamento', items: [
        { label: 'Como estimamos', tone: 'neon', text: 'Medimos a distância atual entre as médias e quanto ela mudou nas últimas 5 velas. Se estão se aproximando, dividimos uma pela outra para estimar em quantas velas devem se cruzar (até 60).' },
      ] },
    ],
    tip: 'Espere o fechamento da vela para confirmar o cruzamento e combine com volume e RSI.',
  },
  {
    id: 'bmsb', emoji: '🐂', title: 'Bull Market Support Band', category: 'tendencia', short: 'SMA 20 + EMA 21 semanais',
    what: { q: 'O que é a BMSB?', a: 'A faixa entre a SMA de 20 semanas e a EMA de 21 semanas. Em mercados de alta do BTC ela costuma funcionar como suporte nos recuos.' },
    groups: [{ title: 'Como interpretar', items: [
      { label: 'Preço acima da banda', tone: 'up', text: 'Mercado de alta sustentado: +1 à compra. Mais de 10% acima indica preço esticado no score de position.' },
      { label: 'Preço dentro da banda', tone: 'warn', text: 'Ponto de decisão: teste de suporte.' },
      { label: 'Preço abaixo da banda', tone: 'down', text: 'Perda da estrutura de alta: +1 à venda na análise técnica, mas zona de acumulação no score de position.' },
      { label: 'Recuperação da banda', tone: 'info', text: 'Voltar acima depois de perdê-la costuma marcar retomada de força.' },
    ] }],
    tip: 'A BMSB é um indicador semanal. Funciona melhor em BTC e grandes caps do que em altcoins pequenas.',
  },
  {
    id: 'stochastic', emoji: '📊', title: 'Oscilador Estocástico', category: 'momento', short: 'Fechamento versus faixa de preço (%K/%D)',
    what: { q: 'O que é o Estocástico?', a: 'Mostra onde o fechamento está dentro da faixa de máxima e mínima dos últimos 14 períodos (%K). A linha %D é a média de 3 períodos do %K. Varia de 0 a 100.' },
    groups: [{ title: 'Como interpretar', items: [
      { label: '%K < 20 cruzando acima de %D', tone: 'up', text: 'Cruzamento de alta em sobrevenda: +1,5 à compra. Só em sobrevenda: +0,5.' },
      { label: '%K > 80 cruzando abaixo de %D', tone: 'down', text: 'Cruzamento de baixa em sobrecompra: +1,5 à venda. Só em sobrecompra: +0,5.' },
      { label: 'Divergência', tone: 'warn', text: 'Preço faz nova máxima ou mínima e o Estocástico não acompanha.' },
    ] }],
    tip: 'O Estocástico brilha em mercado lateral. Em tendência forte ele fica "grudado" nos extremos.',
  },
  {
    id: 'fibonacci', emoji: '🔢', title: 'Retração de Fibonacci', category: 'volatilidade', short: 'Níveis de 23,6% a 78,6% e extensões',
    what: { q: 'O que é a retração de Fibonacci?', a: 'Divide o último grande movimento (máxima e mínima das últimas 100 velas) em proporções derivadas da sequência de Fibonacci. São níveis onde muitos traders esperam reação.' },
    groups: [
      { title: 'Níveis principais', items: [
        { label: '23,6%', tone: 'up', text: 'Recuo raso: tendência muito forte.' },
        { label: '38,2%', tone: 'warn', text: 'Recuo comum em tendências saudáveis.' },
        { label: '50%', tone: 'warn', text: 'Metade do movimento. Não é Fibonacci, mas é muito observado.' },
        { label: '61,8%', tone: 'down', text: 'Proporção áurea, o nível mais vigiado. Com o preço a até 1,5% dele, o motor soma +1,5.' },
        { label: '78,6%', tone: 'violet', text: 'Recuo profundo: última defesa da tendência.' },
      ] },
      { title: 'Extensões', items: [{ label: '127,2% · 161,8% · 261,8%', tone: 'info', text: 'Alvos possíveis quando o preço rompe o topo (ou fundo) anterior.' }] },
    ],
    tip: 'Em 38,2%, 50% e 61,8% o motor soma sinal na direção da tendência. Espere confirmação de candle ou volume.',
  },
  {
    id: 'volatility', emoji: '⚡', title: 'Análise de Volatilidade', category: 'volatilidade', short: 'Largura das Bandas de Bollinger',
    what: { q: 'Como medimos?', a: 'Volatilidade = (banda superior − banda inferior) ÷ banda média × 100.' },
    groups: [{ title: 'Classificações', items: [
      { label: 'Alta (> 15%)', tone: 'down', text: 'Oscilações amplas. Posições menores e stops mais largos.' },
      { label: 'Média (8-15%)', tone: 'warn', text: 'Faixa típica das principais criptos.' },
      { label: 'Baixa (< 8%)', tone: 'up', text: 'Mercado calmo. Costuma anteceder rompimentos.' },
      { label: 'Faixas de liquidez', tone: 'info', text: 'Pares voláteis pedem faixas mais amplas (±30%); pares estáveis aceitam faixas estreitas (±5%).' },
    ] }],
    tip: 'Mais volatilidade = posição menor. Menos volatilidade = atenção ao próximo rompimento.',
  },
  {
    id: 'correlation', emoji: '🔗', title: 'Correlação de Preço', category: 'avancado', short: 'Relação com o BTC (−1 a +1)',
    what: { q: 'O que é a correlação?', a: 'Mede, de −1 a +1, o quanto os retornos de um token acompanham os do BTC. Usamos os últimos 30 períodos do mesmo tempo gráfico.' },
    groups: [{ title: 'Valores', items: [
      { label: '+0,7 a +1', tone: 'up', text: 'Anda junto com o BTC. A maioria das altcoins fica aqui.' },
      { label: 'Perto de 0', tone: 'warn', text: 'Movimento independente: ajuda na diversificação.' },
      { label: '−0,7 a −1', tone: 'down', text: 'Anda ao contrário do BTC. Raro em cripto.' },
      { label: 'Gestão de risco', tone: 'info', text: 'Dois ativos com correlação acima de 0,9 são, na prática, a mesma aposta.' },
    ] }],
    tip: 'A correlação muda com o tempo e tende a subir em quedas fortes do mercado.',
  },
  {
    id: 'volume', emoji: '📊', title: 'Análise de Volume', category: 'volatilidade', short: 'OBV, VWAP, tendência e picos',
    what: { q: 'Por que o volume importa?', a: 'Volume mostra a convicção por trás do movimento. Alta com volume crescente é mais confiável do que alta com volume secando.' },
    groups: [
      { title: 'Indicadores', items: [
        { label: 'OBV', tone: 'info', text: 'Soma o volume nas velas de alta e subtrai nas de baixa. OBV subindo = acumulação.' },
        { label: 'VWAP (50 velas)', tone: 'violet', text: 'Preço médio ponderado por volume. Acima dele: +0,5 à compra; abaixo: +0,5 à venda.' },
        { label: 'Pico de volume', tone: 'warn', text: 'Volume acima de 2× a média de 20 velas.' },
      ] },
      { title: 'Sinais no motor', items: [
        { label: 'Confirmação de alta', tone: 'up', text: 'Preço, volume e OBV subindo: +1,5 à compra.' },
        { label: 'Confirmação de baixa', tone: 'down', text: 'Preço caindo com volume subindo e OBV caindo: +1,5 à venda.' },
        { label: 'Divergência de volume', tone: 'warn', text: 'Nova máxima com volume abaixo de 85% da média: +1 à venda.' },
      ] },
    ],
    tip: 'Rompimento sem volume costuma falhar. Espere o volume confirmar.',
  },
  {
    id: 'adx', emoji: '🧭', title: 'ADX (Índice Direcional Médio)', category: 'tendencia', short: 'Força da tendência e filtro de sinais',
    what: { q: 'O que é o ADX?', a: 'Mede a força da tendência de 0 a 100, sem dizer a direção. A direção vem do +DI (pressão compradora) e do −DI (pressão vendedora). Criado por J. Welles Wilder.' },
    groups: [
      { title: 'Faixas', items: [
        { label: 'ADX < 20', tone: 'down', text: 'Sem tendência. O motor reduz todos os sinais em 70%, porque indicadores de tendência erram muito em mercado lateral.' },
        { label: 'ADX 20-25', tone: 'warn', text: 'Tendência se formando.' },
        { label: 'ADX 25-50', tone: 'up', text: 'Tendência forte. Soma +1,5 na direção indicada pelo +DI/−DI.' },
        { label: 'ADX > 50', tone: 'info', text: 'Tendência muito forte. Sinais de seguimento de tendência ganham +20%.' },
      ] },
      { title: 'Indicadores direcionais', items: [
        { label: '+DI > −DI', tone: 'up', text: 'Viés comprador.' },
        { label: '−DI > +DI', tone: 'down', text: 'Viés vendedor.' },
      ] },
    ],
    tip: 'Olhe o ADX antes de qualquer operação: ele diz se vale a pena seguir a tendência ou esperar.',
  },
  {
    id: 'atr', emoji: '💥', title: 'ATR (Average True Range)', category: 'volatilidade', short: 'Volatilidade absoluta para stops e alvos',
    what: { q: 'O que é o ATR?', a: 'A média de 14 períodos do "true range": o maior valor entre máxima − mínima, |máxima − fechamento anterior| e |mínima − fechamento anterior|. Responde "quanto este ativo costuma se mover por vela".' },
    groups: [
      { title: 'ATR como % do preço', items: [
        { label: 'ATR < 2%', tone: 'up', text: 'Volatilidade baixa: faixa de liquidez estreita.' },
        { label: 'ATR 2-5%', tone: 'warn', text: 'Volatilidade normal: faixa média.' },
        { label: 'ATR > 5%', tone: 'down', text: 'Volatilidade alta: faixa ampla e posição menor.' },
      ] },
      { title: 'Como o motor usa', items: [
        { label: 'Stop loss', tone: 'neon', text: 'Entrada − 2× ATR para compras e entrada + 2× ATR para vendas.' },
        { label: 'Alvos', tone: 'up', text: 'Múltiplos do risco: 1,5R, 2,5R e 4R.' },
        { label: 'Expansão', tone: 'violet', text: 'ATR 20% maior que 14 velas atrás soma +1 na direção do movimento.' },
        { label: 'Tamanho de posição', tone: 'info', text: 'Risco por operação ÷ (2× ATR) = quantidade de unidades.' },
      ] },
    ],
    tip: 'Stops em múltiplos de ATR se ajustam à volatilidade de cada ativo, ao contrário de um percentual fixo.',
  },
  {
    id: 'ichimoku', emoji: '☁️', title: 'Nuvem Ichimoku', category: 'tendencia', short: 'Sistema completo com 5 componentes',
    what: { q: 'O que é o Ichimoku?', a: 'Sistema criado por Goichi Hosoda que mostra tendência, momento e zonas de suporte e resistência futuras em um só gráfico.' },
    groups: [
      { title: 'Componentes', items: [
        { label: 'Tenkan-sen (9)', tone: 'info', text: 'Ponto médio entre máxima e mínima de 9 períodos. Linha rápida.' },
        { label: 'Kijun-sen (26)', tone: 'violet', text: 'Ponto médio de 26 períodos. Linha base, suporte ou resistência dinâmica.' },
        { label: 'Senkou Span A', tone: 'up', text: '(Tenkan + Kijun) ÷ 2, projetada 26 períodos à frente.' },
        { label: 'Senkou Span B (52)', tone: 'up', text: 'Ponto médio de 52 períodos, projetado 26 à frente. Span A > B = nuvem verde.' },
        { label: 'Chikou Span', tone: 'warn', text: 'Fechamento atual comparado com o preço de 26 períodos atrás.' },
      ] },
      { title: 'Sinais no motor', items: [
        { label: 'Configuração forte de alta', tone: 'up', text: 'Preço acima da nuvem verde e Tenkan > Kijun: +2,5 à compra.' },
        { label: 'Configuração forte de baixa', tone: 'down', text: 'Preço abaixo da nuvem vermelha e Tenkan < Kijun: +2,5 à venda.' },
        { label: 'Cruzamento TK', tone: 'info', text: 'Tenkan cruzando a Kijun: ±1,5.' },
        { label: 'Preço dentro da nuvem', tone: 'warn', text: 'Indecisão: todos os sinais perdem 10%.' },
        { label: 'Torção e borda', tone: 'violet', text: 'Mudança de cor da nuvem projetada e alerta quando o preço está a até 2% da borda.' },
      ] },
    ],
    tip: 'Funciona melhor em 4h, diário e semanal. Combine com ADX acima de 25 para filtrar sinais.',
  },
  {
    id: 'divergence', emoji: '🔀', title: 'Divergência de RSI', category: 'momento', short: 'Quatro tipos com classificação de força',
    what: { q: 'O que é divergência?', a: 'Quando preço e RSI discordam entre dois topos ou dois fundos recentes. O motor compara os dois últimos pivôs das últimas 60 velas; o mais recente precisa estar nas últimas 8.' },
    groups: [
      { title: 'Tipos', items: [
        { label: 'Altista regular', tone: 'up', text: 'Preço faz fundo mais baixo, RSI faz fundo mais alto. Possível reversão para cima: +3 (forte) ou +2.' },
        { label: 'Baixista regular', tone: 'down', text: 'Preço faz topo mais alto, RSI faz topo mais baixo. Possível reversão para baixo: +3 ou +2 à venda.' },
        { label: 'Altista oculta', tone: 'info', text: 'Preço faz fundo mais alto, RSI faz fundo mais baixo. Continuação da alta: +1,5.' },
        { label: 'Baixista oculta', tone: 'violet', text: 'Preço faz topo mais baixo, RSI faz topo mais alto. Continuação da baixa: +1,5 à venda.' },
      ] },
      { title: 'Força', items: [
        { label: 'Forte', tone: 'up', text: 'Diferença de RSI acima de 10 pontos entre os pivôs.' },
        { label: 'Fraca', tone: 'warn', text: 'Diferença de até 10 pontos. Espere confirmação.' },
      ] },
    ],
    tip: 'Divergências regulares são sinais de reversão; ocultas, de continuação. Nenhuma deve ser operada sozinha.',
  },
  {
    id: 'pools', emoji: '💧', title: 'Pools de Liquidez', category: 'avancado', short: 'Faixas estreita, média e ampla',
    what: { q: 'O que são pools de liquidez?', a: 'Contratos que guardam pares de tokens para as DEXs. Quem fornece liquidez ganha taxas das trocas, mas fica exposto à perda impermanente quando o preço se move.' },
    groups: [
      { title: 'Faixas', items: [
        { label: 'Estreita (±5%)', tone: 'up', text: 'Mais taxas por dólar, mas sai da faixa com facilidade.' },
        { label: 'Média (±15%)', tone: 'warn', text: 'Equilíbrio entre taxas e estabilidade.' },
        { label: 'Ampla (±30%)', tone: 'info', text: 'Menos manutenção, menos taxas. Para pares voláteis.' },
      ] },
      { title: 'Cobertura histórica', items: [
        { label: 'Últimas 100 velas', tone: 'neon', text: 'Mostramos em quantas das últimas 100 velas o preço teria ficado dentro de cada faixa. A faixa recomendada segue o ATR.' },
      ] },
    ],
    tip: 'Faixas estreitas exigem acompanhamento ativo. Escolha pela sua disponibilidade, não só pelo APY.',
  },
  {
    id: 'scoring', emoji: '🎯', title: 'Sistema de Pontuação de Sinais', category: 'avancado', short: 'Pontuação líquida e confiança',
    what: { q: 'Como os sinais viram recomendação?', a: 'Cada indicador pode gerar um sinal de compra ou de venda com um peso. Depois dos filtros (ADX, nuvem), somamos os pesos de cada lado. Pontuação líquida = compra − venda.' },
    groups: [
      { title: 'Recomendação', items: [
        { label: 'Compra forte', tone: 'up', text: 'Líquida ≥ 4 com confiança alta (≥ 75%).' },
        { label: 'Compra', tone: 'up', text: 'Líquida ≥ 2.' },
        { label: 'Manter', tone: 'warn', text: 'Líquida maior que −2 e menor que 2.' },
        { label: 'Venda', tone: 'down', text: 'Líquida ≤ −2.' },
        { label: 'Venda forte', tone: 'down', text: 'Líquida ≤ −4 com confiança alta.' },
      ] },
      { title: 'Confiança', items: [
        { label: 'Alta (75%+)', tone: 'up', text: 'O lado dominante concentra 75% ou mais do peso total.' },
        { label: 'Média (50-75%)', tone: 'warn', text: 'Concordância moderada.' },
        { label: 'Baixa (< 50%)', tone: 'down', text: 'Sinais conflitantes. Com peso total abaixo de 3, a confiança nunca passa de 60%.' },
      ] },
    ],
    tip: 'Confiança alta significa indicadores concordando, não certeza de resultado. Confira mais de um tempo gráfico.',
  },
];

export const CATEGORY = {
  momento: { title: 'Indicadores de momento', emoji: '⚡', tone: 'violet' as Tone },
  tendencia: { title: 'Indicadores de tendência', emoji: '📈', tone: 'info' as Tone },
  volatilidade: { title: 'Volatilidade e ação de preço', emoji: '📊', tone: 'up' as Tone },
  avancado: { title: 'Métricas avançadas', emoji: '💡', tone: 'warn' as Tone },
};
