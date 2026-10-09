import React, { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { ArenaScene } from './ArenaScene.js';
import type { NetClient } from '../net/NetClient.js';
import type { PointerState } from './input.js';
import GAME from '@nobu/shared/config/game';

interface GameContainerProps {
  netClient: NetClient;
  /** Shared aim/fire state (A/B panes pass the same object). */
  pointer?: PointerState;
  /** Clients whose players this pane does not draw (A/B twins). */
  hidePlayersOf?: NetClient[];
  className?: string;
  id?: string;
}

export const GameContainer: React.FC<GameContainerProps> = ({ netClient, pointer, hidePlayersOf, className, id }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const scene = new ArenaScene({ netClient, pointer, hidePlayersOf });

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      parent: containerRef.current,
      width: GAME.arena.width,
      height: GAME.arena.height,
      backgroundColor: '#07070f',
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: GAME.arena.width,
        height: GAME.arena.height,
      },
      // Movement keys come from the page-level tracker in input.ts. Phaser's
      // keyboard manager would preventDefault them, hiding them from a second pane.
      input: { keyboard: false },
      render: {
        pixelArt: false,
        antialias: true,
        powerPreference: 'high-performance',
      },
      scene: [scene],
    };

    const game = new Phaser.Game(config);
    gameRef.current = game;

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      resizeObserver = new ResizeObserver(() => {
        if (gameRef.current?.isBooted && gameRef.current?.scale) {
          gameRef.current.scale.refresh();
        }
      });
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      resizeObserver?.disconnect();
      game.destroy(true);
      gameRef.current = null;
    };
  }, [netClient, pointer, hidePlayersOf]);

  return (
    <div
      id={id || 'game-canvas-container'}
      ref={containerRef}
      className={className || 'game-viewport'}
      style={{
        width: '100%',
        height: '100%',
        minWidth: 0,
        minHeight: 0,
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    />
  );
};
