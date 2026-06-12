import { mount, store } from 'spark-html';
import { highlightAll } from './highlight.js';

// Shared store powering the cross-component demo on the landing page
store('demo', { clicks: 0 });

await mount();
highlightAll();
