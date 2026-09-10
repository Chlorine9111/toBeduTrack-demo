import { NodeCompiler } from '@myriaddreamin/typst-ts-node-compiler';
const compiler = NodeCompiler.create();
const pdf = await compiler.pdf({ mainFileContent: '= Hello\nWorld' });
console.log(pdf instanceof Uint8Array, pdf.length);
