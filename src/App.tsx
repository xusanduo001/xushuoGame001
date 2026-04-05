/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { Trophy, Play, RotateCcw, Coins, Heart } from 'lucide-react';

// 游戏常量
const CANVAS_WIDTH = 400;
const CANVAS_HEIGHT = 600;
const GRAVITY = 0.6;
const JUMP_FORCE = -12;
const GROUND_Y = 500;
const PLAYER_SIZE = 40;
const OBSTACLE_SPEED = 5;
const COIN_SIZE = 25;
const BOOST_PAD_WIDTH = 60;
const BOOST_PAD_HEIGHT = 10;
const JETPACK_SIZE = 30;

type GameState = 'START' | 'PLAYING' | 'GAMEOVER';

interface Obstacle {
  x: number;
  width: number;
  height: number;
}

interface BoostPad {
  x: number;
  width: number;
  collected: boolean;
}

interface Jetpack {
  x: number;
  y: number;
  collected: boolean;
}

interface Coin {
  x: number;
  y: number;
  collected: boolean;
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [playerImage, setPlayerImage] = useState<HTMLImageElement | null>(null);
  const [gameState, setGameState] = useState<GameState>('START');
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [lives, setLives] = useState(3);

  // 初始化图片加载
  useEffect(() => {
    const img = new Image();
    // 使用一个更稳定的儿童头像占位符，模拟您的照片效果
    img.src = 'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix'; 
    img.onload = () => {
      setPlayerImage(img);
      console.log("头像加载成功！");
    };
    img.onerror = () => {
      console.error("头像加载失败，请检查网络或链接。");
    };
  }, []);

  // 游戏内部状态
  const gameRef = useRef({
    playerY: GROUND_Y - PLAYER_SIZE,
    playerVY: 0,
    jumpsCount: 0,
    obstacles: [] as Obstacle[],
    boostPads: [] as BoostPad[],
    jetpacks: [] as Jetpack[],
    coins: [] as Coin[],
    frame: 0,
    distance: 0,
    score: 0,
    policeX: -10, // 警车初始位置，使其可见
    stunTimer: 0,   // 被尖刺扎到后的暂停计时器
    jetpackTimer: 0, // 喷气背包计时器
    lives: 3,
    obstacleCount: 0,
    lastTime: 0,
    spawnTimer: 0,
    coinTimer: 0
  });

  // 开始游戏
  const startGame = () => {
    gameRef.current = {
      playerY: GROUND_Y - PLAYER_SIZE,
      playerVY: 0,
      jumpsCount: 0,
      obstacles: [],
      boostPads: [],
      jetpacks: [],
      coins: [],
      frame: 0,
      distance: 0,
      score: 0,
      policeX: -10,
      stunTimer: 0,
      jetpackTimer: 0,
      lives: 3,
      obstacleCount: 0,
      lastTime: 0,
      spawnTimer: 0,
      coinTimer: 0
    };
    setScore(0);
    setLives(3);
    setGameState('PLAYING');
  };

  // 跳跃逻辑 (支持四段跳)
  const jump = () => {
    if (gameState !== 'PLAYING') return;
    if (gameRef.current.jumpsCount < 4) {
      gameRef.current.playerVY = JUMP_FORCE;
      gameRef.current.jumpsCount++;
    }
  };

