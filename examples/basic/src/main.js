import { mount, store } from 'spark-html';

// Shared state — any component can subscribe with useStore('cart')
store('cart', { items: [], total: 0 });

mount();
