import { CSSProperties, useMemo, useState } from 'react';
import './App.css';

type TileType = string;

type Tile = {
  id: string;
  type: TileType;
  x: number;
  y: number;
  layer: number;
  removed: boolean;
};

type TrayItem = {
  id: string;
  type: TileType;
};

type GameStatus = 'playing' | 'won' | 'lost';

type DifficultyId = 'easy' | 'casual' | 'challenge';

type Difficulty = {
  id: DifficultyId;
  label: string;
  description: string;
  undoLimit: number;
  shuffleLimit: number;
};

const GRID_COLS = 6;
const GRID_ROWS = 6;
const TOP_COLS = 4;
const TOP_ROWS = 3;
const TOP_OFFSET_X = 1;
const TOP_OFFSET_Y = 1;
const SLOT_LIMIT = 7;
const UNLIMITED = Number.POSITIVE_INFINITY;

const TILE_TYPES: TileType[] = [
  '🐑',
  '🍀',
  '🍓',
  '🌼',
  '🍬',
  '⚡',
  '🧊',
  '🍉',
  '🔮',
  '🌙',
  '🪵',
  '🍭',
];

const DIFFICULTIES: Difficulty[] = [
  {
    id: 'easy',
    label: '无脑',
    description: '无限撤销 · 无限洗牌',
    undoLimit: UNLIMITED,
    shuffleLimit: UNLIMITED,
  },
  {
    id: 'casual',
    label: '休闲',
    description: '3次撤销 · 1次洗牌',
    undoLimit: 3,
    shuffleLimit: 1,
  },
  {
    id: 'challenge',
    label: '挑战',
    description: '无撤销 · 无洗牌',
    undoLimit: 0,
    shuffleLimit: 0,
  },
];

const cloneTiles = (tiles: Tile[]): Tile[] => tiles.map((tile) => ({ ...tile }));

const shuffleArray = <T,>(items: T[]): T[] => {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
};

const createLevel = (): Tile[] => {
  const positions: Array<Omit<Tile, 'id' | 'type' | 'removed'>> = [];
  for (let y = 0; y < GRID_ROWS; y += 1) {
    for (let x = 0; x < GRID_COLS; x += 1) {
      positions.push({ x, y, layer: 0 });
    }
  }
  for (let y = 0; y < TOP_ROWS; y += 1) {
    for (let x = 0; x < TOP_COLS; x += 1) {
      positions.push({ x: x + TOP_OFFSET_X, y: y + TOP_OFFSET_Y, layer: 1 });
    }
  }

  const tripleCount = positions.length / 3;
  const types: TileType[] = [];
  for (let i = 0; i < tripleCount; i += 1) {
    const type = TILE_TYPES[i % TILE_TYPES.length];
    types.push(type, type, type);
  }
  const shuffled = shuffleArray(types);

  return positions.map((pos, index) => ({
    id: `tile-${index}`,
    type: shuffled[index],
    ...pos,
    removed: false,
  }));
};

const isCovered = (tile: Tile, tiles: Tile[]): boolean =>
  tiles.some(
    (other) =>
      !other.removed &&
      other.layer > tile.layer &&
      other.x === tile.x &&
      other.y === tile.y,
  );

const clearTriples = (tray: TrayItem[]): TrayItem[] => {
  let updated = [...tray];
  let found = true;

  while (found) {
    found = false;
    const counts = new Map<TileType, number>();
    for (const item of updated) {
      counts.set(item.type, (counts.get(item.type) ?? 0) + 1);
    }
    const tripleType = [...counts.entries()].find(([, count]) => count >= 3)?.[0];
    if (tripleType) {
      let removed = 0;
      updated = updated.filter((item) => {
        if (item.type === tripleType && removed < 3) {
          removed += 1;
          return false;
        }
        return true;
      });
      found = true;
    }
  }

  return updated;
};

