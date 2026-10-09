// Registry of break-time games, in the order they appear in the GM's picker.
// To add a game, implement the contract described in common.js and list it here.

import { TetrisGame } from "./tetris.js";
import { SnakeGame } from "./snake.js";

export const GAMES = Object.fromEntries([TetrisGame, SnakeGame].map(G => [G.id, G]));
export const DEFAULT_GAME = TetrisGame.id;
