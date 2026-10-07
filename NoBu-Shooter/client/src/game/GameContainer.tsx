import React, { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { ArenaScene } from './ArenaScene.js';
import type { NetClient } from '../net/NetClient.js';
import GAME from '@nobu/shared/config/game';

interface GameContainerProps {
  netClient: NetClient;
  className?: string;
  id?: string;
}

export const GameContainer: React.FC<GameContainerProps> = ({ netClient, className, id }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const scene = new ArenaScene({ netClient });

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
      render: {
        pixelArt: false,
        antialias: true,
        powerPreference: 'high-performance',
      },
      scene: [scene],
    };

    const game = new Phaser.Game(config);
    gameRef.current = game;

    return () => {
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
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    />
  );
};
