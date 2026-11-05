import './ui/style.css';
import { Game } from './core/Game';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;
const game = new Game(canvas, ui);
game.start();
// Handy for devtools / automated tests.
(window as unknown as { game: Game }).game = game;
