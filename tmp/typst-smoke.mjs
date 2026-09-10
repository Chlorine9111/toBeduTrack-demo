import { $typst } from '@myriaddreamin/typst.ts/contrib/snippet';
const pdf = await $typst.pdf({ mainContent: '= Hello\nWorld' });
console.log(pdf instanceof Uint8Array, pdf.length);
