/**
 * End-to-end reproduction of the shop/cart bug using the DOM shim.
 */
import './dom-shim.js';
import { body } from './dom-shim.js';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const comp = (n) => readFileSync(join(__dir, '../../../examples/basic/components', n), 'utf8');

const { mount, component, store } = await import('../src/index.js');

// register components from the real example files
component('components/shop', comp('shop.html'));
component('components/cart', comp('cart.html'));

store('cart', { items: [], total: 0 });

body.innerHTML = `
  <div import="components/shop"></div>
  <div import="components/cart"></div>
`;

await mount();
await new Promise((r) => setTimeout(r, 20)); // let rAF patches flush

const shopEl = body.querySelector('[name]');
console.log('\n── after mount ──');

const buttons = () => body.querySelectorAll('button').filter((b) => b.getAttribute('class') === 'item');
console.log('shop buttons:', buttons().length);
for (const b of buttons()) {
  console.log(`  text="${b.textContent.trim()}" data-name="${b.getAttribute('data-name')}" data-price="${b.getAttribute('data-price')}"`);
}

console.log('\n── click Coffee ──');
buttons()[0].dispatch('click');
await new Promise((r) => setTimeout(r, 20));

const cartStore = store('cart');
console.log('store.items:', JSON.stringify(cartStore.items));
console.log('store.total:', cartStore.total);

console.log('\n── buttons after the store-triggered re-patch ──');
for (const b of buttons()) {
  console.log(`  text="${b.textContent.trim()}" data-name="${b.getAttribute('data-name')}" data-price="${b.getAttribute('data-price')}"`);
}

console.log('\n── click Croissant (second click) ──');
const croissant = buttons().find((b) => b.textContent.includes('Croissant'));
croissant.dispatch('click');
await new Promise((r) => setTimeout(r, 20));
console.log('store.items:', JSON.stringify(cartStore.items));
console.log('store.total:', cartStore.total);

// what does the cart actually render?
console.log('\n── cart li contents ──');
const lis = body.querySelectorAll('li');
lis.forEach((li, i) => console.log(`  li[${i}]: "${li.textContent}"`));