const computeStatus = (tiles: Tile[], tray: TrayItem[]): GameStatus => {
  const remaining = tiles.some((tile) => !tile.removed);
  if (!remaining && tray.length === 0) return 'won';
  if (!remaining && tray.length > 0) return 'lost';
  if (tray.length > SLOT_LIMIT) return 'lost';
  return 'playing';
};

export default function App() {
  const [tiles, setTiles] = useState<Tile[]>(() => createLevel());
  const [tray, setTray] = useState<TrayItem[]>([]);
  const [history, setHistory] = useState<
    Array<{ tiles: Tile[]; tray: TrayItem[]; status: GameStatus }>
  >([]);
  const [status, setStatus] = useState<GameStatus>('playing');
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
  const [undoUsed, setUndoUsed] = useState(0);
  const [shuffleUsed, setShuffleUsed] = useState(0);

  const remainingCount = useMemo(
    () => tiles.filter((tile) => !tile.removed).length,
    [tiles],
  );

  const difficultyLabel = difficulty ? difficulty.label : '未选择';
  const undoLimit = difficulty?.undoLimit ?? 0;
  const shuffleLimit = difficulty?.shuffleLimit ?? 0;
  const undoRemainingLabel = difficulty
    ? undoLimit === UNLIMITED
      ? '∞'
      : String(Math.max(0, undoLimit - undoUsed))
    : '--';
  const shuffleRemainingLabel = difficulty
    ? shuffleLimit === UNLIMITED
      ? '∞'
      : String(Math.max(0, shuffleLimit - shuffleUsed))
    : '--';
  const canUndo =
    !!difficulty && history.length > 0 && (undoLimit === UNLIMITED || undoUsed < undoLimit);
  const canShuffle =
    !!difficulty &&
    status === 'playing' &&
    (shuffleLimit === UNLIMITED || shuffleUsed < shuffleLimit);

  const resetGame = (nextDifficulty: Difficulty | null) => {
    setTiles(createLevel());
    setTray([]);
    setHistory([]);
    setStatus('playing');
    setUndoUsed(0);
    setShuffleUsed(0);
    setDifficulty(nextDifficulty);
  };

  const pushHistory = () => {
    setHistory((prev) => [...prev, { tiles: cloneTiles(tiles), tray: [...tray], status }]);
  };

  const handleTileClick = (id: string) => {
    if (status !== 'playing') return;
    if (!difficulty) return;

    const tile = tiles.find((current) => current.id === id);
    if (!tile || tile.removed) return;
    if (isCovered(tile, tiles)) return;

    pushHistory();

    const nextTiles = tiles.map((current) =>
      current.id === tile.id ? { ...current, removed: true } : current,
    );

    const nextTray = clearTriples([...tray, { id: tile.id, type: tile.type }]);
    const nextStatus = computeStatus(nextTiles, nextTray);

    setTiles(nextTiles);
    setTray(nextTray);
    setStatus(nextStatus);
  };

  const handleUndo = () => {
    if (!canUndo) return;
    setHistory((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setTiles(cloneTiles(last.tiles));
      setTray([...last.tray]);
      setStatus(last.status);
      return prev.slice(0, -1);
    });
    if (undoLimit !== UNLIMITED) {
      setUndoUsed((prev) => prev + 1);
    }
  };

  const handleShuffle = () => {
    if (!canShuffle) return;

    const remainingTiles = tiles.filter((tile) => !tile.removed);
    if (remainingTiles.length === 0) return;

    pushHistory();

    const shuffledTypes = shuffleArray(remainingTiles.map((tile) => tile.type));
    let index = 0;
    const nextTiles = tiles.map((tile) => {
      if (tile.removed) return tile;
      const nextType = shuffledTypes[index];
      index += 1;
      return { ...tile, type: nextType };
    });

    setTiles(nextTiles);
    if (shuffleLimit !== UNLIMITED) {
      setShuffleUsed((prev) => prev + 1);
    }
  };

  const handleSelectDifficulty = (nextDifficulty: Difficulty) => {
    resetGame(nextDifficulty);
  };

  const handleReset = () => {
    if (!difficulty) return;
    resetGame(difficulty);
  };

  const statusLabel = !difficulty
    ? '等待选择'
    : status === 'won'
      ? '胜利！'
      : status === 'lost'
        ? '失败了'
        : '进行中';

  return (
    <div className="app">
      <header className="header">
        <div>
          <p className="eyebrow">SHEEP MATCH</p>
          <h1>羊了个羊 · 双层迷你关</h1>
          <p className="subtle">
            点击可见最上层的方块，凑齐 3 个相同图标即可消除。托盘最多 {SLOT_LIMIT} 格。
          </p>
        </div>
        <div className={`status-pill status-${status}`}>
          <span className="dot" />
          <span>{statusLabel}</span>
        </div>
      </header>

      <section className="panel">
        <div className="stats">
          <div>
            <div className="stat-value">{remainingCount}</div>
            <div className="stat-label">剩余方块</div>
          </div>
          <div>
            <div className="stat-value">{tray.length}</div>
            <div className="stat-label">托盘占用</div>
          </div>
          <div>
            <div className="stat-value">{difficultyLabel}</div>
            <div className="stat-label">难度</div>
          </div>
        </div>
        <div className="controls">
          <button type="button" onClick={handleUndo} disabled={!canUndo}>
            撤销 <span className="count">{undoRemainingLabel}</span>
          </button>
          <button type="button" onClick={handleShuffle} disabled={!canShuffle}>
            洗牌 <span className="count">{shuffleRemainingLabel}</span>
          </button>
          <button type="button" onClick={handleReset} disabled={!difficulty}>
            重开
          </button>
        </div>
      </section>

      <section className="board-shell">
        <div
          className="board"
          style={
            {
              '--board-cols': GRID_COLS,
              '--board-rows': GRID_ROWS,
            } as CSSProperties
          }
        >
          {tiles
            .filter((tile) => !tile.removed)
            .map((tile) => {
              const blocked = isCovered(tile, tiles);
              return (
                <button
                  key={tile.id}
                  type="button"
                  className={`tile layer-${tile.layer} ${blocked ? 'blocked' : ''}`}
                  style={
                    {
                      left: `calc(var(--tile-size) * ${tile.x} + var(--layer-offset) * ${tile.layer})`,
                      top: `calc(var(--tile-size) * ${tile.y} + var(--layer-offset) * ${tile.layer})`,
                      zIndex: tile.layer + 1,
                    } as CSSProperties
                  }
                  onClick={() => handleTileClick(tile.id)}
                  disabled={blocked || status !== 'playing'}
                  aria-label={`tile ${tile.type}`}
                >
                  <span className="tile-face">{tile.type}</span>
                  <span className="tile-shadow" />
                </button>
              );
            })}
        </div>

        {!difficulty && (
          <div className="overlay overlay-start">
            <div className="overlay-card overlay-card-start">
              <p className="eyebrow">选择难度</p>
              <h2>开局难度</h2>
              <p className="subtle">不同难度限制撤销与洗牌次数。</p>
              <div className="difficulty-grid">
                {DIFFICULTIES.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={`difficulty-card difficulty-${option.id}`}
                    onClick={() => handleSelectDifficulty(option)}
                  >
                    <span className="difficulty-title">{option.label}</span>
                    <span className="difficulty-desc">{option.description}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {(status === 'won' || status === 'lost') && (
          <div className="overlay">
            <div className="overlay-card">
              <h2>{status === 'won' ? '漂亮！' : '再来一局？'}</h2>
              <p>{status === 'won' ? '本关已经被你清空。' : '托盘溢出或无法继续。'}</p>
              <button type="button" onClick={handleReset}>
                重新挑战
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="tray">
        <div className="tray-label">托盘 (最多 {SLOT_LIMIT} 格)</div>
        <div className="tray-slots">
          {Array.from({ length: SLOT_LIMIT }).map((_, slotIndex) => {
            const item = tray[slotIndex];
            return (
              <div key={`slot-${slotIndex}`} className="tray-slot">
                {item ? <span>{item.type}</span> : <span className="ghost">•</span>}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
