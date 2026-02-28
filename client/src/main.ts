import { Application, Graphics } from 'pixi.js';

async function init() {
  const app = new Application();
  await app.init({
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundColor: 0x0a0a0a,
    resizeTo: window,
  });
  document.body.appendChild(app.canvas);

  // Placeholder player — blue circle
  const player = new Graphics();
  player.circle(0, 0, 8);
  player.fill(0x6688cc);
  player.x = app.screen.width / 2;
  player.y = app.screen.height / 2;
  app.stage.addChild(player);

  console.log('[client] PixiJS initialized');
}

init();
