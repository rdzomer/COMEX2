/**
 * Converte o gráfico (SVG do Recharts) dentro de um elemento em PNG, para inserir na Ficha em Word.
 * Se não houver SVG (ex.: aviso de "sem dados"), desenha o texto do elemento numa imagem.
 */
export async function elementToPng(el: HTMLElement, width: number, height: number, scale = 2): Promise<Uint8Array> {
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  const svg = el.querySelector('svg.recharts-surface') as SVGSVGElement | null;
  if (svg) {
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', String(width));
    clone.setAttribute('height', String(height));
    clone.setAttribute('style', 'font-family: Inter, Arial, Helvetica, sans-serif; background: #fff');
    const xml = new XMLSerializer().serializeToString(clone);
    const img = new Image();
    const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }));
    try {
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Falha ao converter gráfico em imagem'));
        img.src = url;
      });
      ctx.drawImage(img, 0, 0, width, height);
    } finally {
      URL.revokeObjectURL(url);
    }
    // Legenda HTML do Recharts (fora do SVG): desenha por cima, no topo
    const legendItems = Array.from(el.querySelectorAll('.recharts-legend-item')) as HTMLElement[];
    if (legendItems.length) {
      ctx.font = '12px Inter, Arial, sans-serif';
      let x = width / 2 - legendItems.reduce((s, li) => s + ctx.measureText(li.textContent || '').width + 30, 0) / 2;
      legendItems.forEach(li => {
        const color = (li.querySelector('path, line, rect') as SVGElement | null)?.getAttribute('fill') ||
          (li.querySelector('path, line') as SVGElement | null)?.getAttribute('stroke') || '#333';
        const label = li.textContent || '';
        ctx.fillStyle = color === 'none' ? ((li.querySelector('path, line') as SVGElement | null)?.getAttribute('stroke') || '#333') : color;
        ctx.fillRect(x, 12, 12, 10);
        ctx.fillStyle = '#334155';
        ctx.fillText(label, x + 16, 21);
        x += ctx.measureText(label).width + 30;
      });
    }
  } else {
    ctx.fillStyle = '#64748b';
    ctx.font = '16px Inter, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText((el.textContent || '').trim(), width / 2, height / 2);
  }

  const blob: Blob = await new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob falhou'))), 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}
