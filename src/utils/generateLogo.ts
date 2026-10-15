/**
 * Gerador de Logo do Canal em Alta Resolução (1000x1000px PNG)
 * Desenha em HTML5 Canvas e aciona o descarregamento imediato.
 */

export function downloadChannelLogo(): void {
  const size = 1000;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    console.error('Não foi possível obter contexto 2D do Canvas.');
    return;
  }

  // 1. Fundo: Gradiente Radial Profundo (#0f172a para #020617)
  const bgGrad = ctx.createRadialGradient(size / 2, 450, 60, size / 2, 450, 650);
  bgGrad.addColorStop(0, '#1e293b');
  bgGrad.addColorStop(0.35, '#0f172a');
  bgGrad.addColorStop(1, '#020617');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, size, size);

  // Efeito sutil de vinheta nas bordas
  const vignette = ctx.createRadialGradient(size / 2, size / 2, 380, size / 2, size / 2, 700);
  vignette.addColorStop(0, 'rgba(2, 6, 23, 0)');
  vignette.addColorStop(1, 'rgba(0, 0, 0, 0.85)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, size, size);

  // 2. Anéis de Radar Concéntricos em Esmeralda/Ciano (#10b981 com baixa opacidade)
  const centerX = 500;
  const centerY = 430;
  const rings = [140, 230, 320, 410];

  ctx.save();
  ctx.shadowColor = '#10b981';
  ctx.shadowBlur = 18;

  rings.forEach((r, idx) => {
    ctx.beginPath();
    ctx.arc(centerX, centerY, r, 0, Math.PI * 2);
    ctx.strokeStyle = idx === rings.length - 1 ? 'rgba(16, 185, 129, 0.35)' : 'rgba(16, 185, 129, 0.2)';
    ctx.lineWidth = idx === rings.length - 1 ? 3 : 2;
    ctx.stroke();
  });

  // Linhas cruzadas do radar (Eixos X e Y suaves)
  ctx.beginPath();
  ctx.moveTo(centerX - 420, centerY);
  ctx.lineTo(centerX + 420, centerY);
  ctx.moveTo(centerX, centerY - 420);
  ctx.lineTo(centerX, centerY + 420);
  ctx.strokeStyle = 'rgba(16, 185, 129, 0.12)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Linha de Varrimento do Radar (Sweep Beam)
  const sweepAngle = -Math.PI / 4; // 45 graus nordeste
  const sweepGrad = ctx.createLinearGradient(
    centerX,
    centerY,
    centerX + Math.cos(sweepAngle) * 410,
    centerY + Math.sin(sweepAngle) * 410
  );
  sweepGrad.addColorStop(0, 'rgba(52, 211, 153, 0.8)');
  sweepGrad.addColorStop(1, 'rgba(16, 185, 129, 0)');

  // Setor de varrimento com cone de sombra
  ctx.beginPath();
  ctx.moveTo(centerX, centerY);
  ctx.arc(centerX, centerY, 410, sweepAngle - Math.PI / 6, sweepAngle);
  ctx.closePath();
  const coneGrad = ctx.createRadialGradient(centerX, centerY, 10, centerX, centerY, 410);
  coneGrad.addColorStop(0, 'rgba(16, 185, 129, 0.25)');
  coneGrad.addColorStop(1, 'rgba(16, 185, 129, 0)');
  ctx.fillStyle = coneGrad;
  ctx.fill();

  // Linha principal do feixe
  ctx.beginPath();
  ctx.moveTo(centerX, centerY);
  ctx.lineTo(centerX + Math.cos(sweepAngle) * 410, centerY + Math.sin(sweepAngle) * 410);
  ctx.strokeStyle = sweepGrad;
  ctx.lineWidth = 3;
  ctx.stroke();

  // Ponto luminoso na ponta do feixe
  ctx.beginPath();
  ctx.arc(
    centerX + Math.cos(sweepAngle) * 320,
    centerY + Math.sin(sweepAngle) * 320,
    7,
    0,
    Math.PI * 2
  );
  ctx.fillStyle = '#6ee7b7';
  ctx.shadowColor = '#34d399';
  ctx.shadowBlur = 25;
  ctx.fill();

  ctx.restore();

  // 3. Ícone Central: Quadrado Arredondado Amarelo Ouro (#f59e0b)
  const sqSize = 250;
  const sqX = centerX - sqSize / 2;
  const sqY = centerY - sqSize / 2;
  const cornerRadius = 52;

  ctx.save();
  // Brilho intenso dourado atrás do ícone
  ctx.shadowColor = 'rgba(245, 158, 11, 0.65)';
  ctx.shadowBlur = 55;

  const goldGrad = ctx.createLinearGradient(sqX, sqY, sqX + sqSize, sqY + sqSize);
  goldGrad.addColorStop(0, '#fef08a'); // yellow-200
  goldGrad.addColorStop(0.3, '#fbbf24'); // amber-400
  goldGrad.addColorStop(1, '#d97706'); // amber-600

  // Desenhar retângulo arredondado
  ctx.beginPath();
  ctx.roundRect(sqX, sqY, sqSize, sqSize, cornerRadius);
  ctx.fillStyle = goldGrad;
  ctx.fill();

  // Borda fina luminosa no quadrado
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.lineWidth = 3.5;
  ctx.stroke();

  // Relâmpago Dark Nítido no centro (matching the app's header icon)
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#020617';

  ctx.beginPath();
  // Vértices do relâmpago proporcionais ao tamanho central
  ctx.moveTo(centerX + 12, centerY - 82); // topo
  ctx.lineTo(centerX - 48, centerY + 8);  // quebra esquerda
  ctx.lineTo(centerX - 4, centerY + 8);   // recuo meio
  ctx.lineTo(centerX - 24, centerY + 85); // ponta inferior
  ctx.lineTo(centerX + 52, centerY - 10); // quebra direita
  ctx.lineTo(centerX + 8, centerY - 10);  // recuo meio
  ctx.closePath();
  ctx.fill();

  ctx.restore();

  // Badge Verde de Preço / Desconto no canto inferior direito do quadrado
  ctx.save();
  const badgeX = sqX + sqSize - 25;
  const badgeY = sqY + sqSize - 25;
  const badgeR = 36;

  ctx.shadowColor = 'rgba(16, 185, 129, 0.7)';
  ctx.shadowBlur = 25;

  const badgeGrad = ctx.createLinearGradient(badgeX - badgeR, badgeY - badgeR, badgeX + badgeR, badgeY + badgeR);
  badgeGrad.addColorStop(0, '#34d399');
  badgeGrad.addColorStop(1, '#059669');

  ctx.beginPath();
  ctx.arc(badgeX, badgeY, badgeR, 0, Math.PI * 2);
  ctx.fillStyle = badgeGrad;
  ctx.fill();

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Símbolo de percentagem / euro estilizado no badge
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 32px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('%', badgeX, badgeY + 1);

  ctx.restore();

  // 4. Texto Inferior: "RADAR PT" em tipografia moderna branca arrojada
  ctx.save();
  ctx.textAlign = 'center';

  // Sombra suave no texto
  ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
  ctx.shadowBlur = 20;

  // Título Principal "RADAR PT"
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 86px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.letterSpacing = '8px';
  ctx.fillText('RADAR PT', centerX, 770);

  // Subtítulo elegante "DESCONTOS & TECH"
  ctx.shadowBlur = 10;
  ctx.shadowColor = 'rgba(245, 158, 11, 0.4)';
  ctx.fillStyle = '#fbbf24';
  ctx.font = '700 28px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.letterSpacing = '10px';
  ctx.fillText('DESCONTOS & TECH', centerX, 825);

  // Linha divisória horizontal sutil
  const divWidth = 320;
  const divGrad = ctx.createLinearGradient(centerX - divWidth / 2, 855, centerX + divWidth / 2, 855);
  divGrad.addColorStop(0, 'rgba(245, 158, 11, 0)');
  divGrad.addColorStop(0.5, 'rgba(245, 158, 11, 0.6)');
  divGrad.addColorStop(1, 'rgba(245, 158, 11, 0)');
  ctx.strokeStyle = divGrad;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(centerX - divWidth / 2, 855);
  ctx.lineTo(centerX + divWidth / 2, 855);
  ctx.stroke();

  // Handle do canal "@radardescontos_pt"
  ctx.fillStyle = '#94a3b8';
  ctx.font = '600 20px monospace';
  ctx.letterSpacing = '2px';
  ctx.fillText('@radardescontos_pt', centerX, 890);

  ctx.restore();

  // 5. Descarregamento imediato do Canvas como PNG
  const dataUrl = canvas.toDataURL('image/png');
  const link = document.createElement('a');
  link.download = 'radar-descontos-logo.png';
  link.href = dataUrl;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
