import './ui/style.css';
import { App } from './ui/App';

/**
 * Game entry. Loaded lazily by the landing page (so the landing page stays tiny and fast) or immediately
 * when the URL asks for a level (`?level=N`) or `?play`.
 */
export async function start(): Promise<App> {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const root = document.getElementById('ui') as HTMLElement;
  const app = new App(canvas, root);
  app.boot();
  // Handy for devtools / automated tests.
  (window as unknown as { app: App; game: App['game'] }).app = app;
  (window as unknown as { game: App['game'] }).game = app.game;
  return app;
}
