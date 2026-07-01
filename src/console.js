import { cvEntries } from './cv.js';

// A terminal-style overlay that cycles through CV entries. For each entry it types a
// command after the prompt, then prints the output lines below, holds, fades out, and
// moves to the next — looping forever. An entry with a `url` is clickable (opens in a new
// tab) and shows a ↗ in the header. Pure DOM; independent of the three.js scene.

const CMD_MS = 34; // command typing speed (per char)
const OUT_MS = 12; // output typing speed (per char)
const LINE_GAP = 130; // pause before each new output line
const HOLD_MS = 6500; // pause once the whole card is printed (time to read)
const FADE_MS = 400; // fade-out duration between cards
const GAP_MS = 320; // pause after fade, before next card

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function mountConsole(target = document.body) {
  if (!cvEntries.length) return;

  const root = document.createElement('div');
  root.id = 'console';
  root.innerHTML = `
    <div class="console-head">
      <span class="dot"></span><span class="label">~/cv</span
      ><span class="arrow">&#8599;</span>
    </div>
    <a class="console-block" rel="noopener noreferrer" target="_blank">
      <div class="cmd"><span class="prompt">&#10148;</span><span class="cmd-text"></span></div>
      <div class="out"></div>
    </a>`;
  const bubblesEl = target.querySelector('#bubbles') ?? document.getElementById('bubbles');
  target.insertBefore(root, bubblesEl ?? null);

  const block = root.querySelector('.console-block');
  const cmdText = root.querySelector('.cmd-text');
  const outEl = root.querySelector('.out');
  const headArrow = root.querySelector('.arrow');

  // Single cursor element, moved into whichever line is currently typing.
  const cursor = document.createElement('span');
  cursor.className = 'cursor';
  cursor.innerHTML = '&#9611;';

  const reduce =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  async function typeInto(el, text, speed) {
    el.appendChild(cursor);
    if (reduce) {
      el.insertBefore(document.createTextNode(text), cursor);
      return;
    }
    for (const ch of text) {
      el.insertBefore(document.createTextNode(ch), cursor);
      await sleep(speed);
    }
  }

  async function run() {
    let i = 0;
    for (;;) {
      const entry = cvEntries[i % cvEntries.length];
      const hasLink = Boolean(entry.url);

      // Reset the card.
      block.style.transition = 'none';
      block.style.opacity = '1';
      cmdText.textContent = '';
      outEl.textContent = '';
      headArrow.style.opacity = '0';
      if (hasLink) {
        block.setAttribute('href', entry.url);
        block.classList.add('has-link');
      } else {
        block.removeAttribute('href');
        block.classList.remove('has-link');
      }

      // Type the command, then reveal the arrow if this card links out.
      await typeInto(cmdText, entry.cmd, CMD_MS);
      if (hasLink) headArrow.style.opacity = '1';

      // Print each output line.
      for (const text of entry.out) {
        const div = document.createElement('div');
        div.className = 'out-line';
        outEl.appendChild(div);
        await sleep(LINE_GAP);
        await typeInto(div, text, OUT_MS);
      }

      await sleep(HOLD_MS);

      // First pass: persist a bubble card so the user can read it later.
      if (i < cvEntries.length && bubblesEl) {
        const bubble = document.createElement(entry.url ? 'a' : 'div');
        bubble.className = 'bubble';
        if (entry.url) {
          bubble.href = entry.url;
          bubble.target = '_blank';
          bubble.rel = 'noopener noreferrer';
        }
        const cmdDiv = document.createElement('div');
        cmdDiv.className = 'b-cmd';
        cmdDiv.textContent = `❯ ${entry.cmd}`;
        bubble.appendChild(cmdDiv);
        for (const line of entry.out) {
          const outDiv = document.createElement('div');
          outDiv.className = 'b-out';
          outDiv.textContent = line;
          bubble.appendChild(outDiv);
        }
        bubblesEl.appendChild(bubble);
        requestAnimationFrame(() => bubble.classList.add('visible'));
      }

      // Fade the card out, then continue.
      block.style.transition = `opacity ${FADE_MS}ms ease`;
      block.style.opacity = '0';
      await sleep(FADE_MS + GAP_MS);
      i++;
    }
  }

  run();
}