  // 键盘监听
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        if (gameState === 'START' || gameState === 'GAMEOVER') {
          startGame();
        } else {
          jump();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState]);

  // 游戏主循环
  useEffect(() => {
    if (gameState !== 'PLAYING') return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;

    const update = (time: number) => {
      const g = gameRef.current;
      
      // 计算时间增量 (以 60FPS 为基准)
      if (!g.lastTime) g.lastTime = time;
      const deltaTime = (time - g.lastTime) / (1000 / 60);
      g.lastTime = time;

      // 限制 deltaTime 防止切屏回来后产生巨大的跳跃
      const dt = Math.min(deltaTime, 3);

      g.frame += dt;

      // 1. 物理更新
      if (g.jetpackTimer > 0) {
        g.playerY = 200; // 悬空高度
        g.playerVY = 0;
      } else {
        g.playerVY += GRAVITY * dt;
        g.playerY += g.playerVY * dt;
      }

      if (g.playerY > GROUND_Y - PLAYER_SIZE) {
        g.playerY = GROUND_Y - PLAYER_SIZE;
        g.playerVY = 0;
        g.jumpsCount = 0; // 落地重置跳跃次数
      }

      // 2. 警车逻辑
      if (g.stunTimer > 0) {
        // 只有在玩家被暂停（碰到尖刺）时，警车才靠近
        g.policeX += 0.15 * dt; 
      }
      
      // 喷气背包期间警车退后
      if (g.jetpackTimer > 0) {
        if (g.policeX > -10) g.policeX -= 0.5 * dt;
        g.jetpackTimer -= dt;
      }
      
      // 警车追上玩家
      if (g.stunTimer <= 0 && g.policeX >= 50 - PLAYER_SIZE) {
        if (g.lives > 1) {
          g.lives--;
          setLives(g.lives);
          g.policeX = -20;
        } else {
          setGameState('GAMEOVER');
          if (g.score > highScore) setHighScore(g.score);
          return;
        }
      }

      // 3. 暂停逻辑 (碰到尖刺)
      if (g.stunTimer > 0) {
        g.stunTimer -= dt;
      }

      // 4. 生成障碍物 (使用计时器替代帧数取模，更稳定)
      g.spawnTimer += dt;
      if (g.spawnTimer >= 100) {
        g.spawnTimer = 0;
        g.obstacleCount++;
        if (g.obstacleCount % 15 === 0) {
          g.jetpacks.push({
            x: CANVAS_WIDTH,
            y: 150 + Math.random() * 100,
            collected: false
          });
        } else if (g.obstacleCount % 10 === 0) {
          g.boostPads.push({
            x: CANVAS_WIDTH,
            width: BOOST_PAD_WIDTH,
            collected: false
          });
        } else {
          g.obstacles.push({
            x: CANVAS_WIDTH,
            width: 40,
            height: 30
          });
        }
      }

      // 5. 生成金币
      g.coinTimer += dt;
      if (g.coinTimer >= 60) {
        g.coinTimer = 0;
        const isHigh = Math.random() > 0.6;
        const coinY = isHigh 
          ? 100 + Math.random() * 100
          : GROUND_Y - 100 - Math.random() * 150;
          
        g.coins.push({
          x: CANVAS_WIDTH,
          y: coinY,
          collected: false
        });
      }

      // 6. 更新位置 (如果被暂停，马路不滚动)
      if (g.stunTimer <= 0) {
        const moveSpeed = OBSTACLE_SPEED * dt;
        g.obstacles.forEach(obs => obs.x -= moveSpeed);
        g.coins.forEach(coin => coin.x -= moveSpeed);
        g.boostPads.forEach(pad => pad.x -= moveSpeed);
        g.jetpacks.forEach(jp => jp.x -= moveSpeed);
      }

      // 7. 移除屏幕外的元素
      g.obstacles = g.obstacles.filter(obs => obs.x + obs.width > 0);
      g.coins = g.coins.filter(coin => coin.x + COIN_SIZE > 0);
      g.boostPads = g.boostPads.filter(pad => pad.x + pad.width > 0);
      g.jetpacks = g.jetpacks.filter(jp => jp.x + JETPACK_SIZE > 0);

      // 8. 碰撞检测 - 尖刺 (碰到暂停2秒并扣血)
      if (g.jetpackTimer === 0) {
        for (let i = 0; i < g.obstacles.length; i++) {
          const obs = g.obstacles[i];
          if (
            50 + PLAYER_SIZE > obs.x &&
            50 < obs.x + obs.width &&
            g.playerY + PLAYER_SIZE > GROUND_Y - obs.height
          ) {
            // 碰到尖刺，扣除一条命
            if (g.lives > 1) {
              g.lives--;
              setLives(g.lives);
              g.stunTimer = 120; // 暂停 2 秒
              g.policeX = -20;   // 撞到尖刺时，警车也退后一点，防止瞬间双重扣血
            } else {
              setGameState('GAMEOVER');
              if (g.score > highScore) setHighScore(g.score);
              return;
            }
            // 移除该尖刺防止重复触发
            g.obstacles.splice(i, 1);
            i--;
          }
        }
      }

      // 9. 碰撞检测 - 金币
      for (const coin of g.coins) {
        if (!coin.collected &&
          50 + PLAYER_SIZE > coin.x &&
          50 < coin.x + COIN_SIZE &&
          g.playerY < coin.y + COIN_SIZE &&
          g.playerY + PLAYER_SIZE > coin.y
        ) {
          coin.collected = true;
          g.score += 10;
          setScore(g.score);
        }
      }

      // 10. 碰撞检测 - 加速带
      for (const pad of g.boostPads) {
        if (!pad.collected &&
          50 + PLAYER_SIZE > pad.x &&
          50 < pad.x + pad.width &&
          g.playerY + PLAYER_SIZE > GROUND_Y - BOOST_PAD_HEIGHT
        ) {
          pad.collected = true;
          g.lives++; // 增加一条命
          setLives(g.lives);
          g.policeX = -10; // 甩开警车
          g.score += 50; // 加速带额外加分
          setScore(g.score);
        }
      }

      // 11. 碰撞检测 - 喷气背包
      for (const jp of g.jetpacks) {
        if (!jp.collected &&
          50 + PLAYER_SIZE > jp.x &&
          50 < jp.x + JETPACK_SIZE &&
          g.playerY < jp.y + JETPACK_SIZE &&
          g.playerY + PLAYER_SIZE > jp.y
        ) {
          jp.collected = true;
          g.jetpackTimer = 300; // 喷气时间 (约5秒，足够避开3个障碍)
          g.score += 100;
          setScore(g.score);
        }
      }

      // 8. 绘制
      draw(ctx);
      animationId = requestAnimationFrame(update);
    };

    const draw = (ctx: CanvasRenderingContext2D) => {
      const g = gameRef.current;
      
      // 背景 - 城市天空
      ctx.fillStyle = '#1a2a6c'; // 深蓝色夜空
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // 绘制城市剪影
      const drawBuildings = (offset: number, speed: number, color: string, count: number, width: number, spacing: number) => {
        ctx.fillStyle = color;
        const totalWidth = count * spacing;
        for (let i = 0; i < count; i++) {
          // 修正负数取模逻辑，确保背景循环无缝
          let x = (i * spacing + g.frame * speed + offset) % totalWidth;
          if (x < 0) x += totalWidth;
          x -= spacing; // 允许从屏幕左侧边缘外开始绘制
          
          const h = 120 + (Math.sin(i * 1.5 + offset) + 1) * 100;
          ctx.fillRect(x, GROUND_Y - h, width, h);
          // 窗户
          ctx.fillStyle = 'rgba(255, 255, 0, 0.2)';
          for (let j = 0; j < h / 25; j++) {
            ctx.fillRect(x + 10, GROUND_Y - h + 10 + j * 25, 10, 10);
            if (width > 30) {
              ctx.fillRect(x + width - 20, GROUND_Y - h + 10 + j * 25, 10, 10);
            }
          }
          ctx.fillStyle = color;
        }
      };
      // 远景 - 较慢，较暗
      drawBuildings(0, -0.3, '#1a252f', 15, 60, 80);
      // 中景 - 稍快
      drawBuildings(40, -0.7, '#2c3e50', 12, 70, 100);
      // 近景 - 最快，最暗
      drawBuildings(20, -1.2, '#1c2833', 10, 80, 120);

      // 地面 - 马路
      ctx.fillStyle = '#333';
      ctx.fillRect(0, GROUND_Y, CANVAS_WIDTH, CANVAS_HEIGHT - GROUND_Y);
      
      // 绘制加速带
      g.boostPads.forEach(pad => {
        if (!pad.collected) {
          const gradient = ctx.createLinearGradient(pad.x, GROUND_Y, pad.x, GROUND_Y + BOOST_PAD_HEIGHT);
          gradient.addColorStop(0, '#2ecc71');
          gradient.addColorStop(1, '#27ae60');
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.roundRect(pad.x, GROUND_Y - 5, pad.width, 10, 5);
          ctx.fill();
          
          // 加速箭头
          ctx.strokeStyle = 'white';
          ctx.lineWidth = 2;
          for (let i = 0; i < 3; i++) {
            const ax = pad.x + 15 + i * 15;
            ctx.beginPath();
            ctx.moveTo(ax, GROUND_Y);
            ctx.lineTo(ax + 10, GROUND_Y - 5);
            ctx.lineTo(ax, GROUND_Y - 10);
            ctx.stroke();
          }
        }
      });
      
      // 马路虚线
      ctx.strokeStyle = 'white';
      ctx.setLineDash([20, 20]);
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(0, GROUND_Y + 40);
      ctx.lineTo(CANVAS_WIDTH, GROUND_Y + 40);
      ctx.stroke();
      ctx.setLineDash([]);

      // 角色 (小汽车)
      const px = 50;
      const py = g.playerY;
      
      ctx.save();
      // 喷气效果 (火箭尾焰)
      if (g.jetpackTimer > 0) {
        ctx.save();
        const flicker = Math.random() * 10;
        const flameLen = 40 + flicker;
        
        // 核心火焰 (亮黄到橙)
        const grad = ctx.createLinearGradient(px, py + 25, px - flameLen, py + 25);
        grad.addColorStop(0, '#f1c40f'); // 亮黄
        grad.addColorStop(0.5, '#e67e22'); // 橙色
        grad.addColorStop(1, 'rgba(231, 76, 60, 0)'); // 透明红
        
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(px, py + 15);
        ctx.lineTo(px - flameLen, py + 25);
        ctx.lineTo(px, py + 35);
        ctx.closePath();
        ctx.fill();
        
        // 内部核心 (白色)
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(px, py + 20);
        ctx.lineTo(px - flameLen * 0.5, py + 25);
        ctx.lineTo(px, py + 30);
        ctx.closePath();
        ctx.fill();
        
        // 火星
        ctx.fillStyle = '#e67e22';
        for (let i = 0; i < 3; i++) {
          const fx = px - 10 - Math.random() * 30;
          const fy = py + 20 + Math.random() * 10;
          ctx.beginPath();
          ctx.arc(fx, fy, 2 + Math.random() * 4, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      
      if (g.jetpackTimer > 0) {
        // 绘制小飞机
        ctx.save();
        ctx.translate(px, py);
        
        // 机身 (流线型)
        ctx.fillStyle = '#3498db'; // 蓝色机身
        ctx.beginPath();
        ctx.roundRect(0, 10, PLAYER_SIZE + 5, 20, 10);
        ctx.fill();
        
        // 机翼 (主翼)
        ctx.fillStyle = '#2980b9';
        ctx.beginPath();
        ctx.moveTo(15, 10);
        ctx.lineTo(5, -5);
        ctx.lineTo(25, -5);
        ctx.lineTo(35, 10);
        ctx.fill();
        
        // 尾翼
        ctx.beginPath();
        ctx.moveTo(5, 10);
        ctx.lineTo(0, 0);
        ctx.lineTo(10, 0);
        ctx.lineTo(15, 10);
        ctx.fill();
        
        // 驾驶舱 (玻璃)
        ctx.fillStyle = '#87CEEB';
        ctx.beginPath();
        ctx.arc(PLAYER_SIZE - 5, 15, 6, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
      } else {
        // 车身
        ctx.fillStyle = '#e74c3c'; // 红色车身
        ctx.beginPath();
        ctx.roundRect(px, py + 10, PLAYER_SIZE, PLAYER_SIZE - 20, 5);
        ctx.fill();
        // 车顶
        ctx.fillStyle = '#c0392b';
        ctx.beginPath();
        ctx.roundRect(px + 5, py, PLAYER_SIZE - 15, 15, 5);
        ctx.fill();
        // 车窗
        ctx.fillStyle = '#87CEEB';
        ctx.fillRect(px + 10, py + 3, PLAYER_SIZE - 25, 8);
        // 轮子
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(px + 10, py + PLAYER_SIZE - 5, 6, 0, Math.PI * 2);
        ctx.arc(px + PLAYER_SIZE - 10, py + PLAYER_SIZE - 5, 6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // 障碍物 (尖刺)
      g.obstacles.forEach(obs => {
        ctx.fillStyle = '#95a5a6'; // 灰色
        ctx.beginPath();
        // 绘制三个小尖刺
        const spikeCount = 3;
        const spikeWidth = obs.width / spikeCount;
        for (let i = 0; i < spikeCount; i++) {
          ctx.moveTo(obs.x + i * spikeWidth, GROUND_Y);
          ctx.lineTo(obs.x + (i + 0.5) * spikeWidth, GROUND_Y - obs.height);
          ctx.lineTo(obs.x + (i + 1) * spikeWidth, GROUND_Y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#333';
        ctx.stroke();
      });

      // 警车
      const pX = g.policeX;
      const pY = GROUND_Y - PLAYER_SIZE;
      ctx.save();
      // 警车车身
      ctx.fillStyle = '#2980b9'; // 蓝色
      ctx.beginPath();
      ctx.roundRect(pX, pY + 10, PLAYER_SIZE, PLAYER_SIZE - 20, 5);
      ctx.fill();
      // 白条
      ctx.fillStyle = '#fff';
      ctx.fillRect(pX + 10, pY + 15, PLAYER_SIZE - 20, 10);
      // 警灯
      const lightOn = Math.floor(g.frame / 10) % 2 === 0;
      ctx.fillStyle = lightOn ? '#e74c3c' : '#3498db';
      ctx.beginPath();
      ctx.roundRect(pX + 15, pY, PLAYER_SIZE - 30, 10, 2);
      ctx.fill();
      // 轮子
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(pX + 10, pY + PLAYER_SIZE - 5, 6, 0, Math.PI * 2);
      ctx.arc(pX + PLAYER_SIZE - 10, pY + PLAYER_SIZE - 5, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // 金币
      g.coins.forEach(coin => {
        if (!coin.collected) {
          ctx.fillStyle = '#FFD700';
          ctx.beginPath();
          ctx.arc(coin.x + COIN_SIZE / 2, coin.y + COIN_SIZE / 2, COIN_SIZE / 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#B8860B';
          ctx.lineWidth = 2;
          ctx.stroke();
          // 金币中间的符号
          ctx.fillStyle = '#B8860B';
          ctx.font = 'bold 16px Arial';
          ctx.textAlign = 'center';
          ctx.fillText('$', coin.x + COIN_SIZE / 2, coin.y + COIN_SIZE / 2 + 6);
        }
      });

      // 喷气背包
      g.jetpacks.forEach(jp => {
        if (!jp.collected) {
          ctx.fillStyle = '#9b59b6'; // 紫色
          ctx.beginPath();
          ctx.roundRect(jp.x, jp.y, JETPACK_SIZE, JETPACK_SIZE, 5);
          ctx.fill();
          // 装饰
          ctx.fillStyle = '#fff';
          ctx.fillRect(jp.x + 5, jp.y + 5, JETPACK_SIZE - 10, 5);
          ctx.fillStyle = '#e74c3c';
          ctx.fillRect(jp.x + 10, jp.y + 15, JETPACK_SIZE - 20, 10);
        }
      });
    };

    animationId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(animationId);
  }, [gameState, highScore]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-100 font-sans select-none overflow-hidden touch-none">
      <div className="relative shadow-2xl rounded-3xl overflow-hidden bg-white border-8 border-white">
        {/* 游戏画布 */}
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          onClick={jump}
          className="block cursor-pointer"
        />

        {/* 分数显示 */}
        <div className="absolute top-4 left-4 right-4 flex flex-col gap-2 pointer-events-none">
          <div className="flex justify-between items-center w-full">
            <div className="bg-white/80 backdrop-blur px-4 py-2 rounded-full flex items-center gap-2 shadow-sm">
              <Coins className="w-5 h-5 text-yellow-500" />
              <span className="font-bold text-xl text-slate-700">{score}</span>
            </div>
            <div className="bg-white/80 backdrop-blur px-4 py-2 rounded-full flex items-center gap-2 shadow-sm">
              <Trophy className="w-5 h-5 text-orange-500" />
              <span className="font-bold text-xl text-slate-700">{highScore}</span>
            </div>
          </div>
          <div className="bg-white/80 backdrop-blur px-4 py-2 rounded-full flex items-center gap-2 shadow-sm self-start">
            <span className="font-bold text-sm text-slate-500 uppercase tracking-wider">Lives</span>
            <div className="flex gap-1">
              {Array.from({ length: Math.min(lives, 5) }).map((_, i) => (
                <Heart key={i} className="w-4 h-4 text-red-500 fill-red-500" />
              ))}
              {lives > 5 && <span className="text-slate-700 font-bold text-xs">+{lives - 5}</span>}
            </div>
          </div>
        </div>

        {/* 开始界面 */}
        {gameState === 'START' && (
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex flex-col items-center justify-center text-white p-6 text-center">
            <h1 className="text-4xl font-black mb-4 drop-shadow-lg">小车跑酷</h1>
            <p className="text-lg mb-8 opacity-90">点击屏幕或按空格键跳跃<br/>躲避障碍物，收集金币！</p>
            <button
              onClick={startGame}
              className="bg-green-500 hover:bg-green-400 active:scale-95 transition-all px-8 py-4 rounded-2xl font-bold text-2xl flex items-center gap-3 shadow-xl"
            >
              <Play className="fill-current" /> 开始游戏
            </button>
          </div>
        )}

        {/* 游戏结束界面 */}
        {gameState === 'GAMEOVER' && (
          <div className="absolute inset-0 bg-red-500/80 backdrop-blur-md flex flex-col items-center justify-center text-white p-6 text-center">
            <h2 className="text-5xl font-black mb-2">游戏结束</h2>
            <div className="bg-white/20 rounded-3xl p-6 mb-8 w-full max-w-[250px]">
              <p className="text-xl opacity-80 mb-1">本次得分</p>
              <p className="text-6xl font-black mb-4">{score}</p>
              <p className="text-sm opacity-80">最高纪录: {highScore}</p>
            </div>
            <button
              onClick={startGame}
              className="bg-white text-red-500 hover:bg-slate-100 active:scale-95 transition-all px-8 py-4 rounded-2xl font-bold text-2xl flex items-center gap-3 shadow-xl"
            >
              <RotateCcw /> 再玩一次
            </button>
          </div>
        )}
      </div>

      <div className="mt-8 text-slate-400 text-sm font-medium">
        适合 9 岁儿童 • 简单安全 • 快乐运动
      </div>
    </div>
  );
}
