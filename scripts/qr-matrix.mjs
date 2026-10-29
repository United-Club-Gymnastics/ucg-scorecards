// Dev only: print a sheet link's QR modules as JSON (rows of 0/1), for scripts/test-card.py. Same settings as ucg-lineups.
import qrcode from 'qrcode-generator';

const q = qrcode(0, 'M');
q.addData(process.argv[2], 'Byte');
q.make();
const n = q.getModuleCount();
console.log(JSON.stringify(Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => (q.isDark(r, c) ? 1 : 0)))));
