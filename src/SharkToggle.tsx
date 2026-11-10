import { useEffect, useState } from 'react';
import { createSharkCursor } from './sharkCursor';

const KEY = 'viztailor.shark.v1';
const shark = createSharkCursor();

function load(): boolean {
  try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; }
}
function save(on: boolean) {
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* ignore */ }
}

/** 左下角開關：LouisTool 雙髻鯊簽名游標 ↔ 一般游標（預設開，記住上次選擇） */
export function SharkToggle() {
  const [on, setOn] = useState(load);

  useEffect(() => {
    if (on) shark.enable(); else shark.disable();
    return () => shark.disable();
  }, [on]);

  return (
    <button
      type="button"
      className="shark-toggle"
      data-shark-ignore=""
      aria-pressed={on}
      title={on ? '點一下換回一般游標' : '點一下啟用 LouisTool 雙髻鯊游標'}
      onClick={() => { const next = !on; save(next); setOn(next); }}
    >
      🦈 {on ? '簽名游標：開' : '一般游標'}
    </button>
  );
}
