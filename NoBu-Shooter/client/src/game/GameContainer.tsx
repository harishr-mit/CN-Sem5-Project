import React, { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { ArenaScene, type ArenaSceneOptions } from './ArenaScene.js';
import type { NetClient } from '../net/NetClient.js';
import GAME from '@nobu/shared/config/game';

interface GameContainerProps {
  netClient: NetClient;
  /** Compare-view rendering options; read once at scene creation (its fields may be mutated later). */
  options?: ArenaSceneOptions;
  className?: string;
  id?: string;
}

export const GameContainer: React.FC<GameContainerProps> = ({ netClient, options, className, id }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const scene = new ArenaScene({ netClient, options });

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      parent: containerRef.current,
      width: GAME.arena.width,
      height: GAME.arena.height,
      backgroundColor: '#07070f',
      // FIT renders a full 1280×720 frame and lets CSS shrink it. Compare panes
      // instead render at their displayed size (RESIZE) and zoom the camera
      // to fit: about 4× fewer pixels per pane, which kept 4–5 panes at 60 fps.
      scale: options?.renderAtDisplaySize
        ? { mode: Phaser.Scale.RESIZE }
        : {
            mode: Phaser.Scale.FIT,
            autoCenter: Phaser.Scale.CENTER_BOTH,
            width: GAME.arena.width,
            height: GAME.arena.height,
          },
      // Movement keys come from the page-level tracker in input.ts (Quick Match)
      // or the InputDriver (Compare). Phaser's keyboard manager would
      // preventDefault captured keys, hiding them from any other listener.
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
          // refresh() reuses the cached parent size; re-measure first so the
          // canvas also grows (not only shrinks) when its host gets bigger.
          gameRef.current.scale.getParentBounds();
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
  }, [netClient]);

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
