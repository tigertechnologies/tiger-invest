// Camada visual: orbes, feixes, velas fantasma e tokens flutuantes.
function candles() {
  const n = 28, step = 440 / n
  let price = 120
  const Y = (p: number) => Math.max(10, Math.min(288, 300 - (p - 70) * 1.05))
  const parts: string[] = []
  let seed = 11
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280 }
  for (let i = 0; i < n; i++) {
    const x = step * i + step * 0.5
    const o = price; price += (rnd() - 0.45) * 36; const c = price
    const hi = Math.max(o, c) + rnd() * 10 + 3
    const lo = Math.min(o, c) - rnd() * 10 - 3
    const up = c >= o, col = up ? '#2BFF9A' : '#FF4D6D'
    const yhi = Y(hi), ylo = Y(lo), bt = Math.min(Y(o), Y(c)), bb = Math.max(Y(o), Y(c))
    const bh = Math.max(2.5, bb - bt), bw = step * 0.46
    parts.push(`<line x1="${x.toFixed(1)}" y1="${yhi.toFixed(1)}" x2="${x.toFixed(1)}" y2="${ylo.toFixed(1)}" stroke="${col}" stroke-width="1.1"/>`)
    parts.push(`<rect x="${(x - bw / 2).toFixed(1)}" y="${bt.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" fill="${col}" rx="1.2"/>`)
  }
  return parts.join('')
}

export default function Background() {
  return (
    <div className="bgfx" aria-hidden>
      <div className="beams" />
      <div className="orb pink" />
      <div className="orb purple" />
      <div className="orb cyan" />
      <svg className="candles" viewBox="0 0 440 300" preserveAspectRatio="none"
        dangerouslySetInnerHTML={{ __html: candles() }} />
      <span className="tok t1">Ξ</span>
      <span className="tok t2">$</span>
      <span className="tok t3">◎</span>
      <span className="tok t4">₿</span>
    </div>
  )
}
