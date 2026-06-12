import './dom-shim.js';
import { body, parseHTML, Element } from './dom-shim.js';

// sanity: does the shim's value property behave?
const inp = new Element('input');
console.log("'value' in el:", 'value' in inp);
inp.setAttribute('value', 'abc');
console.log('after setAttribute:', inp.value);
inp.value = 'typed';
console.log('after property write:', inp.value);
inp.setAttribute('value', '');
console.log('after attr clear (dirty):', JSON.stringify(inp.value), '← real DOM behaves this way too');
inp.value = '';
console.log('after property clear:', JSON.stringify(inp.value));
