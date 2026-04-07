export function burstConfetti(count = 30) {
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:99999;overflow:hidden';
  document.body.appendChild(container);

  const colors = ['#6366f1', '#38bdf8', '#a855f7', '#22c55e', '#f59e0b', '#ec4899'];

  for (let i = 0; i < count; i++) {
    const dot = document.createElement('span');
    const color = colors[i % colors.length];
    const x = 40 + Math.random() * 20;
    const angle = -90 + (Math.random() - 0.5) * 120;
    const velocity = 300 + Math.random() * 400;
    const size = 4 + Math.random() * 6;
    const rotation = Math.random() * 360;

    dot.style.cssText = `
      position:absolute;
      left:${x}%;top:60%;
      width:${size}px;height:${size}px;
      background:${color};
      border-radius:${Math.random() > 0.5 ? '50%' : '2px'};
      transform:rotate(${rotation}deg);
      opacity:1;
    `;

    container.appendChild(dot);

    const rad = (angle * Math.PI) / 180;
    const vx = Math.cos(rad) * velocity;
    const vy = Math.sin(rad) * velocity;

    dot.animate([
      { transform: `translate(0,0) rotate(${rotation}deg)`, opacity: 1 },
      { transform: `translate(${vx * 0.6}px, ${vy * 0.6 + 200}px) rotate(${rotation + 360}deg)`, opacity: 0 },
    ], {
      duration: 800 + Math.random() * 600,
      easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
      fill: 'forwards',
      delay: Math.random() * 100,
    });
  }

  setTimeout(() => container.remove(), 1600);
}
